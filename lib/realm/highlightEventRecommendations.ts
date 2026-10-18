import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { INTEREST_OPTIONS } from "@/lib/onboarding/taxonomy";
import { mapEventPinToRecommendationEntity } from "@/lib/recommendations/adapters";
import { matchRecommendationTopics } from "@/lib/recommendations/match";
import type { UserRecommendationProfile } from "@/lib/recommendations/types";
import {
  CAMPUS_TIME_ZONE,
  formatCampusTime,
  getCampusDayWindow,
  isOnCampusDay,
  parseEventInstant,
} from "@/lib/realm/campusTime";
import { isEventCancelled } from "@/lib/realm/eventCountdown";
import { isLiveOrUpcomingMapEvent } from "@/lib/realm/eventVisibility";
import {
  collectMapRecommendationSources,
  type MapRecommendationLandmark,
} from "@/lib/realm/mapRecommendations";

export type HighlightRecommendationMode = "personalized" | "discovery" | "empty";

export type HighlightEventRecommendation = {
  id: string;
  event: MapEventPin;
  title: string;
  locationName: string;
  timeLabel: string;
  imageUrl: string | null;
  interestId: string | null;
  interestLabel: string | null;
  explanation: string;
  personalized: boolean;
  score: number;
};

const INTEREST_LABELS = new Map(INTEREST_OPTIONS.map((option) => [option.id, option.label]));
const BLOCKED_VISIBILITY = new Set(["private", "hidden", "deleted", "staff", "faculty", "invite", "invited"]);
const ORG_CAP = 2;

type ScoredEvent = {
  id: string;
  event: MapEventPin;
  locationName: string;
  matchedInterests: string[];
  displayInterest: string | null;
  followedOrg: boolean;
  attended: boolean;
  score: number;
  startsAtMs: number;
};

function eventVisibility(event: MapEventPin): string {
  const extra = event as MapEventPin & {
    hidden?: boolean;
    deleted?: boolean;
    visibility?: string | null;
    audience?: string | null;
  };
  if (extra.hidden || extra.deleted) return "hidden";
  const visibility = extra.visibility?.trim().toLowerCase() ?? "";
  if (visibility) return visibility;
  const audience = extra.audience?.trim().toLowerCase() ?? "";
  if (audience === "staff" || audience === "faculty" || audience === "private") return audience;
  return "";
}

/** Upcoming events a student is allowed to see. Buildings are never candidates. */
export function isHighlightEventEligible(event: MapEventPin, now: Date): boolean {
  if (!event.id?.trim() || !event.title?.trim()) return false;
  if (isEventCancelled(event)) return false;
  const visibility = eventVisibility(event);
  if (visibility && BLOCKED_VISIBILITY.has(visibility)) return false;
  if (event.placementStatus === "hidden" || event.placementStatus === "deleted") return false;
  if (!parseEventInstant(event.startsAt)) return false;
  return isLiveOrUpcomingMapEvent(event, now);
}

function interestLabel(id: string | null): string | null {
  if (!id) return null;
  return INTEREST_LABELS.get(id as (typeof INTEREST_OPTIONS)[number]["id"]) ?? id;
}

function chosenInterest(matched: string[], order: string[]): string | null {
  for (const id of order) {
    if (matched.includes(id)) return id;
  }
  return matched[0] ?? null;
}

function topicsWithoutLocation(event: MapEventPin) {
  const entity = mapEventPinToRecommendationEntity(event, event.locationText ?? "");
  return matchRecommendationTopics({ ...entity, locationName: null });
}

function orgTopics(event: MapEventPin) {
  const name = event.organizationName?.trim() ?? "";
  if (!name) return [];
  return matchRecommendationTopics({
    id: event.organizationId?.trim() || name,
    kind: "organization",
    title: name,
    organizationName: name,
    locationName: null,
  }).interestIds;
}

function soonScore(startsAtMs: number, nowMs: number): number {
  const hours = (startsAtMs - nowMs) / (60 * 60 * 1000);
  if (hours <= 6) return 1;
  if (hours <= 24) return 0.85;
  if (hours <= 72) return 0.65;
  if (hours <= 168) return 0.4;
  return 0.15;
}

function highlightTimeLabel(startsAt: string, now: Date): string {
  const start = parseEventInstant(startsAt);
  if (!start) return "Upcoming";
  const time = formatCampusTime(start);
  if (isOnCampusDay(start, now)) return `Today · ${time}`;
  const tomorrow = new Date(getCampusDayWindow(now).end.getTime() + 60_000);
  if (isOnCampusDay(start, tomorrow)) return `Tomorrow · ${time}`;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  return `${date} · ${time}`;
}

function duplicateKeys(event: MapEventPin): string[] {
  const keys = [`id:${event.id.trim().toLowerCase()}`];
  const external = (event.externalEventId ?? event.sourceExternalId ?? event.canonicalEventId ?? "").trim().toLowerCase();
  if (external) keys.push(`ext:${external}`);
  const title = event.title.trim().toLowerCase();
  const start = event.startsAt.trim();
  if (title && start) keys.push(`when:${title}|${start}`);
  return keys;
}

function attendedIds(profile: UserRecommendationProfile): Set<string> {
  return new Set(profile.attendedEventIds.map((id) => id.trim().toLowerCase()).filter(Boolean));
}

function isAttended(event: MapEventPin, attended: Set<string>): boolean {
  const ids = [event.id, event.externalEventId, event.canonicalEventId, event.sourceExternalId];
  return ids.some((id) => id && attended.has(id.trim().toLowerCase()));
}

