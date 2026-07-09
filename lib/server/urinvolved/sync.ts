import { createAdminClient } from "@/lib/server/supabase";
import {
  buildOrganizationLogoUrl,
  buildOrganizationUrl,
  fetchAllUrinvolvedOrganizations,
  fetchUrinvolvedEventDetail,
  fetchUrinvolvedEventsRss,
  stripHtmlToText,
} from "@/lib/server/urinvolved/fetchSources";
import {
  buildUrinvolvedAddressString,
  classifyImportedEventLocation,
  resolveUrinvolvedEventLocation,
} from "@/lib/server/urinvolved/eventLocation";
import { parseUrinvolvedEventsRss, type ParsedUrinvolvedEvent } from "@/lib/server/urinvolved/parseRssEvents";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import {
  loadOverridesForEventIds,
  upsertAutoPlacementOverride,
} from "@/lib/server/externalEventMapOverrides";

export const URINVOLVED_SOURCE = "urinvolved";

export type UrinvolvedSyncSummary = {
  success: boolean;
  events_created: number;
  events_updated: number;
  orgs_created: number;
  orgs_updated: number;
  errors: string[];
  syncLogId?: string;
};

type SyncLogRow = {
  id: string;
};

async function startSyncLog(admin: ReturnType<typeof createAdminClient>, syncType: string) {
  const { data, error } = await admin
    .from("sync_logs")
    .insert({
      source: URINVOLVED_SOURCE,
      sync_type: syncType,
      status: "running",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not start sync log.");
  return data as SyncLogRow;
}

async function finishSyncLog(
  admin: ReturnType<typeof createAdminClient>,
  logId: string,
  patch: {
    status: "success" | "failed";
    events_created: number;
    events_updated: number;
    orgs_created: number;
    orgs_updated: number;
    error_message?: string | null;
  },
) {
  await admin
    .from("sync_logs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
    })
    .eq("id", logId);
}

async function resolveImportedEventLocation(event: ParsedUrinvolvedEvent) {
  let venueName = event.venueName;
  let address = event.address;

  try {
    const detail = await fetchUrinvolvedEventDetail(event.externalId);
    if (detail?.address) {
      venueName = detail.address.name?.trim() || venueName;
      address = buildUrinvolvedAddressString(detail.address) || address;
    }
  } catch {
    /* RSS-only fallback */
  }

  return resolveUrinvolvedEventLocation({ venueName, address });
}

export async function runUrinvolvedSync(syncType: "cron" | "manual" | "api" = "api"): Promise<UrinvolvedSyncSummary> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let orgsCreated = 0;
  let orgsUpdated = 0;

  const log = await startSyncLog(admin, syncType);
  const now = new Date().toISOString();
  const seenEventIds: string[] = [];
  const seenOrgIds: string[] = [];

  try {
    // --- Events (official RSS feed) ---
    try {
      const rssXml = await fetchUrinvolvedEventsRss();
      const parsedEvents = parseUrinvolvedEventsRss(rssXml);
      const catalog = (await getCampusLocations({ refreshCache: true })).map((row) => ({
        slug: row.slug,
        name: row.name,
      }));

      for (const event of parsedEvents) {
        seenEventIds.push(event.externalId);
        const location = await resolveImportedEventLocation(event);
        const row = {
          source: URINVOLVED_SOURCE,
          external_id: event.externalId,
          title: event.title.slice(0, 500),
          description: event.description.slice(0, 5000) || null,
          organization_name: event.organizationName,
          venue_name: location.venueName,
          address: location.address,
          location_name: location.locationName,
          starts_at: event.startsAt,
          ends_at: event.endsAt,
          image_url: event.imageUrl,
          event_url: event.eventUrl,
          category: event.category,
          tags: event.tags,
          latitude: location.locationMatch?.latitude ?? null,
          longitude: location.locationMatch?.longitude ?? null,
          is_active: true,
          last_seen_at: now,
          updated_at: now,
        };

        const { data: existing } = await admin
          .from("external_events")
          .select("id")
          .eq("external_id", event.externalId)
          .maybeSingle();

        const { data: upserted, error: upsertError } = await admin
          .from("external_events")
          .upsert(row, { onConflict: "external_id" })
          .select("id")
          .single();
        if (upsertError) {
          errors.push(`Event ${event.externalId}: ${upsertError.message}`);
          continue;
        }
        if (existing) eventsUpdated += 1;
        else eventsCreated += 1;

        const externalEventId = String(upserted?.id ?? existing?.id ?? "");
        if (externalEventId) {
          const overrides = await loadOverridesForEventIds([externalEventId]);
          await upsertAutoPlacementOverride({
            externalEventId,
            fields: {
              venueName: location.venueName,
              locationName: location.locationName,
              address: location.address,
            },
            catalog,
            existing: overrides.get(externalEventId) ?? null,
          });
        }
      }
    } catch (eventError) {
      errors.push(eventError instanceof Error ? eventError.message : String(eventError));
    }

    // --- Organizations (public discovery search API) ---
    try {
      const orgs = await fetchAllUrinvolvedOrganizations();
      for (const org of orgs) {
        if (!org.Id || !org.Name?.trim()) continue;
        seenOrgIds.push(org.Id);
        const description =
          stripHtmlToText(org.Description) || stripHtmlToText(org.Summary) || null;
        const tags = (org.CategoryNames ?? []).filter(Boolean);
        const row = {
          source: URINVOLVED_SOURCE,
          external_id: org.Id,
          name: org.Name.trim().slice(0, 200),
          description: description?.slice(0, 5000) ?? null,
          logo_url: buildOrganizationLogoUrl(org.ProfilePicture),
          organization_url: buildOrganizationUrl(org.WebsiteKey, org.Id),
          category: tags[0] ?? null,
          tags,
          is_active: true,
          last_seen_at: now,
          updated_at: now,
        };

        const { data: existing } = await admin
          .from("external_organizations")
          .select("id")
          .eq("external_id", org.Id)
          .maybeSingle();

        const { error: upsertError } = await admin
          .from("external_organizations")
          .upsert(row, { onConflict: "external_id" });
        if (upsertError) {
          errors.push(`Org ${org.Id}: ${upsertError.message}`);
          continue;
        }
        if (existing) orgsUpdated += 1;
        else orgsCreated += 1;
      }
    } catch (orgError) {
      errors.push(orgError instanceof Error ? orgError.message : String(orgError));
    }

    // Deactivate items missing from this sync (soft-hide, never delete).
    const { data: activeEventRows } = await admin
      .from("external_events")
      .select("external_id")
      .eq("source", URINVOLVED_SOURCE)
      .eq("is_active", true);
    const eventIdsToDeactivate = (activeEventRows ?? [])
      .map((row) => row.external_id as string)
      .filter((id) => !seenEventIds.includes(id));
    if (eventIdsToDeactivate.length > 0) {
      await admin
        .from("external_events")
        .update({ is_active: false, updated_at: now })
        .in("external_id", eventIdsToDeactivate);
    }

    const { data: activeOrgRows } = await admin
      .from("external_organizations")
      .select("external_id")
      .eq("source", URINVOLVED_SOURCE)
      .eq("is_active", true);
    const orgIdsToDeactivate = (activeOrgRows ?? [])
      .map((row) => row.external_id as string)
      .filter((id) => !seenOrgIds.includes(id));
    if (orgIdsToDeactivate.length > 0) {
      await admin
        .from("external_organizations")
        .update({ is_active: false, updated_at: now })
        .in("external_id", orgIdsToDeactivate);
    }

    const success = errors.length === 0;
    await finishSyncLog(admin, log.id, {
      status: success ? "success" : "failed",
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: orgsCreated,
      orgs_updated: orgsUpdated,
      error_message: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
    });

    return {
      success,
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: orgsCreated,
      orgs_updated: orgsUpdated,
      errors,
      syncLogId: log.id,
    };
  } catch (fatalError) {
    const message = fatalError instanceof Error ? fatalError.message : String(fatalError);
    await finishSyncLog(admin, log.id, {
      status: "failed",
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: orgsCreated,
      orgs_updated: orgsUpdated,
      error_message: message,
    });
    return {
      success: false,
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: orgsCreated,
      orgs_updated: orgsUpdated,
      errors: [message, ...errors],
      syncLogId: log.id,
    };
  }
}

