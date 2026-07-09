import type { MapEventPin } from "@/lib/mapLocationGroups";
import { getCampusDayWindow, isEventCancelled } from "@/lib/realm/eventCountdown";
import { createAdminClient } from "@/lib/server/supabase";
import {
  mapEventToRealmLocation,
  type CatalogLocationLike,
} from "@/lib/server/urinvolved/mapEventLocationMatch";

export type TodayExternalMapEvent = {
  pin: MapEventPin;
  realmLocationId: string;
};

type ExternalEventRow = {
  id: string;
  title: string;
  organization_name: string | null;
  venue_name: string | null;
  address: string | null;
  location_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  event_url: string | null;
  category: string | null;
  tags: string[] | null;
};

function rowCancelled(row: ExternalEventRow): boolean {
  if (isEventCancelled({ title: row.title })) return true;
  return (row.tags ?? []).some((tag) => /^cancell?ed$/i.test(tag.trim()));
}

function debugLog(message: string, detail: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info(`[cq:urinvolved-map] ${message}`, detail);
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
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("external_events")
    .select(
      "id, title, organization_name, venue_name, address, location_name, starts_at, ends_at, image_url, event_url, category, tags",
    )
    .eq("is_active", true)
    .eq("source", "urinvolved")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (error) {
    // Map pins must not fail because the external feed table is unavailable.
    debugLog("external events query failed", { error: error.message });
    return [];
  }

  const rows = (data ?? []) as ExternalEventRow[];
  const matched: TodayExternalMapEvent[] = [];
  const unmatchedLocations: string[] = [];
  let cancelledCount = 0;

  for (const row of rows) {
    if (!row.starts_at) continue;
    const hasLocationText = Boolean(
      row.venue_name?.trim() || row.location_name?.trim() || row.address?.trim(),
    );
    if (!hasLocationText) continue;

    const match = mapEventToRealmLocation(
      {
        venueName: row.venue_name,
        locationName: row.location_name,
        address: row.address,
      },
      args.catalog,
    );

    if (!match) {
      unmatchedLocations.push(row.venue_name ?? row.location_name ?? row.address ?? "");
      continue;
    }

    const cancelled = rowCancelled(row);
    if (cancelled) cancelledCount += 1;

    matched.push({
      realmLocationId: match.realmLocationId,
      pin: {
        id: `ext:${row.id}`,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        organizationName: row.organization_name,
        eventUrl: row.event_url,
        source: "urinvolved",
        cancelled,
        imageUrl: row.image_url,
        category: row.category,
        locationText: row.venue_name ?? row.location_name ?? row.address ?? null,
      },
    });
  }

  debugLog("today external events", {
    total: rows.length,
    matched: matched.length,
    matchedLocations: matched.map((m) => m.realmLocationId),
    unmatchedLocations,
    cancelled: cancelledCount,
    window: { start: start.toISOString(), end: end.toISOString() },
  });

  return matched;
}

/** Dedupe key so the same event never creates two pins (sync/render reruns, campus_events copies). */
export function eventDedupeKey(event: Pick<MapEventPin, "title" | "startsAt">): string {
  const title = event.title
    .toLowerCase()
    .replace(/\(cancell?ed\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const startMinute = Math.floor(new Date(event.startsAt).getTime() / 60_000);
  return `${title}@${startMinute}`;
}
