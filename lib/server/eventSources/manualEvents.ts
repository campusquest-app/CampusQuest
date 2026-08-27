import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { canonicalEventCategory } from "@/lib/eventSources/categories";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { resolveAndUpsertEventMapPlacement } from "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement";
import { resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";
import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";

export type ManualExternalEventInput = {
  title: string;
  description?: string;
  category?: string;
  organizationName?: string;
  venueName?: string;
  address?: string;
  startsAt: string;
  endsAt?: string | null;
  eventUrl?: string | null;
  ticketUrl?: string | null;
  imageUrl?: string | null;
  sport?: string | null;
  opponent?: string | null;
};

export async function createManualExternalEvent(input: ManualExternalEventInput) {
  const title = input.title.trim();
  if (title.length < 3) throw new ApiError(400, "Title is required.", "VALIDATION_ERROR");
  const startsAt = Date.parse(input.startsAt);
  if (Number.isNaN(startsAt)) throw new ApiError(400, "Start time is invalid.", "VALIDATION_ERROR");

  const location = resolveUrinvolvedEventLocation({
    venueName: input.venueName ?? null,
    address: input.address ?? null,
  });
  const matched = hasValidCoordinates(location.locationMatch) ? location.locationMatch : null;
  const now = new Date().toISOString();
  const externalId = `manual:${crypto.randomUUID()}`;
  const category = canonicalEventCategory({
    source: "manual",
    category: input.category,
    sport: input.sport,
    title,
  });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_events")
    .insert({
      source: "manual",
      source_type: "manual",
      external_id: externalId,
      title: title.slice(0, 500),
      description: (input.description ?? "").slice(0, 5000) || null,
      organization_name: input.organizationName?.trim() || "CampusQuest Verified",
      category,
      tags: ["campusquest-verified"],
      starts_at: new Date(startsAt).toISOString(),
      ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      timezone: "America/New_York",
      venue_name: location.venueName || input.venueName || null,
      location_name: location.locationName || input.venueName || null,
      address: location.address || input.address || null,
      latitude: matched?.latitude ?? null,
      longitude: matched?.longitude ?? null,
      event_url: input.eventUrl ?? null,
      ticket_url: input.ticketUrl ?? null,
      image_url: input.imageUrl ?? null,
      sport: input.sport ?? null,
      opponent: input.opponent ?? null,
      cq_rsvp_enabled: true,
      visibility: "public",
      featured: false,
      admin_override: true,
      admin_override_fields: [],
      source_ids: { manual: externalId },
      is_active: true,
      last_seen_at: now,
      last_synced_at: now,
    })
    .select("id, title, source, external_id, starts_at")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not create event.", "EVENT_CREATE_FAILED");

  try {
    const catalog = (await getCampusLocations({ refreshCache: true })).map((row) => ({
      slug: row.slug,
      name: row.name,
    }));
    await resolveAndUpsertEventMapPlacement(String(data.id), { catalog, revalidate: false });
  } catch {
    /* placement is best-effort */
  }

  return data;
}