export type UrinvolvedSyncStatus = {
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  totalEventsCount: number;
  activeEventsCount: number;
  upcomingActiveEventsCount: number;
  activeOrganizationsCount: number;
  eventsWithVenueCount: number;
  eventsWithAddressCount: number;
  eventsMissingLocationCount: number;
  eventsMatchedToMapCount: number;
  eventsMatchedByAddressCount: number;
  eventsMatchedByVenueOrNameCount: number;
  eventsNotOnMapNoPinCount: number;
  lastError: string | null;
};

export async function getUrinvolvedSyncStatus(): Promise<UrinvolvedSyncStatus> {
  const admin = createAdminClient();
  const pastCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const [
    { data: logs },
    { count: totalEventsCount },
    { count: activeEventsCount },
    { count: upcomingActiveEventsCount },
    { count: activeOrganizationsCount },
    { data: activeEvents },
  ] = await Promise.all([
    admin
      .from("sync_logs")
      .select("status, started_at, finished_at, error_message")
      .eq("source", URINVOLVED_SOURCE)
      .order("started_at", { ascending: false })
      .limit(20),
    admin.from("external_events").select("id", { count: "exact", head: true }).eq("source", URINVOLVED_SOURCE),
    admin
      .from("external_events")
      .select("id", { count: "exact", head: true })
      .eq("source", URINVOLVED_SOURCE)
      .eq("is_active", true),
    admin
      .from("external_events")
      .select("id", { count: "exact", head: true })
      .eq("source", URINVOLVED_SOURCE)
      .eq("is_active", true)
      .not("starts_at", "is", null)
      .gte("starts_at", pastCutoff),
    admin
      .from("external_organizations")
      .select("id", { count: "exact", head: true })
      .eq("source", URINVOLVED_SOURCE)
      .eq("is_active", true),
    admin
      .from("external_events")
      .select("venue_name, address, location_name, latitude, longitude")
      .eq("source", URINVOLVED_SOURCE)
      .eq("is_active", true),
  ]);

  const rows = logs ?? [];
  const lastAttemptedSync = rows[0]?.started_at ?? null;
  const lastSuccess = rows.find((row) => row.status === "success");
  const lastFailed = rows.find((row) => row.status === "failed");

  let eventsWithVenueCount = 0;
  let eventsWithAddressCount = 0;
  let eventsMissingLocationCount = 0;
  let eventsMatchedToMapCount = 0;
  let eventsMatchedByAddressCount = 0;
  let eventsMatchedByVenueOrNameCount = 0;
  let eventsNotOnMapNoPinCount = 0;

  for (const event of activeEvents ?? []) {
    const venue = typeof event.venue_name === "string" ? event.venue_name.trim() : "";
    const address = typeof event.address === "string" ? event.address.trim() : "";
    const locationName = typeof event.location_name === "string" ? event.location_name.trim() : "";

    if (venue) eventsWithVenueCount += 1;
    if (address) eventsWithAddressCount += 1;

    const classification = classifyImportedEventLocation({
      venueName: venue || null,
      address: address || null,
      locationName: locationName || null,
      latitude: event.latitude,
      longitude: event.longitude,
    });

    if (classification.missingLocation) {
      eventsMissingLocationCount += 1;
    }
    if (classification.onMap) {
      eventsMatchedToMapCount += 1;
    }
    if (classification.matchedBy === "venue") {
      eventsMatchedByVenueOrNameCount += 1;
    } else if (classification.aliasMatched && address) {
      eventsMatchedByAddressCount += 1;
    } else if (classification.aliasMatched) {
      eventsMatchedByVenueOrNameCount += 1;
    }
    if (classification.matchedWithoutMapPin) {
      eventsNotOnMapNoPinCount += 1;
    }
  }

  return {
    lastSuccessfulSync: lastSuccess?.finished_at ?? lastSuccess?.started_at ?? null,
    lastAttemptedSync,
    totalEventsCount: totalEventsCount ?? 0,
    activeEventsCount: activeEventsCount ?? 0,
    upcomingActiveEventsCount: upcomingActiveEventsCount ?? 0,
    activeOrganizationsCount: activeOrganizationsCount ?? 0,
    eventsWithVenueCount,
    eventsWithAddressCount,
    eventsMissingLocationCount,
    eventsMatchedToMapCount,
    eventsMatchedByAddressCount,
    eventsMatchedByVenueOrNameCount,
    eventsNotOnMapNoPinCount,
    lastError: lastFailed?.error_message ?? null,
  };
}
