import type { MapEventPin } from "@/lib/mapLocationGroups";
import { getCampusDayWindow, isEventCancelled } from "@/lib/realm/eventCountdown";
import { createAdminClient } from "@/lib/server/supabase";
import {
  loadOverridesForEventIds,
  resolveExternalEventPlacement,
  type ExternalEventMapOverrideRow,
} from "@/lib/server/externalEventMapOverrides";
import {
  normalizeEventLocationText,
  type CatalogLocationLike,
  type EventLocationMatch,
} from "@/lib/server/urinvolved/mapEventLocationMatch";

export type TodayExternalMapEvent = {
  pin: MapEventPin;
  match: EventLocationMatch;
  placement?: {
    status: ExternalEventMapOverrideRow["matchStatus"] | "runtime_auto";
    confidence: number | null;
    matchReason: string | null;
    needsReview: boolean;
    appliedOverride: boolean;
    rawLocation: string;
    normalizedLocation: string;
  };
};

type RawRow = Record<string, unknown>;

function str(row: RawRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/** Field fallbacks so schema drift (title/name, starts_at/start_time/…) can't blank the feature. */
function normalizeRow(row: RawRow) {
  return {
    id: String(row.id ?? ""),
    title: str(row, "title", "name", "event_name") ?? "Campus Event",
    startsAt: str(row, "starts_at", "start_time", "event_start", "start_at", "date"),
    endsAt: str(row, "ends_at", "end_time", "event_end", "end_at"),
    venueName: str(row, "venue_name", "venue"),
    address: str(row, "address", "location_address"),
    locationName: str(row, "location_name", "location"),
    organizationName: str(row, "organization_name", "organization", "org_name"),
    imageUrl: str(row, "image_url", "image", "cover_image_url"),
    eventUrl: str(row, "event_url", "url", "link"),
    category: str(row, "category"),
    status: str(row, "status", "event_status"),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
  };
}

function rowCancelled(row: ReturnType<typeof normalizeRow>): boolean {
  if (row.status && /cancell?ed/i.test(row.status)) return true;
  if (isEventCancelled({ title: row.title })) return true;
  return row.tags.some((tag) => /^cancell?ed$/i.test(tag.trim()));
}

const DEBUG_EVENT_PINS = process.env.NEXT_PUBLIC_DEBUG_EVENT_PINS === "true";

function debugLog(message: string, detail?: unknown): void {
  if (process.env.NODE_ENV !== "production" || DEBUG_EVENT_PINS) {
    if (detail === undefined) console.info(`[cq:urinvolved-map] ${message}`);
    else console.info(`[cq:urinvolved-map] ${message}`, detail);
  }
}

/** Dev-only fake event at Weldin Hall starting 8 minutes from now. */
function debugFakeEvent(catalog: CatalogLocationLike[], now: Date): TodayExternalMapEvent {
  const startsAt = new Date(now.getTime() + 8 * 60_000).toISOString();
  const endsAt = new Date(now.getTime() + 68 * 60_000).toISOString();
  const fields = { locationName: "Weldin Hall" };
  const resolved = resolveExternalEventPlacement({ fields, catalog, override: null });
  const match =
    resolved.match ??
    ({
      kind: "coords",
      locationName: "Weldin Hall",
      latitude: 41.49135,
      longitude: -71.52814,
      matchedText: "Weldin Hall",
    } satisfies EventLocationMatch);
  return {
    match,
    pin: {
      id: "ext:debug-karaoke",
      externalEventId: "debug-karaoke",
      title: "Debug Karaoke Night",
      startsAt,
      endsAt,
      organizationName: "Talent Development",
      eventUrl: null,
      source: "urinvolved",
      cancelled: false,
      imageUrl: null,
      category: "Arts",
      locationText: "Weldin Hall",
    },
  };
}

/**
 * Today's URInvolved events (campus/NY calendar day) matched to Realm map
 * locations. Events on other days or with unmatchable locations are excluded,
 * so pins automatically appear on the right day and disappear after it.
 */
export async function getTodayExternalEventsForMap(args: {
  catalog: CatalogLocationLike[];
  now?: Date;
}): Promise<TodayExternalMapEvent[]> {
  const now = args.now ?? new Date();
  const { start, end } = getCampusDayWindow(now);
  debugLog("campus day window (America/New_York)", {
    start: start.toISOString(),
    end: end.toISOString(),
    now: now.toISOString(),
  });

  const admin = createAdminClient();

  const fetchStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const fetchEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const { data, error } = await admin
    .from("external_events")
    .select("*")
    .eq("is_active", true)
    .eq("source", "urinvolved")
    .gte("starts_at", fetchStart.toISOString())
    .lt("starts_at", fetchEnd.toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    debugLog("external events query failed", { error: error.message });
    return DEBUG_EVENT_PINS ? [debugFakeEvent(args.catalog, now)] : [];
  }

  const rows = (data ?? []).map((row) => normalizeRow(row as RawRow));
  debugLog(
    "urinvolved events near today",
    rows.map((row) => ({
      title: row.title,
      startsAt: row.startsAt,
      location: row.venueName ?? row.locationName ?? row.address,
    })),
  );

  const todayRows = rows.filter((row) => {
    if (!row.startsAt) return false;
    const startDate = new Date(row.startsAt);
    return !Number.isNaN(startDate.getTime()) && startDate >= start && startDate < end;
  });

  const overrides = await loadOverridesForEventIds(todayRows.map((r) => r.id));

  const matched: TodayExternalMapEvent[] = [];
  const unmatchedLocations: string[] = [];
  let cancelledCount = 0;
  let overrideAppliedCount = 0;

  for (const row of todayRows) {
    const rawLocation = row.venueName ?? row.locationName ?? row.address;
    if (!rawLocation) {
      debugLog("event skipped (no location text)", { title: row.title });
      continue;
    }

    const fields = { venueName: row.venueName, locationName: row.locationName, address: row.address };
    const override = overrides.get(row.id) ?? null;
    const resolved = resolveExternalEventPlacement({ fields, catalog: args.catalog, override });

    debugLog("location match attempt", {
      title: row.title,
      rawLocation,
      normalized: normalizeEventLocationText(rawLocation),
      matched: resolved.match
        ? resolved.match.kind === "realm"
          ? `realm:${resolved.match.realmLocationId}`
          : `coords:${resolved.match.locationName}`
        : null,
      confidence: resolved.meta?.confidence ?? null,
      reason: resolved.meta?.matchReason ?? null,
      overrideStatus: override?.matchStatus ?? null,
      appliedOverride: resolved.appliedOverride,
      renderOnMap: resolved.renderOnMap,
    });

    if (!resolved.renderOnMap || !resolved.match) {
      unmatchedLocations.push(rawLocation);
      if (!override || (override.matchStatus !== "hidden" && override.matchStatus !== "ignored")) {
        console.warn("[cq:urinvolved-map] UNMATCHED event location:", rawLocation, `(${row.title})`);
      }
      continue;
    }

    if (resolved.appliedOverride) overrideAppliedCount += 1;

    const cancelled = rowCancelled(row);
    if (cancelled) cancelledCount += 1;

    matched.push({
      match: resolved.match,
      placement: {
        status: override?.matchStatus ?? "runtime_auto",
        confidence: resolved.meta?.confidence ?? override?.matchConfidence ?? null,
        matchReason: resolved.meta?.matchReason ?? override?.matchReason ?? null,
        needsReview: resolved.meta?.needsReview ?? false,
        appliedOverride: resolved.appliedOverride,
        rawLocation,
        normalizedLocation: normalizeEventLocationText(rawLocation),
      },
      pin: {
        id: `ext:${row.id}`,
        externalEventId: row.id,
        title: row.title,
        startsAt: row.startsAt!,
        endsAt: row.endsAt,
        organizationName: row.organizationName,
        eventUrl: row.eventUrl,
        source: "urinvolved",
        cancelled,
        imageUrl: row.imageUrl,
        category: row.category,
        locationText: rawLocation,
        placementStatus: override?.matchStatus ?? "auto_matched",
        matchConfidence: resolved.meta?.confidence ?? override?.matchConfidence ?? null,
        matchReason: resolved.meta?.matchReason ?? override?.matchReason ?? null,
        needsReview: resolved.meta?.needsReview ?? false,
        locationManuallyAdjusted: override?.matchStatus === "manually_adjusted",
      },
    });
  }

  if (DEBUG_EVENT_PINS) {
    matched.push(debugFakeEvent(args.catalog, now));
    debugLog("debug fake event injected (NEXT_PUBLIC_DEBUG_EVENT_PINS)");
  }

  debugLog("today external events summary", {
    fetched: rows.length,
    today: todayRows.length,
    matched: matched.length,
    overrideApplied: overrideAppliedCount,
    unmatchedCount: unmatchedLocations.length,
    unmatchedLocations,
    cancelled: cancelledCount,
  });

  return matched;
}

/**
 * Dedupe key so the same event never creates two pins (sync/render reruns,
 * campus_events copies). Cancellation suffixes are kept — "Karaoke Night" and
 * "Karaoke Night (Cancelled)" are different events and must both render.
 */
export function eventDedupeKey(event: Pick<MapEventPin, "title" | "startsAt">): string {
  const title = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const startMinute = Math.floor(new Date(event.startsAt).getTime() / 60_000);
  return `${title}@${startMinute}`;
}
