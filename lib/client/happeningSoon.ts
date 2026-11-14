import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { campusEventHostLabel, feedEventLocationText } from "@/lib/client/eventFeedTypes";
import { eventIsCurrentOrUpcoming } from "@/lib/client/eventsFeedFilters";
import { eventsLikelyDuplicate, type DedupeEventLike } from "@/lib/eventSources/dedupe";
import type { RecommendationScore } from "@/lib/recommendations/types";

export const HAPPENING_SOON_LIMIT = 6;
/** Near-term window for Happening Soon; scoring already prefers today and the next few days. */
export const HAPPENING_SOON_HORIZON_MS = 14 * 24 * 60 * 60 * 1000;

export type RankedFeedEvent = {
  item: FeedEvent;
  recommendation: RecommendationScore | null;
};

function hoursUntilStart(startsAt: string | null, now: Date): number | null {
  if (!startsAt) return null;
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) return null;
  return (start - now.getTime()) / (60 * 60 * 1000);
}

function identityText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable fingerprint for section exclusion after fuzzy dedupe. */
export function feedEventIdentity(item: FeedEvent): string {
  const title = identityText(item.event.title);
  const location = identityText(feedEventLocationText(item));
  return `${title}|${item.event.startsAt ?? ""}|${location}`;
}

export function feedEventToDedupeLike(item: FeedEvent): DedupeEventLike {
  if (item.kind === "campus") {
    return {
      id: item.event.id,
      source: item.event.source ?? "campusquest",
      externalId: item.event.id,
      title: item.event.title,
      startsAt: item.event.startsAt,
      organizationName: campusEventHostLabel(item.event),
      locationName: item.event.location,
      venueName: item.event.location,
    };
  }
  return {
    id: item.event.id,
    source: item.event.source,
    externalId: item.event.id,
    title: item.event.title,
    startsAt: item.event.startsAt,
    organizationName: item.event.organizationName,
    locationName: item.event.location,
    venueName: item.event.venueName,
    address: item.event.address,
    opponent: item.event.opponent,
    sport: item.event.sport,
    eventUrl: item.event.eventUrl,
  };
}

function feedEventHasArtwork(item: FeedEvent): boolean {
  return item.kind === "external" && Boolean(item.event.imageUrl || item.event.bannerUrl);
}

function feedEventHasRsvp(item: FeedEvent): boolean {
  return Boolean(item.event.myRsvpStatus);
}

function feedEventHasTimeTbd(item: FeedEvent): boolean {
  if (!item.event.startsAt) return true;
  if (item.kind !== "external") return false;
  return (item.event.tags ?? []).some((tag) => /^time[_-]?tbd$/i.test(tag.trim()));
}

function pickLongerText(a: string | null | undefined, b: string | null | undefined): string | null {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (!left) return right || null;
  if (!right) return left || null;
  return right.length > left.length ? right : left;
}

function preferStartsAt(a: FeedEvent, b: FeedEvent): string | null {
  const aTbd = feedEventHasTimeTbd(a);
  const bTbd = feedEventHasTimeTbd(b);
  if (!aTbd && a.event.startsAt) return a.event.startsAt;
  if (!bTbd && b.event.startsAt) return b.event.startsAt;
  return a.event.startsAt ?? b.event.startsAt ?? null;
}

/** Merge donor fields onto base without changing the RSVP/save identity (base.id). */
export function mergeFeedEventFields(base: FeedEvent, donor: FeedEvent): FeedEvent {
  if (base.kind === "campus") return base;
  if (donor.kind === "campus") return donor;

  const baseTags = base.event.tags ?? [];
  const donorTags = donor.event.tags ?? [];
  const tags = Array.from(new Set([...baseTags, ...donorTags]));
  const startsAt = preferStartsAt(base, donor);
  const keepTimeTbd = feedEventHasTimeTbd(base) && feedEventHasTimeTbd(donor);
  const nextTags = keepTimeTbd
    ? tags
    : tags.filter((tag) => !/^time[_-]?tbd$/i.test(tag.trim()));

  return {
    kind: "external",
    event: {
      ...base.event,
      description: pickLongerText(base.event.description, donor.event.description) ?? base.event.description,
      location: pickLongerText(base.event.location, donor.event.location),
      venueName: pickLongerText(base.event.venueName, donor.event.venueName),
      address: pickLongerText(base.event.address, donor.event.address) ?? base.event.address,
      startsAt,
      endsAt: base.event.endsAt ?? donor.event.endsAt,
      imageUrl: base.event.imageUrl || donor.event.imageUrl,
      bannerUrl: base.event.bannerUrl || donor.event.bannerUrl,
      eventUrl: base.event.eventUrl || donor.event.eventUrl,
      ticketUrl: base.event.ticketUrl || donor.event.ticketUrl,
      broadcastUrl: base.event.broadcastUrl || donor.event.broadcastUrl,
      rsvpUrl: base.event.rsvpUrl || donor.event.rsvpUrl,
      organizationName: base.event.organizationName || donor.event.organizationName,
      sport: base.event.sport || donor.event.sport,
      opponent: base.event.opponent || donor.event.opponent,
      homeAway: base.event.homeAway || donor.event.homeAway,
      latitude: base.event.latitude ?? donor.event.latitude,
      longitude: base.event.longitude ?? donor.event.longitude,
      tags: nextTags,
      myRsvpStatus: base.event.myRsvpStatus ?? donor.event.myRsvpStatus,
      rsvpCount: Math.max(base.event.rsvpCount ?? 0, donor.event.rsvpCount ?? 0),
      cqRsvpEnabled: Boolean(base.event.cqRsvpEnabled || donor.event.cqRsvpEnabled),
    },
  };
}

