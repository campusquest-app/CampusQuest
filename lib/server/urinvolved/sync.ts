import { createAdminClient } from "@/lib/server/supabase";
import {
  URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE,
  buildOrganizationLogoUrl,
  buildOrganizationUrl,
  fetchAllUrinvolvedOrganizations,
  fetchUrinvolvedEventDetail,
  fetchUpcomingUrinvolvedDiscoveryEvents,
  stripHtmlToText,
} from "@/lib/server/urinvolved/fetchSources";
import {
  buildUrinvolvedAddressString,
  classifyImportedEventLocation,
  resolveUrinvolvedEventLocation,
} from "@/lib/server/urinvolved/eventLocation";
import { parseUrinvolvedDiscoveryEvents } from "@/lib/server/urinvolved/parseDiscoveryEvents";
import { type ParsedUrinvolvedEvent } from "@/lib/server/urinvolved/parseRssEvents";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { getLogicalEventFallbackKey, isLogicalEventCancelled } from "@/lib/realm/dedupeLogicalEvents";
import { resolveAndUpsertEventMapPlacement } from "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement";
import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";
import {
  decideSoftDeactivateMissingEvents,
  idsMissingFromSeen,
  countUpcomingFromActiveRows,
} from "@/lib/server/urinvolved/syncSafety";
import { applyAdminOverrideMerge } from "@/lib/server/eventSources/upsert";
import { upsertBySourceExternalId } from "@/lib/server/eventSources/upsertBySourceExternalId";
import { revalidatePath } from "next/cache";

export const URINVOLVED_SOURCE = "urinvolved";

export type UrinvolvedSyncSummary = {
  success: boolean;
  events_fetched: number;
  events_created: number;
  events_updated: number;
  events_failed: number;
  events_unresolved_location: number;
  events_map_matched: number;
  orgs_created: number;
  orgs_updated: number;
  errors: string[];
  syncLogId?: string;
  skipped?: boolean;
  skip_reason?: string | null;
};

type SyncLogRow = {
  id: string;
};

/** In-process mutex so concurrent cron/manual/api callers share one sync. */
let syncInFlight: Promise<UrinvolvedSyncSummary> | null = null;

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
    events_received?: number;
    duplicates_merged?: number;
    error_count?: number;
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
    /* discovery/RSS-only fallback */
  }

  return resolveUrinvolvedEventLocation({ venueName, address });
}

async function findActiveLogicalDuplicateEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: ParsedUrinvolvedEvent,
): Promise<{ id: string; external_id: string } | null> {
  if (!event.startsAt) return null;

  const startMs = new Date(event.startsAt).getTime();
  if (Number.isNaN(startMs)) return null;
  const windowStart = new Date(startMs - 15 * 60_000).toISOString();
  const windowEnd = new Date(startMs + 15 * 60_000).toISOString();

  const { data } = await admin
    .from("external_events")
    .select(
      "id, external_id, title, organization_name, location_name, venue_name, address, starts_at, event_url, updated_at, tags",
    )
    .eq("source", URINVOLVED_SOURCE)
    .eq("is_active", true)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  // Compare fallback fingerprints so republished listings with new external IDs still merge.
  const incomingKey = getLogicalEventFallbackKey({
    title: event.title,
    startsAt: event.startsAt,
    organizationName: event.organizationName,
    locationName: event.locationName,
    eventUrl: event.eventUrl,
  });

  for (const row of data ?? []) {
    if (String(row.external_id) === event.externalId) continue;
    const rowKey = getLogicalEventFallbackKey({
      title: String(row.title ?? ""),
      startsAt: (row.starts_at as string | null) ?? null,
      organizationName: (row.organization_name as string | null) ?? null,
      locationName: (row.location_name as string | null) ?? null,
      locationText: (row.venue_name as string | null) ?? (row.address as string | null) ?? null,
      eventUrl: (row.event_url as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
      tags: (row.tags as string[] | null) ?? null,
    });
    if (rowKey === incomingKey) {
      return { id: String(row.id), external_id: String(row.external_id) };
    }
  }
  return null;
}

async function hasRecentRunningSync(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await admin
    .from("sync_logs")
    .select("id")
    .eq("source", URINVOLVED_SOURCE)
    .eq("status", "running")
    .gte("started_at", cutoff)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function runUrinvolvedSync(syncType: "cron" | "manual" | "api" = "api"): Promise<UrinvolvedSyncSummary> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = runUrinvolvedSyncExclusive(syncType).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runUrinvolvedSyncExclusive(
  syncType: "cron" | "manual" | "api",
): Promise<UrinvolvedSyncSummary> {
  const admin = createAdminClient();
  const errors: string[] = [];
  let eventsFetched = 0;
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let eventsFailed = 0;
  let eventsUnresolvedLocation = 0;
  let eventsMapMatched = 0;
  let orgsCreated = 0;
  let orgsUpdated = 0;
  let eventsFetchAttempted = false;
  let eventsFetchSucceeded = false;
  let eventsPayloadValid = true;
  let upstreamHttpStatus: number | null = null;
  let upstreamReceived = 0;
  let eventsDeactivated = 0;
  let inventoryPreserved = false;
  let orgsFetchSucceeded = false;
  const startedMs = Date.now();

  if (await hasRecentRunningSync(admin)) {
    return {
      success: false,
      events_fetched: 0,
      events_created: 0,
      events_updated: 0,
      events_failed: 0,
      events_unresolved_location: 0,
      events_map_matched: 0,
      orgs_created: 0,
      orgs_updated: 0,
      errors: ["URInvolved sync already in progress."],
      skipped: true,
      skip_reason: "already_running",
    };
  }

  const log = await startSyncLog(admin, syncType);
  const now = new Date().toISOString();
  const seenEventIds: string[] = [];
  const seenOrgIds: string[] = [];

  console.info("[cq:urinvolved-sync] started", {
    syncType,
    source: URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE,
  });

  try {
    // --- Events (discovery search — full upcoming catalog; not the 24h RSS window) ---
    try {
      eventsFetchAttempted = true;
      const discovery = await fetchUpcomingUrinvolvedDiscoveryEvents();
      upstreamHttpStatus = discovery.httpStatus;
      upstreamReceived = discovery.raw.length;
      const parsedEvents = parseUrinvolvedDiscoveryEvents(discovery.raw);
      if (discovery.raw.length > 0 && parsedEvents.length === 0) {
        eventsPayloadValid = false;
        throw new Error("URInvolved events discovery payload could not be parsed.");
      }
      eventsFetched = parsedEvents.length;
      eventsFetchSucceeded = true;
      console.info("[cq:urinvolved-sync] upstream", {
        source: URINVOLVED_AUTHORITATIVE_EVENTS_SOURCE,
        httpStatus: discovery.httpStatus,
        received: discovery.raw.length,
        validated: parsedEvents.length,
        totalCount: discovery.totalCount,
      });

      const catalog = (await getCampusLocations({ refreshCache: true })).map((row) => ({
        slug: row.slug,
        name: row.name,
      }));

      for (const event of parsedEvents) {
        try {
          const logicalDuplicate = await findActiveLogicalDuplicateEvent(admin, event);
          const canonicalExternalId = logicalDuplicate?.external_id ?? event.externalId;

          const location = await resolveImportedEventLocation(event);
          const cancelled = isLogicalEventCancelled({ title: event.title, tags: event.tags });
          const matched = hasValidCoordinates(location.locationMatch) ? location.locationMatch : null;

          if (!matched) {
            eventsUnresolvedLocation += 1;
            console.warn("[cq:urinvolved-sync] unresolved location", {
              externalId: event.externalId,
              title: event.title,
              rawLocation: location.venueName || location.address || location.locationName || null,
              stage: "resolveImportedEventLocation",
              aliasMatched: location.aliasMatched,
              mapPinAvailable: location.mapPinAvailable,
            });
          } else {
            eventsMapMatched += 1;
          }

          const row = {
            source: URINVOLVED_SOURCE,
            source_type: URINVOLVED_SOURCE,
            external_id: canonicalExternalId,
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
            tags: cancelled ? Array.from(new Set([...event.tags, "cancelled"])) : event.tags,
            latitude: matched?.latitude ?? null,
            longitude: matched?.longitude ?? null,
            timezone: "America/New_York",
            cq_rsvp_enabled: false,
            is_cancelled: cancelled,
            source_ids: { [URINVOLVED_SOURCE]: canonicalExternalId },
            is_active: true,
            last_seen_at: now,
            last_synced_at: now,
            updated_at: now,
          };

          const { data: existing } = await admin
            .from("external_events")
            .select("id, admin_override, admin_override_fields, title, description, organization_name, venue_name, address, location_name, starts_at, ends_at, image_url, event_url, category, tags, latitude, longitude, sport, opponent, ticket_url, broadcast_url, rsvp_url, is_cancelled, featured, visibility, audience, timezone")
            .eq("source", URINVOLVED_SOURCE)
            .eq("external_id", canonicalExternalId)
            .maybeSingle();

          const mergedRow = existing
            ? applyAdminOverrideMerge(row, existing as Record<string, unknown> & {
                admin_override: boolean | null;
                admin_override_fields: string[] | null;
              })
            : row;

          const { data: upserted, error: upsertError } = await (async () => {
            try {
              const result = await upsertBySourceExternalId(
                admin,
                "external_events",
                {
                  ...mergedRow,
                  source: URINVOLVED_SOURCE,
                  external_id: canonicalExternalId,
                },
                {
                selectId: true,
              },
              );
              return { data: result.id ? { id: result.id } : null, error: null as null };
            } catch (error) {
              return {
                data: null,
                error: { message: error instanceof Error ? error.message : String(error) },
              };
            }
          })();
          if (upsertError) {
            eventsFailed += 1;
            const message = upsertError.message;
            errors.push(message.startsWith("Event ") ? message : `Event ${event.externalId}: ${message}`);
            continue;
          }
          if (existing) eventsUpdated += 1;
          else eventsCreated += 1;

          if (logicalDuplicate && logicalDuplicate.external_id !== event.externalId) {
            await admin
              .from("external_events")
              .update({ is_active: false, updated_at: now })
              .eq("source", URINVOLVED_SOURCE)
              .eq("external_id", event.externalId);
          }

          seenEventIds.push(canonicalExternalId);

          const externalEventId = String(upserted?.id ?? existing?.id ?? "");
          if (externalEventId) {
            try {
              // Shared placement pipeline — never depends on opening the map.
              await resolveAndUpsertEventMapPlacement(externalEventId, {
                catalog,
                revalidate: false,
              });
            } catch (placementError) {
              const message =
                placementError instanceof Error ? placementError.message : String(placementError);
              console.warn("[cq:urinvolved-sync] placement failed", {
                externalId: event.externalId,
                title: event.title,
                rawLocation: location.venueName || location.address || location.locationName || null,
                stage: "resolveAndUpsertEventMapPlacement",
                error: message,
              });
              // Event row already imported — placement failure must not abort or fail the sync.
            }
          }
        } catch (eventError) {
          eventsFailed += 1;
          const message = eventError instanceof Error ? eventError.message : String(eventError);
          console.warn("[cq:urinvolved-sync] event import failed", {
            externalId: event.externalId,
            title: event.title,
            rawLocation: event.venueName || event.address || event.locationName || null,
            stage: "import_event",
            error: message,
          });
          errors.push(`Event ${event.externalId}: ${message}`);
        }
      }
    } catch (eventError) {
      eventsFetchSucceeded = false;
      errors.push(eventError instanceof Error ? eventError.message : String(eventError));
    }

    // --- Organizations (public discovery search API) ---
    try {
      const orgs = await fetchAllUrinvolvedOrganizations();
      orgsFetchSucceeded = true;
      for (const org of orgs) {
        if (!org.Id || !org.Name?.trim()) continue;
        const orgExternalId = String(org.Id);
        seenOrgIds.push(orgExternalId);
        const description =
          stripHtmlToText(org.Description) || stripHtmlToText(org.Summary) || null;
        const tags = (org.CategoryNames ?? []).filter(Boolean);
        const row = {
          source: URINVOLVED_SOURCE,
          source_type: URINVOLVED_SOURCE,
          external_id: orgExternalId,
          name: org.Name.trim().slice(0, 200),
          description: description?.slice(0, 5000) ?? null,
          logo_url: buildOrganizationLogoUrl(org.ProfilePicture),
          organization_url: buildOrganizationUrl(org.WebsiteKey, orgExternalId),
          website_url: buildOrganizationUrl(org.WebsiteKey, orgExternalId),
          category: tags[0] ?? null,
          tags,
          organization_type: "student_club",
          is_active: true,
          last_seen_at: now,
          updated_at: now,
        };

        const { data: existing } = await admin
          .from("external_organizations")
          .select("id")
          .eq("source", URINVOLVED_SOURCE)
          .eq("external_id", orgExternalId)
          .maybeSingle();

        try {
          const upserted = await upsertBySourceExternalId(admin, "external_organizations", row, {
            selectId: false,
          });
          if (existing || !upserted.created) orgsUpdated += 1;
          else orgsCreated += 1;
        } catch (upsertError) {
          const message = upsertError instanceof Error ? upsertError.message : String(upsertError);
          errors.push(message.startsWith("Org ") ? message : `Org ${orgExternalId}: ${message}`);
          continue;
        }
      }
    } catch (orgError) {
      orgsFetchSucceeded = false;
      errors.push(orgError instanceof Error ? orgError.message : String(orgError));
    }

    // Soft-hide missing items only after a verified non-empty catalog (or a
    // truly empty campus with no stored upcoming events). Never wipe inventory
    // from an unverified empty/failed/malformed upstream response.
    const { data: storedEventRows } = await admin
      .from("external_events")
      .select("external_id, starts_at, is_active")
      .eq("source", URINVOLVED_SOURCE);
    const activeEventRows = (storedEventRows ?? []).filter((row) => row.is_active);
    const existingUpcomingActiveCount = countUpcomingFromActiveRows(activeEventRows);
    const existingUpcomingStoredCount = countUpcomingFromActiveRows(storedEventRows ?? []);
    const eventDeactivate = decideSoftDeactivateMissingEvents({
      fetchAttempted: eventsFetchAttempted,
      fetchSucceeded: eventsFetchSucceeded,
      eventsFetched,
      existingUpcomingActiveCount,
      existingUpcomingStoredCount,
      payloadValid: eventsPayloadValid,
    });
    inventoryPreserved = eventDeactivate.preservePreviousInventory;
    if (eventDeactivate.shouldDeactivate) {
      const eventIdsToDeactivate = idsMissingFromSeen(
        (activeEventRows ?? []).map((row) => row.external_id as string),
        seenEventIds,
      );
      if (eventIdsToDeactivate.length > 0) {
        await admin
          .from("external_events")
          .update({ is_active: false, updated_at: now })
          .eq("source", URINVOLVED_SOURCE)
          .in("external_id", eventIdsToDeactivate);
        eventsDeactivated = eventIdsToDeactivate.length;
      }
    } else if (inventoryPreserved) {
      const reasonMessage =
        eventDeactivate.reason === "suspicious_empty_catalog"
          ? `Refusing to deactivate ${existingUpcomingActiveCount} stored upcoming events after an empty upstream catalog.`
          : `Preserving stored events (${eventDeactivate.reason}).`;
      errors.push(reasonMessage);
      console.warn("[cq:urinvolved-sync] preserving existing events", {
        reason: eventDeactivate.reason,
        existingUpcomingActiveCount,
        eventsFetched,
        upstreamHttpStatus,
        errors: errors.slice(0, 3),
      });
    }

    if (orgsFetchSucceeded) {
      const { data: activeOrgRows } = await admin
        .from("external_organizations")
        .select("external_id")
        .eq("source", URINVOLVED_SOURCE)
        .eq("is_active", true);
      const orgIdsToDeactivate = idsMissingFromSeen(
        (activeOrgRows ?? []).map((row) => row.external_id as string),
        seenOrgIds,
      );
      if (orgIdsToDeactivate.length > 0) {
        await admin
          .from("external_organizations")
          .update({ is_active: false, updated_at: now })
          .eq("source", URINVOLVED_SOURCE)
          .in("external_id", orgIdsToDeactivate);
      }
    }

    const imported = eventsCreated + eventsUpdated;
    const totalFailure =
      !eventsFetchSucceeded ||
      !eventsPayloadValid ||
      inventoryPreserved ||
      (eventsFetched > 0 && imported === 0 && eventsFailed >= eventsFetched);
    const success = !totalFailure;
    const durationMs = Date.now() - startedMs;

    await finishSyncLog(admin, log.id, {
      status: success ? "success" : "failed",
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: orgsCreated,
      orgs_updated: orgsUpdated,
      events_received: eventsFetched,
      error_count: errors.length,
      error_message: errors.length > 0 ? errors.slice(0, 8).join(" | ") : null,
    });

    try {
      revalidatePath("/api/quests/map-pins");
      revalidatePath("/realm");
    } catch {
      /* ignore outside Next request context */
    }

    console.info("[cq:urinvolved-sync] complete", {
      provider: URINVOLVED_SOURCE,
      runId: log.id,
      started_at: new Date(startedMs).toISOString(),
      finished_at: new Date().toISOString(),
      status: success ? "success" : "failed",
      records_received: eventsFetched,
      records_created: eventsCreated,
      records_updated: eventsUpdated,
      records_skipped: Math.max(0, eventsFetched - eventsCreated - eventsUpdated - eventsFailed),
      records_failed: eventsFailed,
      organizations_processed: orgsCreated + orgsUpdated,
      events_processed: eventsCreated + eventsUpdated,
      events_deactivated: eventsDeactivated,
      events_map_matched: eventsMapMatched,
      events_unresolved_location: eventsUnresolvedLocation,
      httpStatus: upstreamHttpStatus,
      durationMs,
      inventoryPreserved,
      error_summary: success ? null : errors.slice(0, 5).join(" | ") || "sync_failed",
    });

    return {
      success,
      events_fetched: eventsFetched,
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      events_failed: eventsFailed,
      events_unresolved_location: eventsUnresolvedLocation,
      events_map_matched: eventsMapMatched,
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
      events_received: eventsFetched,
      error_count: errors.length + 1,
      error_message: message,
    });
    console.warn("[cq:urinvolved-sync] complete", {
      provider: URINVOLVED_SOURCE,
      runId: log.id,
      started_at: new Date(startedMs).toISOString(),
      finished_at: new Date().toISOString(),
      status: "failed",
      records_received: eventsFetched,
      records_created: eventsCreated,
      records_updated: eventsUpdated,
      records_skipped: Math.max(0, eventsFetched - eventsCreated - eventsUpdated - eventsFailed),
      records_failed: eventsFailed,
      organizations_processed: orgsCreated + orgsUpdated,
      events_processed: eventsCreated + eventsUpdated,
      durationMs: Date.now() - startedMs,
      inventoryPreserved: true,
      error_summary: message,
    });
    return {
      success: false,
      events_fetched: eventsFetched,
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      events_failed: eventsFailed,
      events_unresolved_location: eventsUnresolvedLocation,
      events_map_matched: eventsMapMatched,
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
  lastSyncImportedCount: number;
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
      .select("status, started_at, finished_at, error_message, events_created, events_updated")
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
  const lastSyncImportedCount =
    Number(rows[0]?.events_created ?? 0) + Number(rows[0]?.events_updated ?? 0);
  const lastSuccess = rows.find((row) => row.status === "success");
  // Only surface an error when the most recent attempt failed — a later success recovers health.
  const lastError =
    rows[0]?.status === "failed" ? ((rows[0].error_message as string | null) ?? null) : null;

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
    lastSyncImportedCount,
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
    lastError,
  };
}
