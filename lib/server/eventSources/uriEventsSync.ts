import {
  DEFAULT_URI_EVENTS_API_URL,
  DEFAULT_URI_EVENTS_HORIZON_DAYS,
  DEFAULT_URI_EVENTS_PAGE_SIZE,
  MAX_URI_EVENTS_PAGES,
  URI_EVENTS_SOURCE,
  localistPageUrl,
  nextLocalistPage,
  parseLocalistEvents,
  uriEventsWindow,
  type LocalistPage,
} from "@/lib/eventSources/adapters/localist";
import type { EventSourceSyncResult, NormalizedCampusEvent } from "@/lib/eventSources/types";
import { createAdminClient } from "@/lib/server/supabase";
import {
  applyAdminOverrideMerge,
  findExistingExternalEvent,
  linkCrossSourceDuplicate,
  normalizedEventToRow,
} from "@/lib/server/eventSources/upsert";
import { upsertBySourceExternalId } from "@/lib/server/eventSources/upsertBySourceExternalId";
import { finishProviderSyncLog, startProviderSyncLog } from "@/lib/server/eventSources/syncLogs";
import { idsMissingFromSeen, filterSafeDeactivationIds } from "@/lib/server/urinvolved/syncSafety";
import { resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";
import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";
import { isPlaceholderCampusCoordinate } from "@/lib/server/urinvolved/uriCampusBounds";

type AdminClient = ReturnType<typeof createAdminClient>;

const RICH_TEXT_FIELDS = [
  "description",
  "organization_name",
  "venue_name",
  "address",
  "location_name",
  "image_url",
  "event_url",
  "ticket_url",
  "rsvp_url",
  "ends_at",
] as const;

export type UriEventsSyncOptions = {
  dryRun?: boolean;
  horizonDays?: number;
  now?: Date;
  fetchPage?: (url: string) => Promise<LocalistPage>;
  baseUrl?: string;
};

export type UriEventsSyncResult = EventSourceSyncResult & {
  dryRun: boolean;
  pagesFetched: number;
  skippedAdministrative: number;
  skippedUnpublished: number;
};

function blank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

/** Incoming source values replace empty stored fields. They do not wipe richer data. */
export function preserveRicherImportedFields(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...incoming };
  for (const field of RICH_TEXT_FIELDS) {
    if (blank(merged[field]) && !blank(existing[field])) merged[field] = existing[field];
  }
  if (merged.latitude == null && existing.latitude != null) merged.latitude = existing.latitude;
  if (merged.longitude == null && existing.longitude != null) merged.longitude = existing.longitude;
  return merged;
}

function horizonDaysFromEnv(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override)) return override;
  const raw = Number(process.env.URI_EVENTS_HORIZON_DAYS ?? DEFAULT_URI_EVENTS_HORIZON_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_URI_EVENTS_HORIZON_DAYS;
}

function pageSizeFromEnv(): number {
  const raw = Number(process.env.URI_EVENTS_PAGE_SIZE ?? DEFAULT_URI_EVENTS_PAGE_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_URI_EVENTS_PAGE_SIZE;
  return Math.max(1, Math.min(100, Math.floor(raw)));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLocalistPage(url: string): Promise<LocalistPage> {
  let lastError = "URI Events request failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "CampusQuest/1.0" },
      cache: "no-store",
    });
    if (response.status === 429 || response.status >= 500) {
      lastError = `URI Events API returned HTTP ${response.status}.`;
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      throw new Error(`URI Events API returned HTTP ${response.status}.`);
    }
    return (await response.json()) as LocalistPage;
  }
  throw new Error(lastError);
}

export async function collectUriEvents(options: UriEventsSyncOptions = {}): Promise<{
  events: NormalizedCampusEvent[];
  pagesFetched: number;
  skippedAdministrative: number;
  skippedUnpublished: number;
}> {
  const now = options.now ?? new Date();
  const window = uriEventsWindow(now, horizonDaysFromEnv(options.horizonDays));
  const pageSize = pageSizeFromEnv();
  const fetchPage = options.fetchPage ?? fetchLocalistPage;
  const events: NormalizedCampusEvent[] = [];
  let pagesFetched = 0;
  let skippedAdministrative = 0;
  let skippedUnpublished = 0;
  let page = 1;

  for (let guard = 0; guard < MAX_URI_EVENTS_PAGES; guard += 1) {
    const url = localistPageUrl({
      baseUrl: options.baseUrl ?? process.env.URI_EVENTS_API_URL,
      start: window.start,
      end: window.end,
      page,
      pageSize,
    });
    const payload = await fetchPage(url);
    pagesFetched += 1;
    const parsed = parseLocalistEvents(payload);
    events.push(...parsed.events);
    skippedAdministrative += parsed.skippedAdministrative;
    skippedUnpublished += parsed.skippedUnpublished;
    const received = payload.events?.length ?? 0;
    const next = nextLocalistPage(payload.page, pageSize, received);
    if (next == null || next === page) break;
    page = next;
  }

  return { events, pagesFetched, skippedAdministrative, skippedUnpublished };
}

