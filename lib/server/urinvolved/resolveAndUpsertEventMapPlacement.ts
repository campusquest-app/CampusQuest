/**
 * Canonical server-side pipeline: resolve one external event's map placement
 * and upsert the override. Called after every sync create/update and by
 * admin repair / reconciliation. Never depends on the client opening the map.
 */

import { revalidatePath } from "next/cache";
import type { CatalogLocationLike } from "@/lib/server/urinvolved/mapEventLocationTypes";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { createAdminClient } from "@/lib/server/supabase";
import { isValidCampusCoordinate } from "@/lib/campusLocations";
import { isWithinUriCampusBounds } from "@/lib/server/urinvolved/uriCampusBounds";
import {
  loadOverridesForEventIds,
  upsertAutoPlacementOverride,
  type ExternalEventMapOverrideRow,
  type ExternalEventMapMatchStatus,
} from "@/lib/server/externalEventMapOverrides";
import { normalizeEventLocationText } from "@/lib/server/urinvolved/eventLocationMatcher";
import { extractBuildingName, normalizeCampusLocationName } from "@/lib/server/urinvolved/normalizeCampusLocationName";
import { effectiveEventEndIso, isEventVisibleOnMap } from "@/lib/realm/eventVisibility";

export type PlacementPipelineResult = {
  externalEventId: string;
  externalId: string;
  title: string;
  rawLocation: string;
  normalizedLocation: string;
  parentBuilding: string | null;
  matchedBuilding: string | null;
  latitude: number | null;
  longitude: number | null;
  matchStatus: ExternalEventMapMatchStatus | null;
  renderOnMap: boolean;
  visibleOnMapToday: boolean;
  failureReason: string | null;
  override: ExternalEventMapOverrideRow | null;
};

const ONLINE_LOCATION_RE =
  /\b(online|virtual|zoom|microsoft\s*teams|webex|google\s*meet|livestream|live\s*stream)\b/i;

async function catalogFromDb(): Promise<CatalogLocationLike[]> {
  const rows = await getCampusLocations({ refreshCache: true });
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    shortLabel: row.shortLabel,
  }));
}

function logPipeline(result: PlacementPipelineResult): void {
  const payload = {
    externalEventId: result.externalEventId,
    externalId: result.externalId,
    title: result.title,
    rawLocation: result.rawLocation,
    normalizedLocation: result.normalizedLocation,
    parentBuilding: result.parentBuilding,
    matchedBuilding: result.matchedBuilding,
    latitude: result.latitude,
    longitude: result.longitude,
    matchStatus: result.matchStatus,
    markerResult: result.renderOnMap ? "created_or_updated" : "no_marker",
    visibilityResult: result.visibleOnMapToday ? "visible" : "not_visible_today",
    failureReason: result.failureReason,
  };
  if (result.failureReason) {
    console.warn("[cq:event-map-placement] unresolved", payload);
  } else {
    console.info("[cq:event-map-placement] ok", payload);
  }
}

function coordsAreUsable(latitude: number, longitude: number): boolean {
  if (latitude === 0 && longitude === 0) return false;
  if (!isValidCampusCoordinate(latitude, longitude)) return false;
  if (!isWithinUriCampusBounds(latitude, longitude)) return false;
  return true;
}

/**
 * Resolve and upsert map placement for a single external event by UUID.
 * Idempotent — resync updates the same override row (unique on external_event_id).
 */
