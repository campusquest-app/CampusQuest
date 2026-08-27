import { revalidatePath } from "next/cache";
import {
  athleticsFeedFormatFromEnv,
  athleticsFeedUrlsFromEnv,
  athleticsTeamOrganization,
  parseAthleticsFeed,
} from "@/lib/eventSources/adapters/athletics";
import { athleticsEventEligibleForCampusMap } from "@/lib/eventSources/athleticsMapEligibility";
import type { EventSourceSyncResult, NormalizedCampusEvent } from "@/lib/eventSources/types";
import { resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";
import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { resolveAndUpsertEventMapPlacement } from "@/lib/server/urinvolved/resolveAndUpsertEventMapPlacement";
import { idsMissingFromSeen } from "@/lib/server/urinvolved/syncSafety";
import { createAdminClient } from "@/lib/server/supabase";
import { finishProviderSyncLog, startProviderSyncLog } from "@/lib/server/eventSources/syncLogs";
import {
  applyAdminOverrideMerge,
  findExistingExternalEvent,
  linkCrossSourceDuplicate,
  normalizedEventToRow,
} from "@/lib/server/eventSources/upsert";

export const ATHLETICS_SOURCE = "athletics" as const;

const SKIP_REASON = "feed_not_configured";

export const ATHLETICS_FEED_USER_AGENT =
  "CampusQuest/1.0 (URI campus events; +https://campusquestapp.com)";

export function athleticsFeedConfigured(): boolean {
  return athleticsFeedUrlsFromEnv().length > 0;
}

export const ATHLETICS_CONFIGURATION_HINT =
  "Set URI_ATHLETICS_FEED_URL to the official URI Athletics ICS (gorhody.com calendar.ashx). Optional URI_ATHLETICS_FEED_URLS for extra official feeds, URI_ATHLETICS_FEED_FORMAT=ics|json. No games are invented when unset.";

let athleticsSyncInFlight: Promise<EventSourceSyncResult> | null = null;

export async function runAthleticsSync(syncType: "cron" | "manual" | "api" = "api"): Promise<EventSourceSyncResult> {
  if (athleticsSyncInFlight) return athleticsSyncInFlight;
  athleticsSyncInFlight = runAthleticsSyncExclusive(syncType).finally(() => {
    athleticsSyncInFlight = null;
  });
  return athleticsSyncInFlight;
}

async function runAthleticsSyncExclusive(syncType: "cron" | "manual" | "api"): Promise<EventSourceSyncResult> {
  const admin = createAdminClient();
  const log = await startProviderSyncLog(admin, ATHLETICS_SOURCE, syncType);
  const empty: EventSourceSyncResult = {
    source: ATHLETICS_SOURCE,
    success: true,
    skipped: true,
    skipReason: SKIP_REASON,
    eventsReceived: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsFailed: 0,
    duplicatesMerged: 0,
    orgsCreated: 0,
    orgsUpdated: 0,
    errors: [],
    syncLogId: log.id,
  };

  if (!athleticsFeedConfigured()) {
    await finishProviderSyncLog(admin, log.id, {
      status: "success",
      events_created: 0,
      events_updated: 0,
      orgs_created: 0,
      orgs_updated: 0,
      events_received: 0,
      error_message: SKIP_REASON,
    });
    return empty;
  }

  const errors: string[] = [];
  let eventsReceived = 0;
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let eventsFailed = 0;
  let duplicatesMerged = 0;
  let orgsCreated = 0;
  let orgsUpdated = 0;
  const seenEventIds: string[] = [];
  const now = new Date().toISOString();

  try {
    const feedUrls = athleticsFeedUrlsFromEnv();
    const format = athleticsFeedFormatFromEnv(process.env.URI_ATHLETICS_FEED_FORMAT);
    const parsedById = new Map<string, NormalizedCampusEvent>();
    const accept =
      format === "json"
        ? "application/json, text/calendar;q=0.9, */*;q=0.8"
        : "text/calendar, application/json;q=0.9, */*;q=0.8";

    for (const feedUrl of feedUrls) {
      const response = await fetch(feedUrl, {
        headers: {
          Accept: accept,
          "User-Agent": ATHLETICS_FEED_USER_AGENT,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        errors.push(`Athletics feed HTTP ${response.status}`);
        continue;
      }
      const raw = await response.text();
      if (!raw.trim()) {
        errors.push("Athletics feed was empty.");
        continue;
      }
      for (const event of parseAthleticsFeed(raw, format)) {
        if (!parsedById.has(event.externalId)) parsedById.set(event.externalId, event);
      }
    }

    const parsed = Array.from(parsedById.values());
    eventsReceived = parsed.length;
    if (parsed.length === 0) {
      throw new Error(errors[0] || "Athletics feed returned no parseable events.");
    }

    const catalog = (await getCampusLocations({ refreshCache: true })).map((row) => ({
      slug: row.slug,
      name: row.name,
    }));

    for (const event of parsed) {
      try {
        const located = await locateAthleticsEvent(event);
        const row = normalizedEventToRow(located, now);
        const existing = await findExistingExternalEvent(admin, ATHLETICS_SOURCE, located.externalId);
        const merged = existing ? applyAdminOverrideMerge(row, existing) : row;

        const { data: upserted, error: upsertError } = await admin
          .from("external_events")
          .upsert(merged, { onConflict: "source,external_id" })
          .select("id")
          .single();
        if (upsertError) {
          eventsFailed += 1;
          errors.push(`Event ${located.externalId}: ${upsertError.message}`);
          continue;
        }
        if (existing) eventsUpdated += 1;
        else eventsCreated += 1;
        seenEventIds.push(located.externalId);

        const externalEventId = String(upserted?.id ?? existing?.id ?? "");
        if (externalEventId) {
          const linked = await linkCrossSourceDuplicate(admin, {
            id: externalEventId,
            source: ATHLETICS_SOURCE,
            externalId: located.externalId,
            title: located.title,
            startsAt: located.startsAt,
            organizationName: located.organizationName,
            locationName: located.locationName,
            venueName: located.venueName,
            address: located.address,
            opponent: located.opponent ?? null,
            sport: located.sport ?? null,
            eventUrl: located.eventUrl,
            sourceIds: located.sourceIds ?? null,
          });
          if (linked) duplicatesMerged += 1;

          try {
            await resolveAndUpsertEventMapPlacement(externalEventId, {
              catalog,
              revalidate: false,
            });
          } catch (placementError) {
            const message = placementError instanceof Error ? placementError.message : String(placementError);
            console.warn("[cq:athletics-sync] placement failed", {
              externalId: located.externalId,
              title: located.title,
              error: message,
            });
          }
        }

        const org = athleticsTeamOrganization(located);
        if (org) {
          const { data: existingOrg } = await admin
            .from("external_organizations")
            .select("id")
            .eq("source", ATHLETICS_SOURCE)
            .eq("external_id", org.externalId)
            .maybeSingle();
          const { error: orgError } = await admin.from("external_organizations").upsert(
            {
              source: org.source,
              source_type: org.sourceType,
              external_id: org.externalId,
              name: org.name,
              description: org.description,
              logo_url: org.logoUrl,
              organization_url: org.websiteUrl,
              website_url: org.websiteUrl,
              category: org.category,
              tags: org.tags,
              organization_type: org.organizationType,
              verified: org.verified,
              is_active: true,
              last_seen_at: now,
              updated_at: now,
            },
            { onConflict: "source,external_id" },
          );
          if (!orgError) {
            if (existingOrg) orgsUpdated += 1;
            else orgsCreated += 1;
          }
        }
      } catch (eventError) {
        eventsFailed += 1;
        errors.push(eventError instanceof Error ? eventError.message : String(eventError));
      }
    }

    const { data: activeRows } = await admin
      .from("external_events")
      .select("external_id")
      .eq("source", ATHLETICS_SOURCE)
      .eq("is_active", true);
    const missing = idsMissingFromSeen(
      (activeRows ?? []).map((row) => row.external_id as string),
      seenEventIds,
    );
    if (missing.length > 0 && eventsReceived > 0 && eventsFailed < eventsReceived) {
      await admin
        .from("external_events")
        .update({ is_active: false, updated_at: now })
        .eq("source", ATHLETICS_SOURCE)
        .in("external_id", missing);
    }

    const success = eventsFailed === 0 || eventsCreated + eventsUpdated > 0;
    await finishProviderSyncLog(admin, log.id, {
      status: success ? "success" : "failed",
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: orgsCreated,
      orgs_updated: orgsUpdated,
      events_received: eventsReceived,
      duplicates_merged: duplicatesMerged,
      error_count: errors.length,
      error_message: errors.length > 0 ? errors.slice(0, 8).join(" | ") : null,
    });

    try {
      revalidatePath("/api/quests/map-pins");
      revalidatePath("/realm");
    } catch {
      /* ignore */
    }

    return {
      source: ATHLETICS_SOURCE,
      success,
      skipped: false,
      skipReason: null,
      eventsReceived,
      eventsCreated,
      eventsUpdated,
      eventsFailed,
      duplicatesMerged,
      orgsCreated,
      orgsUpdated,
      errors,
      syncLogId: log.id,
    };
  } catch (fatalError) {
    const message = fatalError instanceof Error ? fatalError.message : String(fatalError);
    await finishProviderSyncLog(admin, log.id, {
      status: "failed",
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: orgsCreated,
      orgs_updated: orgsUpdated,
      events_received: eventsReceived,
      duplicates_merged: duplicatesMerged,
      error_count: errors.length + 1,
      error_message: message,
    });
    return {
      source: ATHLETICS_SOURCE,
      success: false,
      skipped: false,
      skipReason: null,
      eventsReceived,
      eventsCreated,
      eventsUpdated,
      eventsFailed: eventsFailed + 1,
      duplicatesMerged,
      orgsCreated,
      orgsUpdated,
      errors: [message, ...errors],
      syncLogId: log.id,
    };
  }
}

async function locateAthleticsEvent(event: NormalizedCampusEvent): Promise<NormalizedCampusEvent> {
  if (!athleticsEventEligibleForCampusMap({ source: event.source, homeAway: event.homeAway })) {
    return { ...event, latitude: null, longitude: null };
  }
  const resolved = resolveUrinvolvedEventLocation({
    venueName: event.venueName,
    address: event.address,
  });
  const matched = hasValidCoordinates(resolved.locationMatch) ? resolved.locationMatch : null;
  return {
    ...event,
    venueName: resolved.venueName || event.venueName,
    address: resolved.address || event.address,
    locationName: resolved.locationName || event.locationName,
    latitude: matched?.latitude ?? event.latitude,
    longitude: matched?.longitude ?? event.longitude,
  };
}