function locateOfficialOrKnownVenue(event: NormalizedCampusEvent): NormalizedCampusEvent {
  if (
    event.latitude != null &&
    event.longitude != null &&
    !isPlaceholderCampusCoordinate(event.latitude, event.longitude)
  ) {
    return event;
  }
  const resolved = resolveUrinvolvedEventLocation({
    venueName: event.venueName,
    address: event.address,
    description: event.locationName,
  });
  if (!resolved.mapPinAvailable || !hasValidCoordinates(resolved.locationMatch)) {
    return { ...event, latitude: null, longitude: null };
  }
  return {
    ...event,
    latitude: resolved.locationMatch.latitude,
    longitude: resolved.locationMatch.longitude,
    locationName: event.locationName || resolved.locationName,
  };
}

function emptyResult(partial: Partial<UriEventsSyncResult> & { errors: string[] }): UriEventsSyncResult {
  return {
    source: URI_EVENTS_SOURCE,
    success: false,
    skipped: false,
    skipReason: null,
    eventsReceived: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsFailed: 0,
    duplicatesMerged: 0,
    orgsCreated: 0,
    orgsUpdated: 0,
    pagesFetched: 0,
    skippedAdministrative: 0,
    skippedUnpublished: 0,
    dryRun: false,
    ...partial,
  };
}

const URI_EVENTS_LOCK_MS = 15 * 60 * 1000;

export type UriEventsLockRow = { id: string; startedAt: string };

/** Earliest start wins. Equal timestamps break ties by id so only one writer continues. */
export function uriEventsSyncLockWinner(rows: UriEventsLockRow[]): string | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const byTime = a.startedAt.localeCompare(b.startedAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  })[0]!.id;
}

async function claimUriEventsSync(
  admin: AdminClient,
  syncType: "cron" | "manual" | "api",
): Promise<{ logId: string } | { skipped: string }> {
  const staleBefore = new Date(Date.now() - URI_EVENTS_LOCK_MS).toISOString();
  await admin
    .from("sync_logs")
    .update({
      status: "failed",
      error_message: "Stale URI Events sync lock released.",
      finished_at: new Date().toISOString(),
    })
    .eq("source", URI_EVENTS_SOURCE)
    .eq("status", "running")
    .lt("started_at", staleBefore);

  const log = await startProviderSyncLog(admin, URI_EVENTS_SOURCE, syncType);
  const { data } = await admin
    .from("sync_logs")
    .select("id, started_at")
    .eq("source", URI_EVENTS_SOURCE)
    .eq("status", "running")
    .gte("started_at", staleBefore);
  const winner = uriEventsSyncLockWinner(
    (data ?? []).map((row) => ({ id: String(row.id), startedAt: String(row.started_at ?? "") })),
  );
  if (winner && winner !== log.id) {
    await finishProviderSyncLog(admin, log.id, {
      status: "success",
      events_created: 0,
      events_updated: 0,
      orgs_created: 0,
      orgs_updated: 0,
      events_received: 0,
      duplicates_merged: 0,
      error_count: 0,
      error_message: "Skipped because another URI Events sync is already running.",
    });
    return { skipped: "URI Events sync already running." };
  }
  return { logId: log.id };
}

