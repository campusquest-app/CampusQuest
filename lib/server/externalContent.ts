import { dedupeLogicalEventFields } from "@/lib/realm/dedupeLogicalEvents";
import { createAdminClient } from "@/lib/server/supabase";
import { resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";
import { externalEventQualifiesForMap } from "@/lib/server/urinvolved/locationAliases";
import { mapPositionForExternalEvent } from "@/lib/server/urinvolved/geoToMapPosition";
import { getUrinvolvedSyncStatus } from "@/lib/server/urinvolved/sync";
import { shouldServeStaleInactiveEvents } from "@/lib/server/urinvolved/syncSafety";

export type ExternalEventItem = {
  id: string;
  source: string;
  externalId: string;
  title: string;
  description: string;
  organizationName: string | null;
  location: string | null;
  venueName: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  category: string | null;
  tags: string[];
  latitude: number | null;
  longitude: number | null;
  imported: true;
};

export type ExternalOrganizationItem = {
  id: string;
  source: string;
  externalId: string;
  name: string;
  description: string;
  category: string | null;
  logoUrl: string | null;
  organizationUrl: string | null;
  tags: string[];
  createdAt: string | null;
  imported: true;
};

export type ExternalMapEventMarker = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string | null;
  eventUrl: string | null;
  source: string;
  imported: true;
  x: number;
  y: number;
};

const EXTERNAL_EVENTS_PAST_GRACE_MS = 2 * 60 * 60 * 1000;

export type ExternalEventsFeedMeta = {
  source: "active" | "stale_cache";
  stale: boolean;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  lastError: string | null;
};

type ExternalEventRow = {
  id: string;
  source: string;
  external_id: string;
  title: string;
  description: string | null;
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
  latitude: number | null;
  longitude: number | null;
};

const EXTERNAL_EVENT_COLUMNS =
  "id, source, external_id, title, description, organization_name, venue_name, address, location_name, starts_at, ends_at, image_url, event_url, category, tags, latitude, longitude";

export async function listActiveExternalEvents(filters?: {
  category?: string;
  location?: string;
  organization?: string;
  search?: string;
  timeframe?: "today" | "tomorrow" | "this_week" | "this_month";
  includePast?: boolean;
}): Promise<ExternalEventItem[]> {
  const feed = await listExternalEventsFeed(filters);
  return feed.events;
}

