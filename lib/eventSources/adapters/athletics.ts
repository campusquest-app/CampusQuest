import { athleticsEventEligibleForCampusMap } from "@/lib/eventSources/athleticsMapEligibility";
import { canonicalEventCategory } from "@/lib/eventSources/categories";
import { parseIcsEvents } from "@/lib/eventSources/ics";
import type {
  AthleticsLiveStatus,
  HomeAway,
  NormalizedCampusEvent,
  NormalizedCampusOrganization,
} from "@/lib/eventSources/types";

export type AthleticsJsonEvent = {
  id?: string;
  title?: string;
  description?: string;
  sport?: string;
  team?: string;
  opponent?: string;
  homeAway?: HomeAway | string;
  startsAt?: string;
  start?: string;
  endsAt?: string;
  end?: string;
  timezone?: string;
  venue?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  ticketUrl?: string;
  broadcastUrl?: string;
  watchUrl?: string;
  eventUrl?: string;
  url?: string;
  imageUrl?: string;
  status?: string;
  score?: string;
  cancelled?: boolean;
};

export type AthleticsFeedPayload = {
  events?: AthleticsJsonEvent[];
  games?: AthleticsJsonEvent[];
};

const HOME_VENUE_HINTS = [
  "ryan center",
  "meade stadium",
  "bill beck",
  "tootell",
  "keaney",
  "soccer complex",
  "mackal",
  "boss arena",
  "bradford hill",
];

const SPORT_PATTERNS: Array<{ sport: string; pattern: RegExp }> = [
  { sport: "Basketball", pattern: /basketball/ },
  { sport: "Football", pattern: /football/ },
  { sport: "Soccer", pattern: /soccer/ },
  { sport: "Baseball", pattern: /baseball/ },
  { sport: "Softball", pattern: /softball/ },
  { sport: "Volleyball", pattern: /volleyball/ },
  { sport: "Hockey", pattern: /hockey/ },
  { sport: "Lacrosse", pattern: /lacrosse/ },
  { sport: "Track & Field", pattern: /track/ },
  { sport: "Cross Country", pattern: /cross country/ },
  { sport: "Swimming", pattern: /swim/ },
  { sport: "Tennis", pattern: /tennis/ },
  { sport: "Golf", pattern: /golf/ },
  { sport: "Rowing", pattern: /row(ing)?|crew/ },
];

const URI_TEAM_PREFIX = /^(?:university of rhode island|uri)\s+/i;
const RESULT_PREFIX = /^\[([WLT])\]\s+/i;
const STREAM_URL_RE = /(?:Streaming Video|Watch)\s*:\s*(https?:\/\/\S.*)$/im;
const TICKET_URL_RE = /Tickets\s*:\s*(https?:\/\/\S.*)$/im;
const SCORE_LINE_RE = /^[WLT]\s+\d+(?:\s*-\s*\d+)?\b/i;
const URLDEFENSE_RE = /https:\/\/urldefense\.com\/v\d+\/__([^_]+)__/i;

export function decodeFeedUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim().replace(/[.,;]+$/, "");
  const wrapped = URLDEFENSE_RE.exec(trimmed);
  return (wrapped?.[1] ?? trimmed).replace(/\s+/g, "%20");
}

export function parseAthleticsDescriptionExtras(description: string): {
  ticketUrl: string | null;
  broadcastUrl: string | null;
  score: string | null;
} {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let ticketUrl: string | null = null;
  let broadcastUrl: string | null = null;
  let score: string | null = null;
  for (const line of lines) {
    if (!score && SCORE_LINE_RE.test(line)) score = line.replace(/\s+/g, " ");
    const tickets = TICKET_URL_RE.exec(line);
    if (tickets?.[1] && !ticketUrl) ticketUrl = decodeFeedUrl(tickets[1]);
    const stream = STREAM_URL_RE.exec(line);
    if (stream?.[1] && !broadcastUrl) broadcastUrl = decodeFeedUrl(stream[1]);
  }
  return { ticketUrl, broadcastUrl, score };
}

