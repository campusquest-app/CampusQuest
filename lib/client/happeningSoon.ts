import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { eventIsCurrentOrUpcoming } from "@/lib/client/eventsFeedFilters";
import type { RecommendationScore } from "@/lib/recommendations/types";

export const HAPPENING_SOON_LIMIT = 6;
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

export function feedEventIdentity(item: FeedEvent): string {
  const title = item.event.title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${title}|${item.event.startsAt ?? ""}`;
}

function feedEventHasArtwork(item: FeedEvent): boolean {
  return item.kind === "external" && Boolean(item.event.imageUrl || item.event.bannerUrl);
}

/** Collapse the same event imported from more than one provider. Prefer a row that has artwork. */
export function dedupeFeedEvents(items: FeedEvent[]): FeedEvent[] {
  const chosen = new Map<string, FeedEvent>();
  const order: string[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.event.id}`;
    const identity = feedEventIdentity(item);
    if (chosen.has(key)) continue;
    const existing = chosen.get(identity);
    if (!existing) {
      order.push(identity);
      chosen.set(identity, item);
      chosen.set(key, item);
      continue;
    }
    if (feedEventHasArtwork(item) && !feedEventHasArtwork(existing)) {
      chosen.set(identity, item);
      chosen.set(key, item);
    }
  }
  return order.map((key) => chosen.get(key)!);
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
  return rows
    .map((row) => ({ row, score: happeningSoonScore(row.item, row.recommendation, now) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => {
      const aTime = a.row.item.event.startsAt ? new Date(a.row.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.row.item.event.startsAt ? new Date(b.row.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return a.row.item.event.id.localeCompare(b.row.item.event.id);
    })
    .filter((entry) => {
      const identity = feedEventIdentity(entry.row.item);
      if (seen.has(identity) || seen.has(entry.row.item.event.id)) return false;
      seen.add(identity);
      seen.add(entry.row.item.event.id);
      return true;
    })
    .slice(0, limit)
    .map((entry) => entry.row);
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
  const used = new Set<string>();
  for (const row of happeningSoon) {
    used.add(row.item.event.id);
    used.add(feedEventIdentity(row.item));
  }
  const remaining = input.ranked.filter(
    (row) => !used.has(row.item.event.id) && !used.has(feedEventIdentity(row.item)),
  );

  if (input.timeframe !== "for_you") {
    return { happeningSoon, forYou: [], more: remaining };
  }

  const forYouLimit = input.forYouLimit ?? 8;
  const forYou = remaining.slice(0, forYouLimit);
  const forYouIds = new Set(forYou.flatMap((row) => [row.item.event.id, feedEventIdentity(row.item)]));
  const more = remaining.filter(
    (row) => !forYouIds.has(row.item.event.id) && !forYouIds.has(feedEventIdentity(row.item)),
  );
  return { happeningSoon, forYou, more };
}
