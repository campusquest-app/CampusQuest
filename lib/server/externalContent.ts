import { canonicalEventCategory } from "@/lib/eventSources/categories";
import { inferOrganizationType } from "@/lib/eventSources/organizationTypes";
import { dedupeLogicalEventFields } from "@/lib/realm/dedupeLogicalEvents";
import { createAdminClient } from "@/lib/server/supabase";
import { resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";
import { externalEventQualifiesForMap } from "@/lib/server/urinvolved/locationAliases";
import { mapPositionForExternalEvent } from "@/lib/server/urinvolved/geoToMapPosition";
import { getUrinvolvedSyncStatus } from "@/lib/server/urinvolved/sync";
import { getLatestSyncBySource } from "@/lib/server/eventSources/syncLogs";
import { shouldServeStaleInactiveEvents } from "@/lib/server/urinvolved/syncSafety";

export type ExternalEventItem = {
  id: string;
  source: string;
  sourceType?: string | null;
  externalId: string;
  title: string;
  description: string;
  organizationName: string | null;
  organizationId?: string | null;
  location: string | null;
  venueName: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  ticketUrl?: string | null;
  broadcastUrl?: string | null;
  rsvpUrl?: string | null;
  category: string | null;
  tags: string[];
  sport?: string | null;
  opponent?: string | null;
  homeAway?: string | null;
  score?: string | null;
  liveStatus?: string | null;
  cqRsvpEnabled?: boolean;
  isCancelled?: boolean;
  canonicalEventId?: string | null;
  latitude: number | null;
  longitude: number | null;
  rsvpCount?: number;
  myRsvpStatus?: "going" | "interested" | "not_going" | null;
  imported: true;
};

export type ExternalOrganizationItem = {
  id: string;
  source: string;
  sourceType?: string | null;
  externalId: string;
  name: string;
  description: string;
  category: string | null;
  organizationType?: string | null;
  logoUrl: string | null;
  organizationUrl: string | null;
  websiteUrl?: string | null;
  verified?: boolean;
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
  source_type?: string | null;
  external_id: string;
  title: string;
  description: string | null;
  organization_name: string | null;
  organization_id?: string | null;
  venue_name: string | null;
  address: string | null;
  location_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  event_url: string | null;
  ticket_url?: string | null;
  broadcast_url?: string | null;
  rsvp_url?: string | null;
  category: string | null;
  tags: string[] | null;
  sport?: string | null;
  opponent?: string | null;
  home_away?: string | null;
  score?: string | null;
  live_status?: string | null;
  cq_rsvp_enabled?: boolean | null;
  is_cancelled?: boolean | null;
  canonical_event_id?: string | null;
  latitude: number | null;
  longitude: number | null;
};

const EXTERNAL_EVENT_COLUMNS =
  "id, source, source_type, external_id, title, description, organization_name, organization_id, venue_name, address, location_name, starts_at, ends_at, image_url, event_url, ticket_url, broadcast_url, rsvp_url, category, tags, sport, opponent, home_away, score, live_status, cq_rsvp_enabled, is_cancelled, canonical_event_id, latitude, longitude";

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
  sport?: string;
  userId?: string;
}): Promise<{ events: ExternalEventItem[]; meta: ExternalEventsFeedMeta }> {
  const admin = createAdminClient();
  const [urinvolvedStatus, athleticsSync] = await Promise.all([
    getUrinvolvedSyncStatus(),
    getLatestSyncBySource(admin, "athletics").catch(() => null),
  ]);
  const lastSuccessfulSync = [urinvolvedStatus.lastSuccessfulSync, athleticsSync?.lastSuccessfulSync]
    .filter(Boolean)
    .sort()
    .at(-1) ?? urinvolvedStatus.lastSuccessfulSync;
  const lastAttemptedSync = [urinvolvedStatus.lastAttemptedSync, athleticsSync?.lastAttemptedSync]
    .filter(Boolean)
    .sort()
    .at(-1) ?? urinvolvedStatus.lastAttemptedSync;
  const lastError = urinvolvedStatus.lastError || athleticsSync?.lastError || null;
  let source: ExternalEventsFeedMeta["source"] = "active";

  let query = admin
    .from("external_events")
    .select(EXTERNAL_EVENT_COLUMNS)
    .eq("is_active", true)
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

  if (!hasUpcomingActive && shouldServeStaleInactiveEvents(urinvolvedStatus)) {
    let staleQuery = admin
      .from("external_events")
      .select(EXTERNAL_EVENT_COLUMNS)
      .eq("is_active", false)
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
      if (filters?.sport?.trim() && !(row.sport ?? "").toLowerCase().includes(filters.sport.trim().toLowerCase())) {
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
          row.sport,
          row.opponent,
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
      sourceType: row.source_type ?? row.source,
      externalId: row.external_id,
      title: row.title,
      description: row.description ?? "",
      organizationName: row.organization_name,
      organizationId: row.organization_id ?? null,
      location: row.location_name,
      venueName: row.venue_name,
      address: row.address,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      imageUrl: row.image_url,
      eventUrl: row.event_url,
      ticketUrl: row.ticket_url ?? null,
      broadcastUrl: row.broadcast_url ?? null,
      rsvpUrl: row.rsvp_url ?? null,
      category: canonicalEventCategory({
        source: row.source,
        category: row.category,
        sport: row.sport,
        title: row.title,
        tags: row.tags,
      }),
      tags: row.tags ?? [],
      sport: row.sport ?? null,
      opponent: row.opponent ?? null,
      homeAway: row.home_away ?? null,
      score: row.score ?? null,
      liveStatus: row.live_status ?? null,
      cqRsvpEnabled: Boolean(row.cq_rsvp_enabled),
      isCancelled: Boolean(row.is_cancelled),
      canonicalEventId: row.canonical_event_id ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      rsvpCount: 0,
      myRsvpStatus: null as ExternalEventItem["myRsvpStatus"],
      imported: true as const,
    }));

  const deduped = dedupeLogicalEventFields(
    mapped.map((item) => ({
      ...item,
      sourceExternalId: item.externalId,
      locationText: item.location,
      canonicalEventId: item.canonicalEventId,
    })),
  );

  if (filters?.userId && deduped.length > 0) {
    const ids = deduped.map((item) => item.id);
    const [{ data: rsvps }, { data: mine }] = await Promise.all([
      admin.from("external_event_rsvps").select("event_id, status, user_id").in("event_id", ids),
      admin
        .from("external_event_rsvps")
        .select("event_id, status")
        .in("event_id", ids)
        .eq("user_id", filters.userId),
    ]);
    const counts = new Map<string, number>();
    for (const row of rsvps ?? []) {
      if (row.status === "going") counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
    }
    const mineMap = new Map(
      (mine ?? []).map((row) => [row.event_id, row.status as ExternalEventItem["myRsvpStatus"]]),
    );
    for (const item of deduped) {
      item.rsvpCount = counts.get(item.id) ?? 0;
      item.myRsvpStatus = mineMap.get(item.id) ?? null;
    }
  }

  return {
    events: deduped,
    meta: {
      source,
      stale: source === "stale_cache" || Boolean(lastError),
      lastSuccessfulSync,
      lastAttemptedSync,
      lastError,
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
    .select("id, source, source_type, external_id, name, description, logo_url, organization_url, website_url, category, organization_type, verified, tags, created_at")
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
    sourceType: row.source_type ?? row.source,
    externalId: row.external_id,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    organizationType: inferOrganizationType({
      source: row.source,
      organizationType: row.organization_type,
      category: row.category,
      name: row.name,
    }),
    logoUrl: row.logo_url,
    organizationUrl: row.organization_url ?? row.website_url,
    websiteUrl: row.website_url ?? row.organization_url,
    verified: Boolean(row.verified),
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
