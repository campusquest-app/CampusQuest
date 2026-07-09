import type { CatalogLocationLike, EventLocationMatch } from "@/lib/server/urinvolved/mapEventLocationTypes";
import {
  matchEventLocationWithMeta,
  normalizeEventLocationText,
  type EventLocationMatchMeta,
} from "@/lib/server/urinvolved/eventLocationMatcher";
import { createAdminClient } from "@/lib/server/supabase";

export type ExternalEventMapMatchStatus =
  | "auto_matched"
  | "manually_adjusted"
  | "unmatched"
  | "hidden"
  | "ignored";

export type ExternalEventMapOverrideRow = {
  id: string;
  externalEventId: string;
  realmLocationId: string | null;
  customLat: number | null;
  customLng: number | null;
  customLabel: string | null;
  matchStatus: ExternalEventMapMatchStatus;
  matchConfidence: number | null;
  matchReason: string | null;
  rawLocationText: string | null;
  normalizedLocationText: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const PROTECTED_STATUSES: ExternalEventMapMatchStatus[] = ["manually_adjusted", "hidden", "ignored"];

function rowFromDb(row: Record<string, unknown>): ExternalEventMapOverrideRow {
  return {
    id: String(row.id),
    externalEventId: String(row.external_event_id),
    realmLocationId: (row.realm_location_id as string | null) ?? null,
    customLat: row.custom_lat == null ? null : Number(row.custom_lat),
    customLng: row.custom_lng == null ? null : Number(row.custom_lng),
    customLabel: (row.custom_label as string | null) ?? null,
    matchStatus: row.match_status as ExternalEventMapMatchStatus,
    matchConfidence: row.match_confidence == null ? null : Number(row.match_confidence),
    matchReason: (row.match_reason as string | null) ?? null,
    rawLocationText: (row.raw_location_text as string | null) ?? null,
    normalizedLocationText: (row.normalized_location_text as string | null) ?? null,
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
  if (override.realmLocationId) {
    const entry = catalog.find((c) => c.slug === override.realmLocationId);
    return {
      kind: "realm",
      realmLocationId: override.realmLocationId,
      locationName: override.customLabel ?? entry?.name ?? override.realmLocationId.replace(/-/g, " "),
      matchedText: override.rawLocationText ?? override.customLabel ?? override.realmLocationId,
    };
  }
  if (override.customLat != null && override.customLng != null) {
    return {
      kind: "coords",
      locationName: override.customLabel ?? "Custom location",
      latitude: override.customLat,
      longitude: override.customLng,
      matchedText: override.rawLocationText ?? override.customLabel ?? "Custom location",
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
};

export function resolveExternalEventPlacement(args: {
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  catalog: CatalogLocationLike[];
  override?: ExternalEventMapOverrideRow | null;
}): ResolvedExternalEventPlacement {
  const rawLocation =
    args.fields.venueName?.trim() ||
    args.fields.locationName?.trim() ||
    args.fields.address?.trim() ||
    "";
  const override = args.override ?? null;

  if (override?.matchStatus === "hidden" || override?.matchStatus === "ignored") {
    return {
      match: null,
      meta: null,
      override,
      renderOnMap: false,
      appliedOverride: true,
    };
  }

  if (override?.matchStatus === "manually_adjusted") {
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
    };
  }

  const auto = matchEventLocationWithMeta(args.fields, args.catalog);
  if (!auto) {
    return {
      match: null,
      meta: {
        rawLocation,
        normalizedLocation: normalizeEventLocationText(rawLocation),
        confidence: 0,
        matchReason: "unmatched",
        needsReview: false,
        matchedText: rawLocation,
      },
      override,
      renderOnMap: false,
      appliedOverride: false,
    };
  }

  return {
    match: auto.match,
    meta: auto.meta,
    override,
    renderOnMap: true,
    appliedOverride: false,
  };
}

/** Legacy wrapper — runtime auto-match only. */
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

export async function upsertAutoPlacementOverride(args: {
  externalEventId: string;
  fields: {
    venueName?: string | null;
    locationName?: string | null;
    address?: string | null;
  };
  catalog: CatalogLocationLike[];
  existing?: ExternalEventMapOverrideRow | null;
}): Promise<ExternalEventMapOverrideRow | null> {
  if (args.existing && PROTECTED_STATUSES.includes(args.existing.matchStatus)) {
    placementLog("override preserved (protected status)", {
      externalEventId: args.externalEventId,
      status: args.existing.matchStatus,
    });
    return args.existing;
  }

  const rawLocation =
    args.fields.venueName?.trim() ||
    args.fields.locationName?.trim() ||
    args.fields.address?.trim() ||
    "";
  const normalized = normalizeEventLocationText(rawLocation);
  const auto = matchEventLocationWithMeta(args.fields, args.catalog);

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (!auto) {
    const row = {
      external_event_id: args.externalEventId,
      realm_location_id: null,
      custom_lat: null,
      custom_lng: null,
      custom_label: null,
      match_status: "unmatched" as const,
      match_confidence: 0,
      match_reason: "unmatched",
      raw_location_text: rawLocation || null,
      normalized_location_text: normalized || null,
      updated_at: now,
    };
    const { data, error } = await admin
      .from("external_event_map_overrides")
      .upsert(row, { onConflict: "external_event_id" })
      .select("*")
      .single();
    if (error) {
      console.warn("[cq:urinvolved-placement] unmatched upsert failed", error.message);
      return null;
    }
    placementLog("unmatched stored", { externalEventId: args.externalEventId, rawLocation });
    return rowFromDb(data as Record<string, unknown>);
  }

  const { match, meta } = auto;
  const row = {
    external_event_id: args.externalEventId,
    realm_location_id: match.kind === "realm" ? match.realmLocationId : null,
    custom_lat: match.kind === "coords" ? match.latitude : null,
    custom_lng: match.kind === "coords" ? match.longitude : null,
    custom_label: match.kind === "coords" ? match.locationName : null,
    match_status: "auto_matched" as const,
    match_confidence: meta.confidence,
    match_reason: meta.matchReason,
    raw_location_text: rawLocation || null,
    normalized_location_text: meta.normalizedLocation,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("external_event_map_overrides")
    .upsert(row, { onConflict: "external_event_id" })
    .select("*")
    .single();

  if (error) {
    console.warn("[cq:urinvolved-placement] auto upsert failed", error.message);
    return null;
  }

  placementLog("auto matched", {
    externalEventId: args.externalEventId,
    rawLocation,
    normalized: meta.normalizedLocation,
    matched:
      match.kind === "realm" ? `realm:${match.realmLocationId}` : `coords:${match.locationName}`,
    confidence: meta.confidence,
    reason: meta.matchReason,
    needsReview: meta.needsReview,
  });

  return rowFromDb(data as Record<string, unknown>);
}

export async function saveManualPlacementOverride(args: {
  externalEventId: string;
  updatedBy: string;
  realmLocationId?: string | null;
  customLat?: number | null;
  customLng?: number | null;
  customLabel?: string | null;
  matchStatus?: Extract<ExternalEventMapMatchStatus, "manually_adjusted" | "hidden" | "ignored">;
  rawLocationText?: string | null;
  normalizedLocationText?: string | null;
}): Promise<ExternalEventMapOverrideRow> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const status = args.matchStatus ?? "manually_adjusted";

  const row = {
    external_event_id: args.externalEventId,
    realm_location_id: args.realmLocationId ?? null,
    custom_lat: args.customLat ?? null,
    custom_lng: args.customLng ?? null,
    custom_label: args.customLabel ?? null,
    match_status: status,
    match_confidence: status === "manually_adjusted" ? 1 : null,
    match_reason: status === "manually_adjusted" ? "manual_override" : status,
    raw_location_text: args.rawLocationText ?? null,
    normalized_location_text: args.normalizedLocationText ?? null,
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

  placementLog("manual override saved", {
    externalEventId: args.externalEventId,
    status,
    realmLocationId: args.realmLocationId,
  });

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
}): Promise<ExternalEventMapOverrideRow | null> {
  const admin = createAdminClient();
  await admin.from("external_event_map_overrides").delete().eq("external_event_id", args.externalEventId);
  return upsertAutoPlacementOverride({
    externalEventId: args.externalEventId,
    fields: args.fields,
    catalog: args.catalog,
    existing: null,
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
  const fetchStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
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
    return !Number.isNaN(d.getTime()) && d >= start && d < end;
  });

  const ids = todayRows.map((r) => String(r.id));
  const overrides = await loadOverridesForEventIds(ids);

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
    const auto = matchEventLocationWithMeta(fields, args.catalog);
    const resolved = resolveExternalEventPlacement({ fields, catalog: args.catalog, override });
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
      autoMatch: auto?.meta ?? null,
      currentMatch: resolved.match,
      renderOnMap: resolved.renderOnMap,
      suggestedMatches,
    };

    events.push(item);
    if (!resolved.renderOnMap && override?.matchStatus !== "hidden" && override?.matchStatus !== "ignored") {
      unmatched.push(item);
    } else if (resolved.meta?.needsReview && override?.matchStatus !== "manually_adjusted") {
      needsReview.push(item);
    }
  }

  placementLog("admin placement summary", {
    total: events.length,
    unmatched: unmatched.length,
    needsReview: needsReview.length,
  });

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