export async function listExternalEventsFeed(filters?: {
  category?: string;
  location?: string;
  organization?: string;
  search?: string;
  timeframe?: "today" | "tomorrow" | "this_week" | "this_month";
  includePast?: boolean;
}): Promise<{ events: ExternalEventItem[]; meta: ExternalEventsFeedMeta }> {
  const admin = createAdminClient();
  const status = await getUrinvolvedSyncStatus();
  let source: ExternalEventsFeedMeta["source"] = "active";

  let query = admin
    .from("external_events")
    .select(EXTERNAL_EVENT_COLUMNS)
    .eq("is_active", true)
    .eq("source", "urinvolved")
    .order("starts_at", { ascending: true, nullsFirst: false });

  if (filters?.category?.trim()) {
    query = query.ilike("category", `%${filters.category.trim()}%`);
  }
  if (filters?.location?.trim()) {
    query = query.ilike("location_name", `%${filters.location.trim()}%`);
  }
  if (filters?.organization?.trim()) {
    query = query.ilike("organization_name", `%${filters.organization.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as ExternalEventRow[];
  const pastCutoff = Date.now() - EXTERNAL_EVENTS_PAST_GRACE_MS;
  const hasUpcomingActive = rows.some(
    (row) => row.starts_at && new Date(row.starts_at).getTime() >= pastCutoff,
  );

  if (!hasUpcomingActive && shouldServeStaleInactiveEvents(status)) {
    let staleQuery = admin
      .from("external_events")
      .select(EXTERNAL_EVENT_COLUMNS)
      .eq("is_active", false)
      .eq("source", "urinvolved")
      .not("starts_at", "is", null)
      .gte("starts_at", new Date(pastCutoff).toISOString())
      .order("starts_at", { ascending: true, nullsFirst: false });
    if (filters?.category?.trim()) {
      staleQuery = staleQuery.ilike("category", `%${filters.category.trim()}%`);
    }
    if (filters?.location?.trim()) {
      staleQuery = staleQuery.ilike("location_name", `%${filters.location.trim()}%`);
    }
    if (filters?.organization?.trim()) {
      staleQuery = staleQuery.ilike("organization_name", `%${filters.organization.trim()}%`);
    }
    const stale = await staleQuery;
    if (stale.error) throw new Error(stale.error.message);
    if ((stale.data?.length ?? 0) > 0) {
      rows = (stale.data ?? []) as ExternalEventRow[];
      source = "stale_cache";
    }
  }

  const searchNeedle = filters?.search?.trim().toLowerCase() ?? "";

  const mapped = rows
    .filter((row) => {
      if (!filters?.includePast && row.starts_at && new Date(row.starts_at).getTime() < pastCutoff) {
        return false;
      }
      if (searchNeedle) {
        const haystack = [
          row.title,
          row.description,
          row.location_name,
          row.venue_name,
          row.address,
          row.organization_name,
          row.category,
          ...(row.tags ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchNeedle)) return false;
      }
      if (!filters?.timeframe) return true;
      if (!row.starts_at) return false;
      const starts = new Date(row.starts_at);
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      if (filters.timeframe === "today") {
        const endOfToday = new Date(today);
        endOfToday.setDate(endOfToday.getDate() + 1);
        return starts >= today && starts < endOfToday;
      }
      if (filters.timeframe === "tomorrow") {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);
        return starts >= tomorrow && starts < dayAfter;
      }
      if (filters.timeframe === "this_week") {
        const day = now.getDay();
        const diffToMonday = (day + 6) % 7;
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - diffToMonday);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        return starts >= weekStart && starts < weekEnd;
      }
      if (filters.timeframe === "this_month") {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return starts >= monthStart && starts < monthEnd;
      }
      return true;
    })
    .map((row) => ({
      id: row.id,
      source: row.source,
      externalId: row.external_id,
      title: row.title,
      description: row.description ?? "",
      organizationName: row.organization_name,
      location: row.location_name,
      venueName: row.venue_name,
      address: row.address,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      imageUrl: row.image_url,
      eventUrl: row.event_url,
      category: row.category ?? "Campus Event",
      tags: row.tags ?? [],
      latitude: row.latitude,
      longitude: row.longitude,
      imported: true as const,
    }));

  return {
    events: dedupeLogicalEventFields(
      mapped.map((item) => ({
        ...item,
        sourceExternalId: item.externalId,
        locationText: item.location,
      })),
    ),
    meta: {
      source,
      stale: source === "stale_cache" || Boolean(status.lastError),
      lastSuccessfulSync: status.lastSuccessfulSync,
      lastAttemptedSync: status.lastAttemptedSync,
      lastError: status.lastError,
    },
  };
}

export async function listActiveExternalOrganizations(filters?: {
  query?: string;
  category?: string;
}): Promise<ExternalOrganizationItem[]> {
  const admin = createAdminClient();
  let dbQuery = admin
    .from("external_organizations")
    .select("id, source, external_id, name, description, logo_url, organization_url, category, tags, created_at")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (filters?.category?.trim()) {
    dbQuery = dbQuery.ilike("category", filters.category.trim());
  }
  if (filters?.query?.trim()) {
    const q = `%${filters.query.trim()}%`;
    dbQuery = dbQuery.or(`name.ilike.${q},description.ilike.${q}`);
  }

  const { data, error } = await dbQuery;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    logoUrl: row.logo_url,
    organizationUrl: row.organization_url,
    tags: row.tags ?? [],
    createdAt: row.created_at ?? null,
    imported: true as const,
  }));
}

export async function listExternalMapEventMarkers(): Promise<ExternalMapEventMarker[]> {
  const events = await listActiveExternalEvents();
  const markers: ExternalMapEventMarker[] = [];

  for (const event of events) {
    const resolved = resolveUrinvolvedEventLocation({
      venueName: event.venueName,
      address: event.address,
    });
    if (
      !externalEventQualifiesForMap({
        latitude: event.latitude,
        longitude: event.longitude,
        resolved,
      })
    ) {
      continue;
    }
    const position = mapPositionForExternalEvent({
      latitude: event.latitude,
      longitude: event.longitude,
      realmLocationId: resolved.locationMatch?.realmLocationId ?? null,
    });
    if (!position) continue;
    markers.push({
      id: event.id,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt,
      eventUrl: event.eventUrl,
      source: event.source,
      imported: true,
      x: position.x,
      y: position.y,
    });
  }

  return markers;
}