function orgKey(event: MapEventPin): string {
  return event.organizationId?.trim() || event.organizationName?.trim().toLowerCase() || "";
}

function diversify(ranked: ScoredEvent[], limit: number): ScoredEvent[] {
  const picked: ScoredEvent[] = [];
  const deferred: ScoredEvent[] = [];
  const seen = new Set<string>();
  const orgCounts = new Map<string, number>();
  const interestCounts = new Map<string, number>();

  const blocked = (row: ScoredEvent) => {
    if (seen.has(row.id)) return true;
    const org = orgKey(row.event);
    return Boolean(org) && (orgCounts.get(org) ?? 0) >= ORG_CAP;
  };

  const take = (row: ScoredEvent) => {
    picked.push(row);
    seen.add(row.id);
    const org = orgKey(row.event);
    if (org) orgCounts.set(org, (orgCounts.get(org) ?? 0) + 1);
    if (row.displayInterest) interestCounts.set(row.displayInterest, (interestCounts.get(row.displayInterest) ?? 0) + 1);
  };

  ranked.forEach((row, index) => {
    if (picked.length >= limit || blocked(row)) return;
    const topic = row.displayInterest;
    const crowded = Boolean(topic) && (interestCounts.get(topic as string) ?? 0) >= 2;
    const alternate = crowded
      ? ranked.slice(index + 1).some((other) => {
          if (blocked(other) || !other.displayInterest || other.displayInterest === topic) return false;
          return other.matchedInterests.length > 0 && other.score >= row.score * 0.75;
        })
      : false;
    if (alternate) {
      deferred.push(row);
      return;
    }
    take(row);
  });

  for (const row of deferred) {
    if (picked.length >= limit || blocked(row)) continue;
    take(row);
  }
  return picked;
}

function toCard(row: ScoredEvent, now: Date, personalized: boolean): HighlightEventRecommendation {
  const label = interestLabel(row.displayInterest);
  let explanation = "Upcoming on campus";
  if (personalized && label) explanation = `Because you're interested in ${label}`;
  else if (personalized && row.followedOrg) explanation = "From an organization you follow";
  return {
    id: row.id,
    event: row.event,
    title: row.event.title.trim(),
    locationName: row.locationName,
    timeLabel: highlightTimeLabel(row.event.startsAt, now),
    imageUrl: row.event.imageUrl?.trim() || null,
    interestId: personalized ? row.displayInterest : null,
    interestLabel: personalized ? label : null,
    explanation,
    personalized,
    score: row.score,
  };
}

export function rankHighlightEventRecommendations(args: {
  landmarks: MapRecommendationLandmark[];
  groups: GroupedMapLocation[];
  profile: UserRecommendationProfile;
  now: Date;
  limit?: number;
}): { mode: HighlightRecommendationMode; items: HighlightEventRecommendation[] } {
  const limit = args.limit ?? 4;
  const interests = args.profile.explicitInterests.filter(Boolean);
  const interestSet = new Set(interests);
  const attended = attendedIds(args.profile);
  const followedIds = new Set(args.profile.followedOrganizationIds.map((id) => id.trim()).filter(Boolean));
  const followedNames = new Set(
    args.profile.followedOrganizationNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const seen = new Set<string>();
  const scored: ScoredEvent[] = [];

  for (const source of collectMapRecommendationSources(args)) {
    if (source.kind !== "event" || !source.event) continue;
    const event = source.event;
    if (!isHighlightEventEligible(event, args.now)) continue;
    const keys = duplicateKeys(event);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));

    const matchedInterests = topicsWithoutLocation(event).interestIds.filter((id) => interestSet.has(id));
    const orgInterest = orgTopics(event).find((id) => interestSet.has(id)) ?? null;
    const followedOrg = Boolean(
      (event.organizationId && followedIds.has(event.organizationId)) ||
        (event.organizationName && followedNames.has(event.organizationName.trim().toLowerCase())),
    );
    const displayInterest = chosenInterest(matchedInterests, interests) ?? (interestSet.has(orgInterest ?? "") ? orgInterest : null);
    const relevant = matchedInterests.length > 0 || Boolean(displayInterest) || followedOrg;
    if (interests.length > 0 && !relevant) continue;

    const startsAtMs = parseEventInstant(event.startsAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    const primary = interests[0];
    const score =
      matchedInterests.length * 100 +
      (primary && matchedInterests.includes(primary) ? 40 : 0) +
      soonScore(startsAtMs, args.now.getTime()) * 25 +
      (followedOrg || orgInterest ? 15 : 0) -
      (isAttended(event, attended) ? 50 : 0);

    scored.push({
      id: keys[0] ?? event.id,
      event,
      locationName: source.locationName,
      matchedInterests,
      displayInterest,
      followedOrg,
      attended: isAttended(event, attended),
      score,
      startsAtMs,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.startsAtMs !== b.startsAtMs) return a.startsAtMs - b.startsAtMs;
    return a.event.title.localeCompare(b.event.title);
  });

  if (interests.length === 0) {
    const items = diversify(scored, limit).map((row) => toCard(row, args.now, false));
    return { mode: items.length > 0 ? "discovery" : "empty", items };
  }

  const items = diversify(scored, limit).map((row) => toCard(row, args.now, true));
  return { mode: items.length > 0 ? "personalized" : "empty", items };
}
