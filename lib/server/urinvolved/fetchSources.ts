import type { UrinvolvedDiscoveryEventRaw } from "@/lib/server/urinvolved/parseDiscoveryEvents";

const URINVOLVED_EVENTS_RSS = "https://urinvolved.uri.edu/events.rss";
const URINVOLVED_EVENT_DETAIL = "https://urinvolved.uri.edu/api/discovery/event/";
const URINVOLVED_EVENTS_SEARCH = "https://urinvolved.uri.edu/api/discovery/event/search";
const URINVOLVED_ORGS_SEARCH =
  "https://urinvolved.uri.edu/api/discovery/search/organizations";
const CAMPUSLABS_IMAGE_BASE = "https://se-images.campuslabs.com/clink/images/";
const FETCH_TIMEOUT_MS = 30_000;
const EVENTS_SEARCH_PAGE_SIZE = 50;
const EVENTS_SEARCH_MAX_PAGES = 40;

export type UrinvolvedOrganizationRaw = {
  Id: string;
  Name: string;
  WebsiteKey: string | null;
  ProfilePicture: string | null;
  Description: string | null;
  Summary: string | null;
  CategoryNames: string[] | null;
};

export type UrinvolvedEventAddressRaw = {
  name: string | null;
  address: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type UrinvolvedEventDetailRaw = {
  id: number;
  name: string;
  description: string | null;
  startsOn: string | null;
  endsOn: string | null;
  imageUrl: string | null;
  address: UrinvolvedEventAddressRaw | null;
  theme: string | null;
  categories: Array<{ name: string }> | null;
};

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json, application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "CampusQuest-URInvolved-Sync/1.0 (+https://campusquest.app)",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchUrinvolvedEventsRss(): Promise<string> {
  const response = await fetchWithTimeout(URINVOLVED_EVENTS_RSS);
  if (!response.ok) {
    throw new Error(`URInvolved events RSS failed (${response.status}).`);
  }
  return response.text();
}

/**
 * Full upcoming public event catalog via Campus Labs discovery search.
 * Prefer this over events.rss — the RSS feed is a rolling ~24h window and
 * routinely returns 0 items even when many future events exist.
 */
export async function fetchUpcomingUrinvolvedDiscoveryEvents(options?: {
  endsAfter?: Date;
}): Promise<{
  raw: UrinvolvedDiscoveryEventRaw[];
  httpStatus: number;
  totalCount: number;
}> {
  const endsAfter = (options?.endsAfter ?? new Date()).toISOString();
  const all: UrinvolvedDiscoveryEventRaw[] = [];
  let skip = 0;
  let total = Infinity;
  let lastStatus = 200;

  for (let page = 0; page < EVENTS_SEARCH_MAX_PAGES && skip < total; page += 1) {
    const url = new URL(URINVOLVED_EVENTS_SEARCH);
    url.searchParams.set("take", String(EVENTS_SEARCH_PAGE_SIZE));
    url.searchParams.set("skip", String(skip));
    url.searchParams.set("orderByAsc", "startsOn");
    url.searchParams.set("endsAfter", endsAfter);

    const response = await fetchWithTimeout(url.toString());
    lastStatus = response.status;
    if (!response.ok) {
      throw new Error(`URInvolved events discovery search failed (${response.status}).`);
    }

    const payload = (await response.json()) as {
      "@odata.count"?: number;
      value?: UrinvolvedDiscoveryEventRaw[];
    };
    const batch = payload.value ?? [];
    total = payload["@odata.count"] ?? skip + batch.length;
    all.push(...batch);
    if (batch.length === 0) break;
    skip += batch.length;
    if (batch.length < EVENTS_SEARCH_PAGE_SIZE) break;
  }

  return { raw: all, httpStatus: lastStatus, totalCount: total === Infinity ? all.length : total };
}

export async function fetchUrinvolvedEventDetail(externalId: string): Promise<UrinvolvedEventDetailRaw | null> {
  const response = await fetchWithTimeout(`${URINVOLVED_EVENT_DETAIL}${encodeURIComponent(externalId)}`);
  if (!response.ok) return null;
  return (await response.json()) as UrinvolvedEventDetailRaw;
}

export async function fetchAllUrinvolvedOrganizations(): Promise<UrinvolvedOrganizationRaw[]> {
  const pageSize = 25;
  let skip = 0;
  let total = Infinity;
  const all: UrinvolvedOrganizationRaw[] = [];

  while (skip < total) {
    const url = `${URINVOLVED_ORGS_SEARCH}?take=${pageSize}&skip=${skip}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`URInvolved organizations API failed (${response.status}).`);
    }
    const payload = (await response.json()) as {
      "@odata.count"?: number;
      value?: UrinvolvedOrganizationRaw[];
    };
    const batch = payload.value ?? [];
    total = payload["@odata.count"] ?? batch.length;
    all.push(...batch);
    if (batch.length === 0) break;
    skip += batch.length;
    if (batch.length < pageSize) break;
  }

  return all;
}

export function buildOrganizationLogoUrl(profilePicture: string | null): string | null {
  if (!profilePicture?.trim()) return null;
  return `${CAMPUSLABS_IMAGE_BASE}${profilePicture.trim()}?preset=med-w`;
}

export function buildOrganizationUrl(websiteKey: string | null, externalId: string): string {
  if (websiteKey?.trim()) {
    return `https://urinvolved.uri.edu/organization/${websiteKey.trim()}`;
  }
  return `https://urinvolved.uri.edu/organization/${externalId}`;
}

export function stripHtmlToText(html: string | null): string {
  if (!html?.trim()) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
