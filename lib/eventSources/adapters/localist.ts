import { canonicalEventCategory } from "@/lib/eventSources/categories";
import type { NormalizedCampusEvent } from "@/lib/eventSources/types";
import { isPlaceholderCampusCoordinate } from "@/lib/server/urinvolved/uriCampusBounds";

export const URI_EVENTS_SOURCE = "uri_events" as const;
export const URI_EVENTS_TIMEZONE = "America/New_York";
export const DEFAULT_URI_EVENTS_HORIZON_DAYS = 90;
export const DEFAULT_URI_EVENTS_PAGE_SIZE = 100;
export const MAX_URI_EVENTS_PAGES = 40;

export const DEFAULT_URI_EVENTS_API_URL = "https://events.uri.edu/api/2/events";

type LocalistNamed = { name?: string | null; id?: number | string | null };

export type LocalistInstance = {
  id?: number | string | null;
  event_id?: number | string | null;
  start?: string | null;
  end?: string | null;
  all_day?: boolean | null;
};

export type LocalistEvent = {
  id?: number | string | null;
  title?: string | null;
  description_text?: string | null;
  description?: string | null;
  location?: string | null;
  location_name?: string | null;
  address?: string | null;
  room_number?: string | null;
  geo?: {
    latitude?: string | number | null;
    longitude?: string | number | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  photo_url?: string | null;
  localist_url?: string | null;
  url?: string | null;
  ticket_url?: string | null;
  ticket_cost?: string | null;
  free?: boolean | null;
  status?: string | null;
  experience?: string | null;
  publish_status?: string | null;
  private?: boolean | null;
  rejected?: boolean | null;
  featured?: boolean | null;
  groups?: Array<{ id?: number | string | null; name?: string | null }> | null;
  filters?: {
    event_types?: LocalistNamed[] | null;
    event_audience?: LocalistNamed[] | null;
    event_interests?: LocalistNamed[] | null;
  } | null;
  event_instances?: Array<{ event_instance?: LocalistInstance | null } | LocalistInstance> | null;
};

export type LocalistPage = {
  events?: Array<{ event?: LocalistEvent | null } | LocalistEvent> | null;
  page?: {
    current?: number | null;
    size?: number | null;
    total?: number | null;
    total_items?: number | null;
    next_page?: number | null;
  } | null;
};

const ADMIN_TITLE =
  /\b(last day to|deadline|due date|grades due|add\/drop|course withdrawal|withdrawal deadline|tuition|fee payment|census date|reading day|final grades)\b/i;

const STUDENT_FACING_TYPE =
  /\b(workshop|concert|social|special event|student|greek|athletics|clinic|performance|seminar|lecture|fair|organization|recreation|career|community)\b/i;

const ONLINE_LOCATION = /\b(zoom|online|virtual|webinar|tba|to be announced)\b/i;

export type LocalistParseCounts = {
  events: NormalizedCampusEvent[];
  skippedAdministrative: number;
  skippedUnpublished: number;
};

export function uriEventsWindow(now: Date, horizonDays: number): { start: string; end: string } {
  const horizon = Math.max(1, Math.min(365, Math.floor(horizonDays)));
  const end = new Date(now.getTime() + horizon * 24 * 60 * 60 * 1000);
  return { start: formatNewYorkDate(now), end: formatNewYorkDate(end) };
}

export function formatNewYorkDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: URI_EVENTS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function localistPageUrl(args: {
  baseUrl?: string;
  start: string;
  end: string;
  page: number;
  pageSize: number;
}): string {
  const url = new URL(args.baseUrl?.trim() || DEFAULT_URI_EVENTS_API_URL);
  url.searchParams.set("start", args.start);
  url.searchParams.set("end", args.end);
  url.searchParams.set("pp", String(args.pageSize));
  url.searchParams.set("page", String(args.page));
  url.searchParams.delete("featured");
  return url.toString();
}

export function nextLocalistPage(page: LocalistPage["page"], pageSize: number, receivedOnPage: number): number | null {
  if (receivedOnPage <= 0) return null;
  const current = Number(page?.current ?? 1);
  const totalPages = Number(page?.total ?? 0);
  const next = page?.next_page;
  if (typeof next === "number" && next > current) return next;
  if (totalPages > 0 && current < totalPages) return current + 1;
  if (receivedOnPage >= pageSize) return current + 1;
  return null;
}

function unwrapEvent(entry: { event?: LocalistEvent | null } | LocalistEvent): LocalistEvent | null {
  if (!entry || typeof entry !== "object") return null;
  if ("event" in entry && entry.event && typeof entry.event === "object") return entry.event;
  return entry as LocalistEvent;
}

function unwrapInstance(entry: { event_instance?: LocalistInstance | null } | LocalistInstance): LocalistInstance | null {
  if (!entry || typeof entry !== "object") return null;
  if ("event_instance" in entry && entry.event_instance) return entry.event_instance;
  return entry as LocalistInstance;
}

function names(values: LocalistNamed[] | null | undefined): string[] {
  return (values ?? []).map((item) => (item?.name ?? "").trim()).filter(Boolean);
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function isAdministrativeLocalistEvent(event: LocalistEvent): boolean {
  const title = (event.title ?? "").trim();
  if (!title || !ADMIN_TITLE.test(title)) return false;
  const types = names(event.filters?.event_types).join(" ");
  const interests = names(event.filters?.event_interests).join(" ");
  const audience = names(event.filters?.event_audience).join(" ");
  const haystack = `${types} ${interests} ${audience}`;
  return !STUDENT_FACING_TYPE.test(haystack);
}

function httpsUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function finiteCoord(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function addressFromGeo(event: LocalistEvent): string | null {
  const geo = event.geo;
  if (!geo) return event.address?.trim() || null;
  const cityState = [geo.city?.trim(), geo.state?.trim()].filter(Boolean).join(", ");
  const parts = [geo.street?.trim(), cityState || null, geo.zip?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return event.address?.trim() || null;
}

function officialCoordinates(event: LocalistEvent, locationLabel: string | null): { latitude: number | null; longitude: number | null } {
  if (locationLabel && ONLINE_LOCATION.test(locationLabel)) return { latitude: null, longitude: null };
  const latitude = finiteCoord(event.geo?.latitude);
  const longitude = finiteCoord(event.geo?.longitude);
  if (latitude == null || longitude == null) return { latitude: null, longitude: null };
  if (isPlaceholderCampusCoordinate(latitude, longitude)) return { latitude: null, longitude: null };
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return { latitude: null, longitude: null };
  return { latitude, longitude };
}

export function parseLocalistEvents(page: LocalistPage): LocalistParseCounts {
  const events: NormalizedCampusEvent[] = [];
  let skippedAdministrative = 0;
  let skippedUnpublished = 0;

  for (const entry of page.events ?? []) {
    const event = unwrapEvent(entry);
    if (!event) continue;
    if (event.private === true || event.rejected === true) {
      skippedUnpublished += 1;
      continue;
    }
    if (event.publish_status && event.publish_status !== "published") {
      skippedUnpublished += 1;
      continue;
    }
    if (isAdministrativeLocalistEvent(event)) {
      skippedAdministrative += 1;
      continue;
    }

    const instances = (event.event_instances ?? [])
      .map(unwrapInstance)
      .filter((instance): instance is LocalistInstance => Boolean(instance?.start));
    const rows = instances.length > 0 ? instances : [null];
    for (const instance of rows) {
      const normalized = normalizeLocalistOccurrence(event, instance);
      if (normalized) events.push(normalized);
    }
  }

  return { events, skippedAdministrative, skippedUnpublished };
}

function normalizeLocalistOccurrence(event: LocalistEvent, instance: LocalistInstance | null): NormalizedCampusEvent | null {
  const title = (event.title ?? "").trim();
  const eventId = String(event.id ?? "").trim();
  if (!title || !eventId) return null;
  const instanceId = instance?.id != null ? String(instance.id) : instance?.start ?? "event";
  const externalId = `${eventId}:${instanceId}`.slice(0, 180);
  const venue = (event.location_name || event.location || "").trim() || null;
  const room = event.room_number?.trim();
  const venueName = venue && room ? `${venue}, ${room}` : venue;
  const address = addressFromGeo(event);
  const locationName = venueName || address;
  const coords = officialCoordinates(event, locationName);
  const typeNames = names(event.filters?.event_types);
  const groupName = (event.groups ?? []).map((group) => group?.name?.trim() || "").find(Boolean) ?? null;
  const descriptionBody = stripHtml(event.description_text || event.description || "");
  const cost = event.ticket_cost?.trim();
  const description = [descriptionBody, cost ? `Cost: ${cost}` : null].filter(Boolean).join("\n\n").slice(0, 5000);
  const cancelled = /cancel/i.test(event.status ?? "") || /cancel/i.test(event.experience ?? "");
  const ticketUrl = httpsUrl(event.ticket_url);
  const eventUrl = httpsUrl(event.localist_url) ?? httpsUrl(event.url);
  const startsAt = instance?.start?.trim() || null;
  if (!startsAt) return null;

  return {
    source: URI_EVENTS_SOURCE,
    sourceType: URI_EVENTS_SOURCE,
    externalId,
    title: title.slice(0, 500),
    description,
    organizationName: groupName,
    category: canonicalEventCategory({
      source: URI_EVENTS_SOURCE,
      category: typeNames[0] ?? null,
      title,
      tags: typeNames,
    }),
    tags: typeNames.slice(0, 12),
    startsAt,
    endsAt: instance?.end?.trim() || null,
    timezone: URI_EVENTS_TIMEZONE,
    venueName,
    locationName,
    address,
    latitude: coords.latitude,
    longitude: coords.longitude,
    imageUrl: httpsUrl(event.photo_url),
    eventUrl,
    ticketUrl,
    broadcastUrl: null,
    rsvpUrl: ticketUrl,
    cqRsvpEnabled: true,
    isCancelled: cancelled,
    audience: names(event.filters?.event_audience).slice(0, 4).join(", ") || null,
    visibility: "public",
    featured: event.featured === true,
    sourceIds: { [URI_EVENTS_SOURCE]: externalId },
  };
}