export function stripAthleticsResultPrefix(title: string): {
  title: string;
  result: "W" | "L" | "T" | null;
} {
  const match = RESULT_PREFIX.exec(title);
  if (!match) return { title: title.trim(), result: null };
  return {
    title: title.slice(match[0].length).trim(),
    result: match[1]!.toUpperCase() as "W" | "L" | "T",
  };
}

function sportFromUriTeam(team: string | null): string | null {
  if (!team) return null;
  const stripped = team.replace(URI_TEAM_PREFIX, "").trim();
  return stripped || null;
}

function cleanOpponent(opponent: string | null): string | null {
  if (!opponent) return null;
  return opponent.replace(/\s+-\s+.*$/, "").trim() || opponent.trim();
}

export function parseAthleticsTitle(title: string): {
  team: string | null;
  opponent: string | null;
  homeAway: HomeAway | null;
  sport: string | null;
} {
  const trimmed = stripAthleticsResultPrefix(title).title;
  const vs = /^(.*?)\s+vs\.?\s+(.*)$/i.exec(trimmed);
  const at = /^(.*?)\s+(?:at|@)\s+(.*)$/i.exec(trimmed);
  const match = vs ?? at;
  const team = match?.[1]?.trim() || null;
  const opponent = cleanOpponent(match?.[2]?.trim() || null);
  const homeAway: HomeAway | null = vs ? "home" : at ? "away" : null;
  const haystack = `${team ?? ""} ${trimmed}`.toLowerCase();
  const sport = sportFromUriTeam(team) ?? SPORT_PATTERNS.find((item) => item.pattern.test(haystack))?.sport ?? null;
  return { team, opponent, homeAway, sport };
}

export function inferHomeAway(input: { titleHomeAway: HomeAway | null; venue?: string | null }): HomeAway | null {
  if (input.titleHomeAway) return input.titleHomeAway;
  const venue = (input.venue ?? "").toLowerCase();
  if (!venue) return null;
  if (HOME_VENUE_HINTS.some((hint) => venue.includes(hint))) return "home";
  return null;
}

function coerceLiveStatus(
  value: string | null | undefined,
  cancelled: boolean,
  resultPrefix: "W" | "L" | "T" | null,
  score: string | null,
): AthleticsLiveStatus {
  if (cancelled) return "cancelled";
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "live" || raw === "in progress") return "live";
  if (raw === "cancelled" || raw === "canceled") return "cancelled";
  if (raw === "postponed") return "cancelled";
  if (resultPrefix || score || raw === "final" || raw === "completed" || raw === "complete") return "final";
  return "upcoming";
}

function asIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function athleticsJsonToNormalized(row: AthleticsJsonEvent): NormalizedCampusEvent | null {
  const stripped = stripAthleticsResultPrefix((row.title ?? "").trim());
  const title = stripped.title;
  const startsAt = asIso(row.startsAt ?? row.start);
  const externalId = String(row.id ?? "").trim() || (title && startsAt ? `${title}|${startsAt}` : "");
  if (!title || !startsAt || !externalId) return null;

  const parsedTitle = parseAthleticsTitle(title);
  const extras = parseAthleticsDescriptionExtras(row.description ?? "");
  const venue = (row.venue ?? row.location ?? "").trim() || null;
  const cancelled =
    Boolean(row.cancelled) ||
    /cancell?ed|postponed/i.test(`${title} ${row.status ?? ""} ${row.description ?? ""}`);
  const sport = (row.sport ?? parsedTitle.sport ?? "").trim() || null;
  const opponent = (row.opponent ?? parsedTitle.opponent ?? "").trim() || null;
  const team = (row.team ?? parsedTitle.team ?? "").trim() || null;
  const homeAway =
    (["home", "away", "neutral"].includes(String(row.homeAway))
      ? (row.homeAway as HomeAway)
      : inferHomeAway({ titleHomeAway: parsedTitle.homeAway, venue })) ?? null;
  const score = row.score?.trim() || extras.score;
  const eventUrl = decodeFeedUrl(row.eventUrl ?? row.url);
  const ticketUrl = decodeFeedUrl(row.ticketUrl) ?? extras.ticketUrl;
  const broadcastUrl = decodeFeedUrl(row.broadcastUrl ?? row.watchUrl) ?? extras.broadcastUrl;
  const tags = [sport, opponent, team, homeAway].filter(Boolean) as string[];

  return {
    source: "athletics",
    sourceType: "athletics",
    externalId: externalId.slice(0, 180),
    title: title.slice(0, 500),
    description: (row.description ?? "").slice(0, 5000),
    organizationName: team || (sport ? `URI ${sport}` : "URI Athletics"),
    sport,
    opponent,
    homeAway,
    category: canonicalEventCategory({ source: "athletics", sport, title }),
    tags,
    startsAt,
    endsAt: asIso(row.endsAt ?? row.end),
    timezone: row.timezone?.trim() || "America/New_York",
    venueName: venue,
    locationName: venue,
    address: null,
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    imageUrl: row.imageUrl?.trim() || null,
    eventUrl,
    ticketUrl,
    broadcastUrl,
    rsvpUrl: null,
    cqRsvpEnabled: true,
    isCancelled: cancelled,
    liveStatus: coerceLiveStatus(row.status, cancelled, stripped.result, score),
    score,
    audience: "campus",
    visibility: "public",
    featured: false,
    sourceIds: { athletics: externalId.slice(0, 180) },
  };
}