/** Native CampusQuest rows win. Otherwise prefer RSVP state, then artwork. */
function preferFeedDuplicate(existing: FeedEvent, incoming: FeedEvent): FeedEvent {
  if (incoming.kind === "campus" && existing.kind !== "campus") {
    return mergeFeedEventFields(incoming, existing);
  }
  if (existing.kind === "campus" && incoming.kind !== "campus") {
    return mergeFeedEventFields(existing, incoming);
  }
  if (feedEventHasRsvp(incoming) && !feedEventHasRsvp(existing)) {
    return mergeFeedEventFields(incoming, existing);
  }
  if (feedEventHasRsvp(existing) && !feedEventHasRsvp(incoming)) {
    return mergeFeedEventFields(existing, incoming);
  }
  if (feedEventHasArtwork(incoming) && !feedEventHasArtwork(existing)) {
    return mergeFeedEventFields(incoming, existing);
  }
  return mergeFeedEventFields(existing, incoming);
}

/**
 * Collapse the same occurrence imported from more than one provider
 * (Localist / URInvolved / CampusQuest). Recurring sessions stay separate
 * because startsAt must agree within the shared dedupe window.
 */
export function dedupeFeedEvents(items: FeedEvent[]): FeedEvent[] {
  const chosen: FeedEvent[] = [];
  const byKey = new Set<string>();

  for (const item of items) {
    const key = `${item.kind}:${item.event.id}`;
    if (byKey.has(key)) continue;
    byKey.add(key);

    const like = feedEventToDedupeLike(item);
    const matchIndex = chosen.findIndex((existing) =>
      eventsLikelyDuplicate(feedEventToDedupeLike(existing), like),
    );
    if (matchIndex < 0) {
      chosen.push(item);
      continue;
    }
    chosen[matchIndex] = preferFeedDuplicate(chosen[matchIndex]!, item);
  }

  return chosen;
}

export function happeningSoonScore(
  item: FeedEvent,
  _recommendation: RecommendationScore | null,
  now: Date = new Date(),
): number {
  if (
    !eventIsCurrentOrUpcoming(
      {
        startsAt: item.event.startsAt,
        endsAt: item.event.endsAt,
        isCancelled: item.event.isCancelled,
        title: item.event.title,
      },
      now,
    )
  ) {
    return -1;
  }
  const hours = hoursUntilStart(item.event.startsAt, now);
  if (hours == null || hours > HAPPENING_SOON_HORIZON_MS / (60 * 60 * 1000)) return -1;
  return Math.max(0, 90 - Math.max(0, hours) * 0.85);
}

/** Index of the card nearest the leading edge, with a small look-ahead so a peek does not flip early. */
export function visibleCarouselIndex(scrollLeft: number, clientWidth: number, offsets: readonly number[]): number {
  if (offsets.length === 0) return 0;
  const left = scrollLeft + clientWidth * 0.2;
  let closest = 0;
  let closestDist = Number.POSITIVE_INFINITY;
  offsets.forEach((offset, cardIndex) => {
    const dist = Math.abs(offset - left);
    if (dist < closestDist) {
      closest = cardIndex;
      closestDist = dist;
    }
  });
  return closest;
}

export function selectHappeningSoon(
  rows: RankedFeedEvent[],
  now: Date = new Date(),
  limit = HAPPENING_SOON_LIMIT,
): RankedFeedEvent[] {
  const seen = new Set<string>();
  const kept: RankedFeedEvent[] = [];
  const sorted = rows
    .map((row) => ({ row, score: happeningSoonScore(row.item, row.recommendation, now) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => {
      const aTime = a.row.item.event.startsAt ? new Date(a.row.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.row.item.event.startsAt ? new Date(b.row.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return a.row.item.event.id.localeCompare(b.row.item.event.id);
    });

  for (const entry of sorted) {
    if (seen.has(entry.row.item.event.id)) continue;
    if (
      kept.some((existing) =>
        eventsLikelyDuplicate(feedEventToDedupeLike(existing.item), feedEventToDedupeLike(entry.row.item)),
      )
    ) {
      continue;
    }
    seen.add(entry.row.item.event.id);
    kept.push(entry.row);
    if (kept.length >= limit) break;
  }
  return kept;
}

export function partitionDiscoverySections(input: {
  ranked: RankedFeedEvent[];
  timeframe: string;
  searchQuery: string;
  savedOnly: boolean;
  now?: Date;
  forYouLimit?: number;
}): {
  happeningSoon: RankedFeedEvent[];
  forYou: RankedFeedEvent[];
  more: RankedFeedEvent[];
} {
  const now = input.now ?? new Date();
  if (input.searchQuery.trim() || input.savedOnly) {
    return { happeningSoon: [], forYou: [], more: input.ranked };
  }

  const happeningSoon = selectHappeningSoon(input.ranked, now);
  const usedIds = new Set(happeningSoon.map((row) => row.item.event.id));
  const remaining = input.ranked.filter((row) => {
    if (usedIds.has(row.item.event.id)) return false;
    return !happeningSoon.some((featured) =>
      eventsLikelyDuplicate(feedEventToDedupeLike(featured.item), feedEventToDedupeLike(row.item)),
    );
  });

  if (input.timeframe !== "for_you") {
    return { happeningSoon, forYou: [], more: remaining };
  }

  const forYouLimit = input.forYouLimit ?? 8;
  const forYou = remaining.slice(0, forYouLimit);
  const forYouIds = new Set(forYou.map((row) => row.item.event.id));
  const more = remaining.filter((row) => !forYouIds.has(row.item.event.id));
  return { happeningSoon, forYou, more };
}
