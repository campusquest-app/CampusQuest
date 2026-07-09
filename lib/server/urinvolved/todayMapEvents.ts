import type { MapEventPin } from "@/lib/mapLocationGroups";
import { getCampusDayWindow, isEventCancelled } from "@/lib/realm/eventCountdown";
import { createAdminClient } from "@/lib/server/supabase";
import {
  mapEventToRealmLocation,
  normalizeLocationName,
  type CatalogLocationLike,
  type EventLocationMatch,
} from "@/lib/server/urinvolved/mapEventLocationMatch";

export type TodayExternalMapEvent = {
  pin: MapEventPin;
  match: EventLocationMatch;
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
  if (process.env.NODE_ENV !== "development" && !DEBUG_EVENT_PINS) return;
  if (detail === undefined) console.info(`[cq:urinvolved-map] ${message}`);
  else console.info(`[cq:urinvolved-map] ${message}`, detail);
}

/** Dev-only fake event at Weldin Hall starting 8 minutes from now. */
function debugFakeEvent(catalog: CatalogLocationLike[], now: Date): TodayExternalMapEvent {
  const startsAt = new Date(now.getTime() + 8 * 60_000).toISOString();
  const endsAt = new Date(now.getTime() + 68 * 60_000).toISOString();
  const match =
    mapEventToRealmLocation({ locationName: "Weldin Hall" }, catalog) ??
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

  // Fetch a padded window (±1 day) and filter to the NY day in JS so a UTC
  // boundary mismatch can never silently drop events; select * so renamed
  // columns degrade to fallbacks instead of a query error.
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
    // Map pins must not fail because the external feed table is unavailable.
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

  const matched: TodayExternalMapEvent[] = [];
  const unmatchedLocations: string[] = [];
  let cancelledCount = 0;
  let todayCount = 0;

  for (const row of rows) {
    if (!row.startsAt) continue;
    const startDate = new Date(row.startsAt);
    if (Number.isNaN(startDate.getTime()) || startDate < start || startDate >= end) continue;
    todayCount += 1;

    const rawLocation = row.venueName ?? row.locationName ?? row.address;
    if (!rawLocation) {
      debugLog("event skipped (no location text)", { title: row.title });
      continue;
    }

    const match = mapEventToRealmLocation(
      { venueName: row.venueName, locationName: row.locationName, address: row.address },
      args.catalog,
    );

    debugLog("location match attempt", {
      title: row.title,
      rawLocation,
      normalized: normalizeLocationName(rawLocation),
      matched: match
        ? match.kind === "realm"
          ? `realm:${match.realmLocationId}`
          : `coords:${match.locationName}`
        : null,
    });

    if (!match) {
      unmatchedLocations.push(rawLocation);
      console.warn("[cq:urinvolved-map] UNMATCHED event location:", rawLocation, `(${row.title})`);
      continue;
    }

    const cancelled = rowCancelled(row);
    if (cancelled) cancelledCount += 1;

    matched.push({
      match,
      pin: {
        id: `ext:${row.id}`,
        title: row.title,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        organizationName: row.organizationName,
        eventUrl: row.eventUrl,
        source: "urinvolved",
        cancelled,
        imageUrl: row.imageUrl,
        category: row.category,
        locationText: rawLocation,
      },
    });
  }

  if (DEBUG_EVENT_PINS) {
    matched.push(debugFakeEvent(args.catalog, now));
    debugLog("debug fake event injected (NEXT_PUBLIC_DEBUG_EVENT_PINS)");
  }

  debugLog("today external events summary", {
    fetched: rows.length,
    today: todayCount,
    matched: matched.length,
    matchedLocations: matched.map((m) =>
      m.match.kind === "realm" ? m.match.realmLocationId : m.match.locationName,
    ),
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
