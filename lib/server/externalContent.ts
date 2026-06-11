import { createAdminClient } from "@/lib/server/supabase";
import { mapPositionForExternalEvent } from "@/lib/server/urinvolved/geoToMapPosition";
import { matchCampusLocation } from "@/lib/server/urinvolved/locationAliases";

export type ExternalEventItem = {
  id: string;
  source: string;
  externalId: string;
  title: string;
  description: string;
  organizationName: string | null;
  location: string | null;
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

export async function listActiveExternalEvents(filters?: {
  category?: string;
  location?: string;
  timeframe?: "today" | "this_week";
}): Promise<ExternalEventItem[]> {
  const admin = createAdminClient();
  let query = admin
    .from("external_events")
    .select(
      "id, source, external_id, title, description, organization_name, location_name, starts_at, ends_at, image_url, event_url, category, tags, latitude, longitude",
    )
    .eq("is_active", true)
    .order("starts_at", { ascending: true, nullsFirst: false });

  if (filters?.category) {
    query = query.ilike("category", filters.category);
  }
  if (filters?.location?.trim()) {
    query = query.ilike("location_name", `%${filters.location.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return (data ?? [])
    .filter((row) => {
      if (!filters?.timeframe || filters.timeframe === "all") return true;
      if (!row.starts_at) return false;
      const starts = new Date(row.starts_at);
      if (filters.timeframe === "today") {
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);
        return starts >= startOfToday && starts < endOfToday;
      }
      return starts >= startOfToday && starts < endOfWeek;
    })
    .map((row) => ({
      id: row.id,
      source: row.source,
      externalId: row.external_id,
      title: row.title,
      description: row.description ?? "",
      organizationName: row.organization_name,
      location: row.location_name,
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
}

export async function listActiveExternalOrganizations(filters?: {
  query?: string;
  category?: string;
}): Promise<ExternalOrganizationItem[]> {
  const admin = createAdminClient();
  let dbQuery = admin
    .from("external_organizations")
    .select("id, source, external_id, name, description, logo_url, organization_url, category, tags")
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
    imported: true as const,
  }));
}

export async function listExternalMapEventMarkers(): Promise<ExternalMapEventMarker[]> {
  const events = await listActiveExternalEvents();
  const markers: ExternalMapEventMarker[] = [];

  for (const event of events) {
    if (event.latitude == null || event.longitude == null) continue;
    const realmMatch = matchCampusLocation(event.location);
    const position = mapPositionForExternalEvent({
      latitude: event.latitude,
      longitude: event.longitude,
      realmLocationId: realmMatch?.realmLocationId ?? null,
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
