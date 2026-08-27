import { normalizeEventTitle } from "@/lib/realm/dedupeLogicalEvents";

export type DedupeEventLike = {
  id?: string;
  source?: string | null;
  externalId?: string | null;
  title: string;
  startsAt?: string | null;
  organizationName?: string | null;
  locationName?: string | null;
  venueName?: string | null;
  address?: string | null;
  opponent?: string | null;
  sport?: string | null;
  eventUrl?: string | null;
};

const START_WINDOW_MS = 30 * 60_000;
const STOP_WORDS = new Set(["the", "and", "vs", "at", "uri", "university", "of", "rhode", "island"]);

function startMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeTokenField(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("utm_content");
    parsed.searchParams.delete("utm_term");
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/$/, "");
  }
}

export function significantTitleTokens(title: string): string[] {
  return normalizeEventTitle(title)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function locationBlob(event: DedupeEventLike): string {
  return normalizeTokenField([event.venueName, event.locationName, event.address].filter(Boolean).join(" "));
}

function sameOrEmpty(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function genderedTeam(event: DedupeEventLike): "men" | "women" | null {
  const haystack = `${event.title} ${event.sport ?? ""} ${event.organizationName ?? ""}`.toLowerCase();
  const women = /\bwomen'?s\b/.test(haystack);
  const men = /\bmen'?s\b/.test(haystack);
  if (women && !men) return "women";
  if (men && !women) return "men";
  return null;
}

/**
 * Conservative cross-source match. Never merges events that clearly differ
 * on start time, opponent, or sport.
 */
export function eventsLikelyDuplicate(a: DedupeEventLike, b: DedupeEventLike): boolean {
  if (a.source && b.source && a.externalId && b.externalId && a.source === b.source && a.externalId === b.externalId) {
    return true;
  }
  if (a.source && b.source && a.source === b.source && a.externalId && b.externalId && a.externalId !== b.externalId) {
    return false;
  }

  const genderA = genderedTeam(a);
  const genderB = genderedTeam(b);
  if (genderA && genderB && genderA !== genderB) return false;

  const urlA = canonicalUrl(a.eventUrl);
  const urlB = canonicalUrl(b.eventUrl);
  if (urlA && urlB && urlA === urlB) return true;

  const startA = startMs(a.startsAt);
  const startB = startMs(b.startsAt);
  if (startA == null || startB == null) return false;
  if (Math.abs(startA - startB) > START_WINDOW_MS) return false;

  const opponentA = normalizeTokenField(a.opponent);
  const opponentB = normalizeTokenField(b.opponent);
  if (opponentA && opponentB && opponentA !== opponentB && !sameOrEmpty(opponentA, opponentB)) {
    return false;
  }

  const sportA = normalizeTokenField(a.sport);
  const sportB = normalizeTokenField(b.sport);
  if (sportA && sportB && sportA !== sportB) return false;

  const titleA = normalizeEventTitle(a.title);
  const titleB = normalizeEventTitle(b.title);
  if (titleA && titleA === titleB) {
    const orgMatch = sameOrEmpty(normalizeTokenField(a.organizationName), normalizeTokenField(b.organizationName));
    const locMatch = sameOrEmpty(locationBlob(a), locationBlob(b));
    const oppMatch = Boolean(opponentA && opponentB && sameOrEmpty(opponentA, opponentB));
    return orgMatch || locMatch || oppMatch;
  }

  if (opponentA && opponentB && sameOrEmpty(opponentA, opponentB)) {
    return !sportA || !sportB || sportA === sportB;
  }

  const tokensA = new Set(significantTitleTokens(a.title));
  const tokensB = significantTitleTokens(b.title);
  const overlap = tokensB.filter((token) => tokensA.has(token));
  if (overlap.length < 2) return false;

  const locMatch = sameOrEmpty(locationBlob(a), locationBlob(b));
  const orgMatch = sameOrEmpty(normalizeTokenField(a.organizationName), normalizeTokenField(b.organizationName));
  return locMatch || orgMatch || Boolean(opponentA && opponentB);
}

export function mergeSourceIds(
  current: Record<string, string> | null | undefined,
  source: string,
  externalId: string,
): Record<string, string> {
  return { ...(current ?? {}), [source]: externalId };
}