export async function runUriEventsSync(
  syncType: "cron" | "manual" | "api",
  options: UriEventsSyncOptions = {},
): Promise<UriEventsSyncResult> {
  const dryRun = options.dryRun === true;
  const admin = dryRun ? null : createAdminClient();
  let logId: string | null = null;
  if (admin) {
    const claim = await claimUriEventsSync(admin, syncType);
    if ("skipped" in claim) {
      return emptyResult({
        success: true,
        skipped: true,
        skipReason: claim.skipped,
        errors: [],
        eventsFailed: 0,
      });
    }
    logId = claim.logId;
  }

  let collected;
  try {
    collected = await collectUriEvents(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (admin && logId) {
      await finishProviderSyncLog(admin, logId, {
        status: "failed",
        events_created: 0,
        events_updated: 0,
        orgs_created: 0,
        orgs_updated: 0,
        events_received: 0,
        duplicates_merged: 0,
        error_count: 1,
        error_message: message,
      });
    }
    return emptyResult({ errors: [message], eventsFailed: 1, syncLogId: logId ?? undefined });
  }

  if (dryRun) {
    return {
      source: URI_EVENTS_SOURCE,
      success: true,
      skipped: false,
      skipReason: null,
      eventsReceived: collected.events.length,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsFailed: 0,
      duplicatesMerged: 0,
      orgsCreated: 0,
      orgsUpdated: 0,
      errors: [],
      dryRun: true,
      pagesFetched: collected.pagesFetched,
      skippedAdministrative: collected.skippedAdministrative,
      skippedUnpublished: collected.skippedUnpublished,
    };
  }

  if (!admin || !logId) {
    return emptyResult({ errors: ["URI Events sync did not claim a lock."], eventsFailed: 1 });
  }
  const now = new Date().toISOString();
  const seen = new Set<string>();
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let eventsFailed = 0;
  let duplicatesMerged = 0;
  const errors: string[] = [];

  try {
    for (const event of collected.events) {
      try {
        const located = locateOfficialOrKnownVenue(event);
        const row = normalizedEventToRow(located, now);
        const existing = await findExistingExternalEvent(admin, URI_EVENTS_SOURCE, located.externalId);
        const preserved = existing ? preserveRicherImportedFields(row, existing) : row;
        const merged = existing ? applyAdminOverrideMerge(preserved, existing) : preserved;
        const upserted = await upsertBySourceExternalId(admin, "external_events", {
          ...merged,
          source: URI_EVENTS_SOURCE,
          external_id: located.externalId,
        });
        if (existing || !upserted.created) eventsUpdated += 1;
        else eventsCreated += 1;
        seen.add(located.externalId);
        const id = upserted.id ?? existing?.id;
        if (id) {
          const linked = await linkCrossSourceDuplicate(admin, {
            id,
            source: URI_EVENTS_SOURCE,
            externalId: located.externalId,
            title: located.title,
            startsAt: located.startsAt,
            organizationName: located.organizationName,
            locationName: located.locationName,
            venueName: located.venueName,
            address: located.address,
            opponent: null,
            sport: null,
            eventUrl: located.eventUrl,
            sourceIds: located.sourceIds ?? null,
          });
          if (linked) duplicatesMerged += 1;
        }
      } catch (error) {
        eventsFailed += 1;
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    await deactivateMissingInWindow(admin, seen, collected.events, errors, now);

    const success = eventsFailed === 0 || eventsCreated + eventsUpdated > 0;
    await finishProviderSyncLog(admin, logId, {
      status: success ? "success" : "failed",
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: 0,
      orgs_updated: 0,
      events_received: collected.events.length,
      duplicates_merged: duplicatesMerged,
      error_count: errors.length,
      error_message: errors.length > 0 ? errors.slice(0, 8).join(" | ") : null,
    });

    return {
      source: URI_EVENTS_SOURCE,
      success,
      skipped: false,
      skipReason: null,
      eventsReceived: collected.events.length,
      eventsCreated,
      eventsUpdated,
      eventsFailed,
      duplicatesMerged,
      orgsCreated: 0,
      orgsUpdated: 0,
      errors,
      syncLogId: logId,
      dryRun: false,
      pagesFetched: collected.pagesFetched,
      skippedAdministrative: collected.skippedAdministrative,
      skippedUnpublished: collected.skippedUnpublished,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishProviderSyncLog(admin, logId, {
      status: "failed",
      events_created: eventsCreated,
      events_updated: eventsUpdated,
      orgs_created: 0,
      orgs_updated: 0,
      events_received: collected.events.length,
      duplicates_merged: duplicatesMerged,
      error_count: errors.length + 1,
      error_message: message,
    });
    return emptyResult({
      errors: [message, ...errors],
      eventsReceived: collected.events.length,
      eventsCreated,
      eventsUpdated,
      eventsFailed: eventsFailed + 1,
      duplicatesMerged,
      syncLogId: logId,
      pagesFetched: collected.pagesFetched,
      skippedAdministrative: collected.skippedAdministrative,
      skippedUnpublished: collected.skippedUnpublished,
    });
  }
}

async function deactivateMissingInWindow(
  admin: AdminClient,
  seen: Set<string>,
  imported: NormalizedCampusEvent[],
  errors: string[],
  now: string,
) {
  if (imported.length === 0 || seen.size === 0) {
    errors.push("Refusing to deactivate URI Events inventory after an empty import.");
    return;
  }
  const starts = imported
    .map((event) => (event.startsAt ? Date.parse(event.startsAt) : NaN))
    .filter((value) => !Number.isNaN(value));
  if (starts.length === 0) return;
  const windowStart = new Date(Math.min(...starts)).toISOString();
  const windowEnd = new Date(Math.max(...starts)).toISOString();
  const { data, error } = await admin
    .from("external_events")
    .select("external_id, starts_at")
    .eq("source", URI_EVENTS_SOURCE)
    .eq("is_active", true)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);
  if (error) {
    errors.push(error.message);
    return;
  }
  const activeIds = (data ?? []).map((row) => String(row.external_id));
  const missing = idsMissingFromSeen(activeIds, Array.from(seen));
  const safe = filterSafeDeactivationIds({ missingIds: missing, activeCount: activeIds.length });
  if (safe.blocked) {
    errors.push(`Refusing to deactivate ${missing.length}/${activeIds.length} URI Events rows.`);
    return;
  }
  if (safe.ids.length === 0) return;
  await admin
    .from("external_events")
    .update({ is_active: false, updated_at: now })
    .eq("source", URI_EVENTS_SOURCE)
    .in("external_id", safe.ids);
}

export const URI_EVENTS_CONFIGURATION_HINT = `Public Localist API at ${DEFAULT_URI_EVENTS_API_URL}. Horizon defaults to ${DEFAULT_URI_EVENTS_HORIZON_DAYS} days (URI_EVENTS_HORIZON_DAYS).`;
