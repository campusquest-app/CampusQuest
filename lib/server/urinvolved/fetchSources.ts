const URINVOLVED_EVENTS_RSS = "https://urinvolved.uri.edu/events.rss";
const URINVOLVED_ORGS_SEARCH =
  "https://urinvolved.uri.edu/api/discovery/search/organizations";
const CAMPUSLABS_IMAGE_BASE = "https://se-images.campuslabs.com/clink/images/";
const FETCH_TIMEOUT_MS = 30_000;

export type UrinvolvedOrganizationRaw = {
  Id: string;
  Name: string;
  WebsiteKey: string | null;
  ProfilePicture: string | null;
  Description: string | null;
  Summary: string | null;
  CategoryNames: string[] | null;
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