export function athleticsIcsToNormalized(raw: string): NormalizedCampusEvent[] {
  return parseIcsEvents(raw)
    .map((event) =>
      athleticsJsonToNormalized({
        id: event.uid,
        title: event.summary,
        description: event.description,
        startsAt: event.startsAt ?? undefined,
        endsAt: event.endsAt ?? undefined,
        venue: event.location,
        eventUrl: event.url,
        sport: event.categories[0],
        status: event.status ?? undefined,
        cancelled: /cancell?ed/i.test(event.status ?? ""),
      }),
    )
    .filter((event): event is NormalizedCampusEvent => event != null);
}

export function parseAthleticsFeed(raw: string, format: "ics" | "json"): NormalizedCampusEvent[] {
  if (format === "ics") return athleticsIcsToNormalized(raw);
  const parsed = JSON.parse(raw) as AthleticsFeedPayload | AthleticsJsonEvent[];
  const rows = Array.isArray(parsed) ? parsed : parsed.events ?? parsed.games ?? [];
  return rows.map(athleticsJsonToNormalized).filter((event): event is NormalizedCampusEvent => event != null);
}

export function athleticsTeamOrganization(event: NormalizedCampusEvent): NormalizedCampusOrganization | null {
  const name = event.organizationName?.trim();
  if (!name) return null;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return {
    source: "athletics",
    sourceType: "athletics",
    externalId: slug || name.slice(0, 80),
    name,
    organizationType: "athletics_team",
    description: event.sport ? `Official URI ${event.sport} team.` : "URI Athletics team.",
    logoUrl: event.imageUrl,
    category: "Athletics",
    tags: [event.sport, event.organizationName].filter(Boolean) as string[],
    websiteUrl: event.eventUrl,
    verified: true,
  };
}

export function athleticsFeedFormatFromEnv(value: string | null | undefined): "ics" | "json" {
  return value?.trim().toLowerCase() === "json" ? "json" : "ics";
}

export function athleticsFeedUrlsFromEnv(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const urls: string[] = [];
  const primary = env.URI_ATHLETICS_FEED_URL?.trim();
  if (primary) urls.push(primary);
  for (const part of (env.URI_ATHLETICS_FEED_URLS ?? "").split(/[\n,]/)) {
    const url = part.trim();
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/** Future highlight videos can hang off this stable Athletics event identity. */
export function athleticsHighlightRelation(event: Pick<
  NormalizedCampusEvent,
  "externalId" | "sport" | "organizationName" | "opponent" | "venueName" | "startsAt" | "homeAway"
>) {
  return {
    kind: "athletics_event" as const,
    eventExternalId: event.externalId,
    sport: event.sport ?? null,
    team: event.organizationName ?? null,
    opponent: event.opponent ?? null,
    venue: event.venueName ?? null,
    startsAt: event.startsAt,
    homeAway: event.homeAway ?? null,
    mapEligible: athleticsEventEligibleForCampusMap({
      source: "athletics",
      homeAway: event.homeAway,
    }),
  };
}
