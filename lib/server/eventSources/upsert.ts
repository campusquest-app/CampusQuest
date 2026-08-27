import type { NormalizedCampusEvent } from "@/lib/eventSources/types";
import { eventsLikelyDuplicate, mergeSourceIds } from "@/lib/eventSources/dedupe";
import { createAdminClient } from "@/lib/server/supabase";

type AdminClient = ReturnType<typeof createAdminClient>;

export const ADMIN_PROTECTED_EVENT_FIELDS = [
  "title",
  "description",
  "organization_name",
  "venue_name",
  "address",
  "location_name",
  "starts_at",
  "ends_at",
  "image_url",
  "event_url",
  "category",
  "tags",
  "latitude",
  "longitude",
  "sport",
  "opponent",
  "home_away",
  "ticket_url",
  "broadcast_url",
  "rsvp_url",
  "is_cancelled",
  "featured",
  "visibility",
  "audience",
  "timezone",
] as const;

type ExistingExternalEvent = {
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
  sport: string | null;
  opponent: string | null;
  home_away: string | null;
  ticket_url: string | null;
  broadcast_url: string | null;
  rsvp_url: string | null;
  is_cancelled: boolean | null;
  featured: boolean | null;
  visibility: string | null;
  audience: string | null;
  timezone: string | null;
  canonical_event_id: string | null;
  source_ids: Record<string, string> | null;
  admin_override: boolean | null;
  admin_override_fields: string[] | null;
};

export function applyAdminOverrideMerge(
  incoming: Record<string, unknown>,
  existing: Pick<ExistingExternalEvent, "admin_override" | "admin_override_fields"> & Record<string, unknown>,
): Record<string, unknown> {
  if (!existing.admin_override) return incoming;
  const protectedFields =
    Array.isArray(existing.admin_override_fields) && existing.admin_override_fields.length > 0
      ? existing.admin_override_fields
      : ADMIN_PROTECTED_EVENT_FIELDS;
  const merged = { ...incoming };
  for (const field of protectedFields) {
    if (field in existing) merged[field] = existing[field];
  }
  merged.admin_override = true;
  merged.admin_override_fields = existing.admin_override_fields ?? [];
  return merged;
}

export function normalizedEventToRow(event: NormalizedCampusEvent, nowIso: string): Record<string, unknown> {
  return {
    source: event.source,
    source_type: event.sourceType,
    external_id: event.externalId,
    title: event.title,
    description: event.description || null,
    organization_name: event.organizationName,
    organization_id: event.organizationId ?? null,
    sport: event.sport ?? null,
    opponent: event.opponent ?? null,
    home_away: event.homeAway ?? null,
    category: event.category,
    tags: event.isCancelled ? Array.from(new Set([...event.tags, "cancelled"])) : event.tags,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    timezone: event.timezone,
    venue_name: event.venueName,
    location_name: event.locationName,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    image_url: event.imageUrl,
    event_url: event.eventUrl,
    ticket_url: event.ticketUrl,
    broadcast_url: event.broadcastUrl,
    rsvp_url: event.rsvpUrl,
    cq_rsvp_enabled: event.cqRsvpEnabled,
    is_cancelled: event.isCancelled,
    live_status: event.liveStatus ?? null,
    score: event.score ?? null,
    audience: event.audience ?? null,
    visibility: event.visibility ?? "public",
    featured: event.featured ?? false,
    source_ids: event.sourceIds ?? { [event.source]: event.externalId },
    is_active: true,
    last_seen_at: nowIso,
    last_synced_at: nowIso,
    updated_at: nowIso,
  };
}

export async function findExistingExternalEvent(
  admin: AdminClient,
  source: string,
  externalId: string,
): Promise<ExistingExternalEvent | null> {
  const { data, error } = await admin
    .from("external_events")
    .select(
      "id, source, external_id, title, description, organization_name, venue_name, address, location_name, starts_at, ends_at, image_url, event_url, category, tags, latitude, longitude, sport, opponent, home_away, ticket_url, broadcast_url, rsvp_url, is_cancelled, featured, visibility, audience, timezone, canonical_event_id, source_ids, admin_override, admin_override_fields",
    )
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExistingExternalEvent | null) ?? null;
}

export async function linkCrossSourceDuplicate(
  admin: AdminClient,
  incoming: {
    id: string;
    source: string;
    externalId: string;
    title: string;
    startsAt: string | null;
    organizationName: string | null;
    locationName: string | null;
    venueName: string | null;
    address: string | null;
    opponent: string | null;
    sport: string | null;
    eventUrl: string | null;
    sourceIds: Record<string, string> | null;
  },
): Promise<boolean> {
  if (!incoming.startsAt) return false;
  const startMs = Date.parse(incoming.startsAt);
  if (Number.isNaN(startMs)) return false;
  const windowStart = new Date(startMs - 30 * 60_000).toISOString();
  const windowEnd = new Date(startMs + 30 * 60_000).toISOString();

  const { data, error } = await admin
    .from("external_events")
    .select(
      "id, source, external_id, title, starts_at, organization_name, location_name, venue_name, address, opponent, sport, event_url, canonical_event_id, source_ids, created_at",
    )
    .eq("is_active", true)
    .neq("source", incoming.source)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd)
    .neq("id", incoming.id);

  if (error || !data?.length) return false;

  const match = data.find((row) =>
    eventsLikelyDuplicate(
      {
        source: incoming.source,
        externalId: incoming.externalId,
        title: incoming.title,
        startsAt: incoming.startsAt,
        organizationName: incoming.organizationName,
        locationName: incoming.locationName,
        venueName: incoming.venueName,
        address: incoming.address,
        opponent: incoming.opponent,
        sport: incoming.sport,
        eventUrl: incoming.eventUrl,
      },
      {
        source: String(row.source ?? ""),
        externalId: String(row.external_id ?? ""),
        title: String(row.title ?? ""),
        startsAt: (row.starts_at as string | null) ?? null,
        organizationName: (row.organization_name as string | null) ?? null,
        locationName: (row.location_name as string | null) ?? null,
        venueName: (row.venue_name as string | null) ?? null,
        address: (row.address as string | null) ?? null,
        opponent: (row.opponent as string | null) ?? null,
        sport: (row.sport as string | null) ?? null,
        eventUrl: (row.event_url as string | null) ?? null,
      },
    ),
  );
  if (!match) return false;

  const canonicalId = String(match.canonical_event_id ?? match.id);
  const mergedIds = mergeSourceIds(
    mergeSourceIds((match.source_ids as Record<string, string> | null) ?? null, String(match.source), String(match.external_id)),
    incoming.source,
    incoming.externalId,
  );

  await admin
    .from("external_events")
    .update({ canonical_event_id: canonicalId, source_ids: mergedIds })
    .eq("id", incoming.id);
  await admin
    .from("external_events")
    .update({
      canonical_event_id: match.canonical_event_id ?? null,
      source_ids: mergedIds,
    })
    .eq("id", match.id);

  return true;
}