export async function resolveAndUpsertEventMapPlacement(
  eventId: string,
  options?: {
    catalog?: CatalogLocationLike[];
    forceGoogle?: boolean;
    revalidate?: boolean;
  },
): Promise<PlacementPipelineResult> {
  const admin = createAdminClient();
  const { data: event, error } = await admin
    .from("external_events")
    .select(
      "id, external_id, title, venue_name, location_name, address, starts_at, ends_at, latitude, longitude, is_active, tags, source",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) {
    const failure: PlacementPipelineResult = {
      externalEventId: eventId,
      externalId: "",
      title: "",
      rawLocation: "",
      normalizedLocation: "",
      parentBuilding: null,
      matchedBuilding: null,
      latitude: null,
      longitude: null,
      matchStatus: null,
      renderOnMap: false,
      visibleOnMapToday: false,
      failureReason: error?.message ?? "Event not found",
      override: null,
    };
    logPipeline(failure);
    return failure;
  }

  const source = String(event.source ?? "urinvolved");
  const occurrenceStart = typeof event.starts_at === "string" ? event.starts_at : null;
  const rawLocation =
    (typeof event.venue_name === "string" && event.venue_name.trim()) ||
    (typeof event.location_name === "string" && event.location_name.trim()) ||
    (typeof event.address === "string" && event.address.trim()) ||
    "";

  const normalizedLocation = normalizeEventLocationText(rawLocation);
  const parentBuilding = extractBuildingName(rawLocation) || normalizeCampusLocationName(rawLocation) || null;

  const startsAt = typeof event.starts_at === "string" ? event.starts_at : null;
  const endsAt = typeof event.ends_at === "string" ? event.ends_at : null;
  const visibleOnMapToday =
    Boolean(startsAt) &&
    isEventVisibleOnMap({ end_time: effectiveEventEndIso(startsAt, endsAt) }, new Date());

  if (!rawLocation) {
    const now = new Date().toISOString();
    await admin.from("external_event_map_overrides").upsert(
      {
        external_event_id: eventId,
        source,
        occurrence_start: occurrenceStart,
        realm_location_id: null,
        custom_lat: null,
        custom_lng: null,
        match_status: "unresolved",
        match_confidence: 0,
        match_reason: "missing_location_text",
        raw_location_text: null,
        normalized_location_text: null,
        updated_at: now,
      },
      { onConflict: "external_event_id" },
    );

    const failure: PlacementPipelineResult = {
      externalEventId: eventId,
      externalId: String(event.external_id ?? ""),
      title: String(event.title ?? ""),
      rawLocation: "",
      normalizedLocation: "",
      parentBuilding: null,
      matchedBuilding: null,
      latitude: null,
      longitude: null,
      matchStatus: "unresolved",
      renderOnMap: false,
      visibleOnMapToday,
      failureReason: "missing_location_text",
      override: null,
    };
    logPipeline(failure);
    return failure;
  }

  if (ONLINE_LOCATION_RE.test(rawLocation)) {
    const now = new Date().toISOString();
    const { data: onlineRow } = await admin
      .from("external_event_map_overrides")
      .upsert(
        {
          external_event_id: eventId,
          source,
          occurrence_start: occurrenceStart,
          realm_location_id: null,
          custom_lat: null,
          custom_lng: null,
          custom_label: null,
          match_status: "online",
          match_confidence: 1,
          match_reason: "online_or_virtual",
          raw_location_text: rawLocation,
          normalized_location_text: normalizedLocation,
          updated_at: now,
        },
        { onConflict: "external_event_id" },
      )
      .select("*")
      .single();

    const failure: PlacementPipelineResult = {
      externalEventId: eventId,
      externalId: String(event.external_id ?? ""),
      title: String(event.title ?? ""),
      rawLocation,
      normalizedLocation,
      parentBuilding,
      matchedBuilding: null,
      latitude: null,
      longitude: null,
      matchStatus: "online",
      renderOnMap: false,
      visibleOnMapToday: false,
      failureReason: "online_event",
      override: onlineRow
        ? {
            id: String(onlineRow.id),
            externalEventId: eventId,
            source,
            occurrenceStart,
            realmLocationId: null,
            customLat: null,
            customLng: null,
            customLabel: null,
            matchStatus: "online",
            matchConfidence: 1,
            matchReason: "online_or_virtual",
            rawLocationText: rawLocation,
            normalizedLocationText: normalizedLocation,
            googlePlaceId: null,
            formattedAddress: null,
            resolutionDebug: null,
            manuallyVerified: false,
            updatedBy: null,
            createdAt: String(onlineRow.created_at ?? now),
            updatedAt: now,
          }
        : null,
    };
    logPipeline(failure);
    return failure;
  }

  // Prefer event-row source coordinates when already campus-valid.
  const sourceLat = typeof event.latitude === "number" ? event.latitude : null;
  const sourceLng = typeof event.longitude === "number" ? event.longitude : null;
  if (sourceLat != null && sourceLng != null && coordsAreUsable(sourceLat, sourceLng)) {
    // Keep going through matcher so building label / registry still update, but coords stay trusted.
  }

  const catalog = options?.catalog ?? (await catalogFromDb());
  const existing = (await loadOverridesForEventIds([eventId])).get(eventId) ?? null;

  let override = await upsertAutoPlacementOverride({
    externalEventId: eventId,
    fields: {
      venueName: event.venue_name as string | null,
      locationName: event.location_name as string | null,
      address: event.address as string | null,
    },
    catalog,
    existing,
    forceGoogle: options?.forceGoogle,
    source,
    occurrenceStart,
  });

  let latitude = override?.customLat ?? sourceLat;
  let longitude = override?.customLng ?? sourceLng;
  let matchedBuilding = override?.customLabel ?? null;

  if (override?.realmLocationId && (latitude == null || longitude == null)) {
    const { data: loc } = await admin
      .from("campus_locations")
      .select("latitude, longitude, name")
      .eq("slug", override.realmLocationId)
      .maybeSingle();
    if (loc?.latitude != null && loc?.longitude != null) {
      latitude = Number(loc.latitude);
      longitude = Number(loc.longitude);
      matchedBuilding = matchedBuilding ?? (typeof loc.name === "string" ? loc.name : null);
    }
  }

  if (latitude != null && longitude != null && !coordsAreUsable(latitude, longitude)) {
    await admin
      .from("external_event_map_overrides")
      .update({
        match_status: "invalid",
        match_reason: "coordinates_outside_uri_campus",
        custom_lat: null,
        custom_lng: null,
        occurrence_start: occurrenceStart,
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("external_event_id", eventId);

    const failure: PlacementPipelineResult = {
      externalEventId: eventId,
      externalId: String(event.external_id ?? ""),
      title: String(event.title ?? ""),
      rawLocation,
      normalizedLocation,
      parentBuilding,
      matchedBuilding: matchedBuilding ?? override?.realmLocationId ?? null,
      latitude,
      longitude,
      matchStatus: "invalid",
      renderOnMap: false,
      visibleOnMapToday,
      failureReason: "coordinates_outside_uri_campus",
      override,
    };
    logPipeline(failure);
    return failure;
  }

  if (latitude != null && longitude != null) {
    await admin
      .from("external_events")
      .update({
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    if (override) {
      const { data: refreshed } = await admin
        .from("external_event_map_overrides")
        .update({
          occurrence_start: occurrenceStart,
          source,
          custom_lat: override.customLat ?? latitude,
          custom_lng: override.customLng ?? longitude,
          custom_label: override.customLabel ?? matchedBuilding ?? parentBuilding,
          updated_at: new Date().toISOString(),
        })
        .eq("external_event_id", eventId)
        .select("*")
        .single();
      if (refreshed) {
        override = {
          ...override,
          source,
          occurrenceStart,
          customLat: override.customLat ?? latitude,
          customLng: override.customLng ?? longitude,
          customLabel: override.customLabel ?? matchedBuilding ?? parentBuilding,
        };
      }
    }
  } else if (override) {
    await admin
      .from("external_event_map_overrides")
      .update({
        occurrence_start: occurrenceStart,
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("external_event_id", eventId);
  }

  const hasPin =
    (latitude != null && longitude != null) || Boolean(override?.realmLocationId) || Boolean(override?.customLat);
  const blockedStatus =
    override?.matchStatus === "hidden" ||
    override?.matchStatus === "ignored" ||
    override?.matchStatus === "online" ||
    override?.matchStatus === "invalid" ||
    override?.matchStatus === "unresolved" ||
    override?.matchStatus === "unmatched" ||
    override?.matchStatus === "pending";

  // needs_review / resolved / auto_matched with coords → show on map
  const renderOnMap = Boolean(override) && hasPin && !blockedStatus;

  const result: PlacementPipelineResult = {
    externalEventId: eventId,
    externalId: String(event.external_id ?? ""),
    title: String(event.title ?? ""),
    rawLocation,
    normalizedLocation,
    parentBuilding,
    matchedBuilding: matchedBuilding ?? override?.realmLocationId ?? parentBuilding,
    latitude,
    longitude,
    matchStatus: override?.matchStatus ?? null,
    renderOnMap,
    visibleOnMapToday,
    failureReason: renderOnMap ? null : override?.matchReason ?? "unresolved_location",
    override,
  };

  logPipeline(result);

  if (options?.revalidate !== false) {
    try {
      revalidatePath("/api/quests/map-pins");
      revalidatePath("/realm");
    } catch {
      // revalidatePath may throw outside a Next request context (tests / scripts).
    }
  }

  return result;
}

/**
 * Repair upcoming / recently-ended events with missing, stale, or invalid placements.
 * Idempotent — safe to run on a schedule.
 */
export async function reconcileEventMapPlacements(args?: {
  limit?: number;
  forceGoogle?: boolean;
}): Promise<{ repaired: number; failed: number; results: PlacementPipelineResult[] }> {
  const admin = createAdminClient();
  const limit = args?.limit ?? 80;
  const horizonStart = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const horizonEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await admin
    .from("external_events")
    .select("id")
    .eq("is_active", true)
    .eq("source", "urinvolved")
    .gte("starts_at", horizonStart)
    .lte("starts_at", horizonEnd)
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.warn("[cq:event-map-placement] reconcile query failed", error.message);
    return { repaired: 0, failed: 0, results: [] };
  }

  // Also pick up events whose override is missing or unresolved (even outside the simple scan).
  const eventIds = new Set((events ?? []).map((row) => String(row.id)));
  const { data: brokenOverrides } = await admin
    .from("external_event_map_overrides")
    .select("external_event_id")
    .in("match_status", ["unresolved", "unmatched", "invalid", "pending", "needs_review"])
    .limit(limit);

  for (const row of brokenOverrides ?? []) {
    eventIds.add(String(row.external_event_id));
  }

  // Detect duplicate overrides (should be impossible with unique constraint; repair if present).
  const { data: allOverrides } = await admin
    .from("external_event_map_overrides")
    .select("id, external_event_id, updated_at")
    .in("external_event_id", Array.from(eventIds).slice(0, limit));

  const byEvent = new Map<string, Array<{ id: string; updated_at: string }>>();
  for (const row of allOverrides ?? []) {
    const eid = String(row.external_event_id);
    const list = byEvent.get(eid) ?? [];
    list.push({ id: String(row.id), updated_at: String(row.updated_at ?? "") });
    byEvent.set(eid, list);
  }
  await Promise.all(
    Array.from(byEvent.values())
      .filter((rows) => rows.length > 1)
      .map(async (rows) => {
        const sorted = [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        const dropIds = sorted.slice(1).map((r) => r.id);
        if (dropIds.length > 0) {
          await admin.from("external_event_map_overrides").delete().in("id", dropIds);
        }
      }),
  );

  const catalog = await catalogFromDb();
  const results: PlacementPipelineResult[] = [];
  let repaired = 0;
  let failed = 0;

  for (const id of Array.from(eventIds)) {
    const result = await resolveAndUpsertEventMapPlacement(id, {
      catalog,
      forceGoogle: args?.forceGoogle,
      revalidate: false,
    });
    results.push(result);
    if (result.renderOnMap) repaired += 1;
    else if (result.failureReason && result.failureReason !== "online_event") failed += 1;
  }

  try {
    revalidatePath("/api/quests/map-pins");
    revalidatePath("/realm");
  } catch {
    /* ignore */
  }

  console.info("[cq:event-map-placement] reconcile complete", { repaired, failed, total: results.length });
  return { repaired, failed, results };
}
