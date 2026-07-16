import type { CatalogLocationLike, EventLocationMatch } from "@/lib/server/urinvolved/mapEventLocationTypes";
import {
  normalizeEventLocationText,
  type EventLocationMatchMeta,
} from "@/lib/server/urinvolved/eventLocationMatcher";
import { loadCampusBuildingRegistry } from "@/lib/server/urinvolved/campusBuildingRegistry";
import {
  resolveEventLocationAsync,
  resolveEventLocationFromRegistrySync,
  type EventLocationResolutionDebug,
} from "@/lib/server/urinvolved/eventLocationResolver";
import { createAdminClient } from "@/lib/server/supabase";
import { effectiveEventEndIso, isEventVisibleOnMap } from "@/lib/realm/eventVisibility";

export type ExternalEventMapMatchStatus =
  | "pending"
  | "resolved"
  | "unresolved"
  | "invalid"
  | "online"
  | "auto_matched" // legacy alias of resolved
  | "manually_adjusted"
  | "verified"
  | "needs_review"
  | "unmatched" // legacy alias of unresolved
  | "hidden"
  | "ignored";

export type ExternalEventMapOverrideRow = {
  id: string;
  externalEventId: string;
  source: string;
  occurrenceStart: string | null;
  realmLocationId: string | null;
  customLat: number | null;
  customLng: number | null;
  customLabel: string | null;
  matchStatus: ExternalEventMapMatchStatus;
  matchConfidence: number | null;
  matchReason: string | null;
  rawLocationText: string | null;
  normalizedLocationText: string | null;
  googlePlaceId: string | null;
  formattedAddress: string | null;
  resolutionDebug: EventLocationResolutionDebug | null;
  manuallyVerified: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Statuses that intentionally hide a pin from the public map. */
const HIDDEN_STATUSES: ExternalEventMapMatchStatus[] = ["hidden", "ignored", "online", "invalid"];

const PROTECTED_STATUSES: ExternalEventMapMatchStatus[] = [
  "manually_adjusted",
  "verified",
  "hidden",
  "ignored",
];

function rowFromDb(row: Record<string, unknown>): ExternalEventMapOverrideRow {
  return {
    id: String(row.id),
    externalEventId: String(row.external_event_id),
    source: String(row.source ?? "urinvolved"),
    occurrenceStart: (row.occurrence_start as string | null) ?? null,
    realmLocationId: (row.realm_location_id as string | null) ?? null,
    customLat: row.custom_lat == null ? null : Number(row.custom_lat),
    customLng: row.custom_lng == null ? null : Number(row.custom_lng),
    customLabel: (row.custom_label as string | null) ?? null,
    matchStatus: row.match_status as ExternalEventMapMatchStatus,
    matchConfidence: row.match_confidence == null ? null : Number(row.match_confidence),
    matchReason: (row.match_reason as string | null) ?? null,
    rawLocationText: (row.raw_location_text as string | null) ?? null,
    normalizedLocationText: (row.normalized_location_text as string | null) ?? null,
    googlePlaceId: (row.google_place_id as string | null) ?? null,
    formattedAddress: (row.formatted_address as string | null) ?? null,
    resolutionDebug: (row.resolution_debug as EventLocationResolutionDebug | null) ?? null,
    manuallyVerified: Boolean(row.manually_verified),
    updatedBy: (row.updated_by as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function loadOverridesForEventIds(
  externalEventIds: string[],
): Promise<Map<string, ExternalEventMapOverrideRow>> {
  const map = new Map<string, ExternalEventMapOverrideRow>();
  if (externalEventIds.length === 0) return map;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_event_map_overrides")
    .select("*")
    .in("external_event_id", externalEventIds);

  if (error) {
    console.warn("[cq:urinvolved-placement] override load failed", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const parsed = rowFromDb(row as Record<string, unknown>);
    map.set(parsed.externalEventId, parsed);
  }
  return map;
}

function overrideToMatch(
  override: ExternalEventMapOverrideRow,
  catalog: CatalogLocationLike[],
): EventLocationMatch | null {
  if (override.customLat != null && override.customLng != null) {
    return {
      kind: "coords",
      locationName: override.customLabel ?? "Custom location",
      latitude: override.customLat,
      longitude: override.customLng,
      matchedText: override.rawLocationText ?? override.customLabel ?? "Custom location",
    };
  }
  if (override.realmLocationId) {
    const entry = catalog.find((c) => c.slug === override.realmLocationId);
    return {
      kind: "realm",
      realmLocationId: override.realmLocationId,
      locationName: override.customLabel ?? entry?.name ?? override.realmLocationId.replace(/-/g, " "),
      matchedText: override.rawLocationText ?? override.customLabel ?? override.realmLocationId,
    };
  }
  return null;
}

export type ResolvedExternalEventPlacement = {
  match: EventLocationMatch | null;
  meta: EventLocationMatchMeta | null;
  override: ExternalEventMapOverrideRow | null;
  renderOnMap: boolean;
  appliedOverride: boolean;
  resolutionDebug: EventLocationResolutionDebug | null;
};

export function resolveExternalEventPlacement(args: {
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  catalog: CatalogLocationLike[];
  override?: ExternalEventMapOverrideRow | null;
  registry?: Awaited<ReturnType<typeof loadCampusBuildingRegistry>>;
}): ResolvedExternalEventPlacement {
  const rawLocation =
    args.fields.venueName?.trim() ||
    args.fields.locationName?.trim() ||
    args.fields.address?.trim() ||
    "";
  const override = args.override ?? null;

  if (override && HIDDEN_STATUSES.includes(override.matchStatus)) {
    return {
      match: null,
      meta: {
        rawLocation,
        normalizedLocation: override.normalizedLocationText ?? normalizeEventLocationText(rawLocation),
        confidence: override.matchConfidence ?? 0,
        matchReason: override.matchReason ?? override.matchStatus,
        needsReview: false,
        matchedText: rawLocation,
      },
      override,
      renderOnMap: false,
      appliedOverride: true,
      resolutionDebug: override.resolutionDebug,
    };
  }

  if (
    override &&
    (override.matchStatus === "manually_adjusted" ||
      override.matchStatus === "verified" ||
      override.manuallyVerified)
  ) {
    const match = overrideToMatch(override, args.catalog);
    return {
      match,
      meta: match
        ? {
            rawLocation,
            normalizedLocation: override.normalizedLocationText ?? normalizeEventLocationText(rawLocation),
            confidence: override.matchConfidence ?? 1,
            matchReason: override.matchReason ?? "manual_override",
            needsReview: false,
            matchedText: match.matchedText,
          }
        : null,
      override,
      renderOnMap: Boolean(match),
      appliedOverride: true,
      resolutionDebug: override.resolutionDebug,
    };
  }

  // Stored placement with real coords / realm pin — always prefer it (including needs_review).
  // Previously needs_review/unmatched short-circuited to renderOnMap:false even when coords existed.
  if (override) {
    const stored = overrideToMatch(override, args.catalog);
    if (stored) {
      const needsReview =
        override.matchStatus === "needs_review" || (override.matchConfidence ?? 0) < 0.9;
      return {
        match: stored,
        meta: {
          rawLocation,
          normalizedLocation: override.normalizedLocationText ?? normalizeEventLocationText(rawLocation),
          confidence: override.matchConfidence ?? 0.8,
          matchReason: override.matchReason ?? override.matchStatus,
          needsReview,
          matchedText: stored.matchedText,
        },
        override,
        renderOnMap: true,
        appliedOverride: true,
        resolutionDebug: override.resolutionDebug,
      };
    }

    // Unresolved / pending / stale row with no coords: fall through and re-resolve.
  }

  const registry = args.registry ?? [];
  const auto = resolveEventLocationFromRegistrySync({
    fields: args.fields,
    registry,
    catalog: args.catalog,
  });

  return {
    match: auto.match,
    meta: auto.meta,
    override,
    renderOnMap: auto.debug.renderOnMap,
    appliedOverride: false,
    resolutionDebug: auto.debug,
  };
}

export function mapEventToRealmLocationWithOverrides(
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  },
  catalog: CatalogLocationLike[],
  override?: ExternalEventMapOverrideRow | null,
): EventLocationMatch | null {
  return resolveExternalEventPlacement({ fields, catalog, override }).match;
}

function placementLog(message: string, detail?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEBUG_EVENT_PINS !== "true") return;
  if (detail) console.info(`[cq:urinvolved-placement] ${message}`, detail);
  else console.info(`[cq:urinvolved-placement] ${message}`);
}

function resolutionToOverrideRow(args: {
  externalEventId: string;
  rawLocation: string;
  resolved: Awaited<ReturnType<typeof resolveEventLocationAsync>>;
  now: string;
  source?: string;
  occurrenceStart?: string | null;
}) {
  const { resolved } = args;
  const match = resolved.match;
  const meta = resolved.meta;
  const status: ExternalEventMapMatchStatus = !match
    ? "unresolved"
    : meta?.needsReview
      ? "needs_review"
      : "resolved";

  return {
    external_event_id: args.externalEventId,
    source: args.source ?? "urinvolved",
    occurrence_start: args.occurrenceStart ?? null,
    realm_location_id: match?.kind === "realm" ? match.realmLocationId : resolved.registrySlug,
    custom_lat: match?.kind === "coords" ? match.latitude : null,
    custom_lng: match?.kind === "coords" ? match.longitude : null,
    custom_label:
      match?.kind === "coords"
        ? match.locationName
        : match?.kind === "realm"
          ? match.locationName
          : null,
    match_status: status,
    match_confidence: meta?.confidence ?? 0,
    match_reason: meta?.matchReason ?? status,
    raw_location_text: args.rawLocation || null,
    normalized_location_text: meta?.normalizedLocation ?? null,
    google_place_id: resolved.googlePlaceId,
    formatted_address: resolved.formattedAddress,
    resolution_debug: {
      ...resolved.debug,
      renderOnMap: Boolean(match) && (resolved.debug.renderOnMap || (meta?.confidence ?? 0) >= 0.75),
    },
    updated_at: args.now,
  };
}

export async function upsertAutoPlacementOverride(args: {
  externalEventId: string;
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  catalog: CatalogLocationLike[];
  existing?: ExternalEventMapOverrideRow | null;
  forceGoogle?: boolean;
  source?: string;
  occurrenceStart?: string | null;
}): Promise<ExternalEventMapOverrideRow | null> {
  if (args.existing && PROTECTED_STATUSES.includes(args.existing.matchStatus)) {
    placementLog("override preserved (protected status)", {
      externalEventId: args.externalEventId,
      status: args.existing.matchStatus,
    });
    return args.existing;
  }
  if (args.existing?.manuallyVerified) {
    placementLog("override preserved (manually verified)", {
      externalEventId: args.externalEventId,
    });
    return args.existing;
  }

  const rawLocation =
    args.fields.venueName?.trim() ||
    args.fields.locationName?.trim() ||
    args.fields.address?.trim() ||
    "";

  const locationChanged =
    Boolean(args.existing?.rawLocationText) &&
    normalizeEventLocationText(args.existing!.rawLocationText!) !== normalizeEventLocationText(rawLocation);

  const forceGoogle = args.forceGoogle ?? locationChanged;

  const resolved = await resolveEventLocationAsync({
    fields: args.fields,
    catalog: args.catalog,
    forceGoogle,
  });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const row = resolutionToOverrideRow({
    externalEventId: args.externalEventId,
    rawLocation,
    resolved,
    now,
    source: args.source,
    occurrenceStart: args.occurrenceStart,
  });

  const { data, error } = await admin
    .from("external_event_map_overrides")
    .upsert(row, { onConflict: "external_event_id" })
    .select("*")
    .single();

  if (error) {
    console.warn("[cq:urinvolved-placement] auto upsert failed", error.message);
    return null;
  }

  placementLog(resolved.match ? "resolved" : "unresolved stored", {
    externalEventId: args.externalEventId,
    rawLocation,
    normalized: resolved.meta?.normalizedLocation,
    matchedBuilding: resolved.match?.locationName ?? null,
    latitude: resolved.match?.kind === "coords" ? resolved.match.latitude : null,
    longitude: resolved.match?.kind === "coords" ? resolved.match.longitude : null,
    confidence: resolved.meta?.confidence,
    reason: resolved.meta?.matchReason,
    matchStatus: row.match_status,
    renderOnMap: Boolean(resolved.match) && (resolved.debug.renderOnMap || (resolved.meta?.confidence ?? 0) >= 0.75),
    googlePlaceId: resolved.googlePlaceId,
    failureReason: resolved.match ? null : resolved.meta?.matchReason ?? "unresolved_location",
  });

  return rowFromDb(data as Record<string, unknown>);
}

export async function resolvePlacementFromLocationName(args: {
  externalEventId: string;
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  catalog: CatalogLocationLike[];
  updatedBy: string;
}): Promise<ExternalEventMapOverrideRow | null> {
  const existing = (await loadOverridesForEventIds([args.externalEventId])).get(args.externalEventId) ?? null;
  if (existing?.matchStatus === "manually_adjusted" || existing?.manuallyVerified) {
    return existing;
  }

  return upsertAutoPlacementOverride({
    externalEventId: args.externalEventId,
    fields: args.fields,
    catalog: args.catalog,
    existing: null,
    forceGoogle: true,
  });
}

export async function markPlacementVerified(args: {
  externalEventId: string;
  updatedBy: string;
  registrySlug?: string | null;
}): Promise<ExternalEventMapOverrideRow> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (args.registrySlug) {
    const { markBuildingRegistryVerified } = await import("@/lib/server/urinvolved/campusBuildingRegistry");
    await markBuildingRegistryVerified(args.registrySlug);
  }

  const { data, error } = await admin
    .from("external_event_map_overrides")
    .update({
      match_status: "verified",
      manually_verified: true,
      match_confidence: 1,
      match_reason: "admin_verified",
      updated_by: args.updatedBy,
      updated_at: now,
    })
    .eq("external_event_id", args.externalEventId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not verify placement.");
  }

  return rowFromDb(data as Record<string, unknown>);
}

export async function saveManualPlacementOverride(args: {
  externalEventId: string;
  updatedBy: string;
  realmLocationId?: string | null;
  customLat?: number | null;
  customLng?: number | null;
  customLabel?: string | null;
  matchStatus?: Extract<ExternalEventMapMatchStatus, "manually_adjusted" | "hidden" | "ignored" | "verified">;
  rawLocationText?: string | null;
  normalizedLocationText?: string | null;
}): Promise<ExternalEventMapOverrideRow> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const status = args.matchStatus ?? "manually_adjusted";
  const isDrag =
    args.customLat != null &&
    args.customLng != null &&
    Number.isFinite(args.customLat) &&
    Number.isFinite(args.customLng);

  const row = {
    external_event_id: args.externalEventId,
    realm_location_id: isDrag ? null : (args.realmLocationId ?? null),
    custom_lat: isDrag ? args.customLat : (args.realmLocationId ? null : (args.customLat ?? null)),
    custom_lng: isDrag ? args.customLng : (args.realmLocationId ? null : (args.customLng ?? null)),
    custom_label: args.customLabel ?? null,
    match_status: status,
    match_confidence: status === "manually_adjusted" || status === "verified" ? 1 : null,
    match_reason:
      status === "manually_adjusted"
        ? isDrag
          ? "manual_drag"
          : "manual_override"
        : status,
    raw_location_text: args.rawLocationText ?? null,
    normalized_location_text: args.normalizedLocationText ?? null,
    manually_verified: status === "verified",
    updated_by: args.updatedBy,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("external_event_map_overrides")
    .upsert(row, { onConflict: "external_event_id" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not save placement override.");
  }

  return rowFromDb(data as Record<string, unknown>);
}

export async function resetPlacementToAutoMatch(args: {
  externalEventId: string;
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  catalog: CatalogLocationLike[];
  forceGoogle?: boolean;
}): Promise<ExternalEventMapOverrideRow | null> {
  const admin = createAdminClient();
  await admin.from("external_event_map_overrides").delete().eq("external_event_id", args.externalEventId);
  return upsertAutoPlacementOverride({
    externalEventId: args.externalEventId,
    fields: args.fields,
    catalog: args.catalog,
    existing: null,
    forceGoogle: args.forceGoogle ?? true,
  });
}

export type AdminUrinvolvedPlacementEvent = {
  externalEventId: string;
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  organizationName: string | null;
  rawLocationText: string;
  normalizedLocationText: string;
  source: "urinvolved";
  override: ExternalEventMapOverrideRow | null;
  autoMatch: EventLocationMatchMeta | null;
  currentMatch: EventLocationMatch | null;
  renderOnMap: boolean;
  resolutionDebug: EventLocationResolutionDebug | null;
  suggestedMatches: Array<{ realmLocationId: string; name: string; confidence: number; reason: string }>;
};

export async function listAdminUrinvolvedPlacements(args: {
  catalog: CatalogLocationLike[];
  now?: Date;
}): Promise<{
  events: AdminUrinvolvedPlacementEvent[];
  unmatched: AdminUrinvolvedPlacementEvent[];
  needsReview: AdminUrinvolvedPlacementEvent[];
}> {
  const now = args.now ?? new Date();
  const admin = createAdminClient();
  const { getCampusDayWindow } = await import("@/lib/realm/eventCountdown");
  const { start, end } = getCampusDayWindow(now);
  const fetchStart = new Date(start.getTime() - 72 * 60 * 60 * 1000);
  const fetchEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  const { data, error } = await admin
    .from("external_events")
    .select("id, external_id, title, starts_at, ends_at, venue_name, location_name, address, organization_name, source")
    .eq("is_active", true)
    .eq("source", "urinvolved")
    .gte("starts_at", fetchStart.toISOString())
    .lt("starts_at", fetchEnd.toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw new Error(error.message);

  const todayRows = (data ?? []).filter((row) => {
    const startsAt = String(row.starts_at ?? "");
    if (!startsAt) return false;
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return false;
    if (d >= end) return false;
    return isEventVisibleOnMap(
      { end_time: effectiveEventEndIso(startsAt, (row.ends_at as string | null) ?? null) },
      now,
    );
  });

  const ids = todayRows.map((r) => String(r.id));
  const [overrides, registry] = await Promise.all([
    loadOverridesForEventIds(ids),
    loadCampusBuildingRegistry(),
  ]);

  const events: AdminUrinvolvedPlacementEvent[] = [];
  const unmatched: AdminUrinvolvedPlacementEvent[] = [];
  const needsReview: AdminUrinvolvedPlacementEvent[] = [];

  for (const row of todayRows) {
    const externalEventId = String(row.id);
    const fields = {
      venueName: (row.venue_name as string | null) ?? null,
      locationName: (row.location_name as string | null) ?? null,
      address: (row.address as string | null) ?? null,
    };
    const rawLocation =
      fields.venueName?.trim() || fields.locationName?.trim() || fields.address?.trim() || "";
    if (!rawLocation) continue;

    const override = overrides.get(externalEventId) ?? null;
    const auto = resolveEventLocationFromRegistrySync({ fields, registry, catalog: args.catalog });
    const resolved = resolveExternalEventPlacement({
      fields,
      catalog: args.catalog,
      override,
      registry,
    });
    const suggestedMatches = suggestLocationMatches(rawLocation, args.catalog);

    const item: AdminUrinvolvedPlacementEvent = {
      externalEventId,
      externalId: String(row.external_id ?? ""),
      title: String(row.title ?? "Campus Event"),
      startsAt: String(row.starts_at),
      endsAt: (row.ends_at as string | null) ?? null,
      organizationName: (row.organization_name as string | null) ?? null,
      rawLocationText: rawLocation,
      normalizedLocationText: normalizeEventLocationText(rawLocation),
      source: "urinvolved",
      override,
      autoMatch: auto.meta,
      currentMatch: resolved.match,
      renderOnMap: resolved.renderOnMap,
      resolutionDebug: resolved.resolutionDebug ?? override?.resolutionDebug ?? auto.debug,
      suggestedMatches,
    };

    events.push(item);
    if (
      !resolved.renderOnMap &&
      override?.matchStatus !== "hidden" &&
      override?.matchStatus !== "ignored" &&
      override?.matchStatus !== "online"
    ) {
      unmatched.push(item);
    } else if (
      (resolved.meta?.needsReview || override?.matchStatus === "needs_review") &&
      override?.matchStatus !== "manually_adjusted" &&
      override?.matchStatus !== "verified" &&
      override?.matchStatus !== "resolved"
    ) {
      needsReview.push(item);
    }
  }

  return { events, unmatched, needsReview };
}

function suggestLocationMatches(
  rawLocation: string,
  catalog: CatalogLocationLike[],
): Array<{ realmLocationId: string; name: string; confidence: number; reason: string }> {
  const normalized = normalizeEventLocationText(rawLocation);
  const suggestions: Array<{ realmLocationId: string; name: string; confidence: number; reason: string }> = [];

  for (const entry of catalog) {
    const entryNorm = normalizeEventLocationText(entry.name);
    if (entryNorm === normalized) {
      suggestions.push({ realmLocationId: entry.slug, name: entry.name, confidence: 1, reason: "exact_catalog" });
      continue;
    }
    if (normalized.includes(entryNorm) || entryNorm.includes(normalized)) {
      suggestions.push({
        realmLocationId: entry.slug,
        name: entry.name,
        confidence: 0.82,
        reason: "contains_catalog",
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}
