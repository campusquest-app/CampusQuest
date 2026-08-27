import {
  eventCardCategory,
  eventShowOnRealmEligible,
  feedEventIsAthletics,
} from "@/lib/client/eventCardPresentation";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { isUpcomingEvent } from "@/lib/client/eventsFeedFilters";
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

export function happeningSoonScore(
  item: FeedEvent,
  recommendation: RecommendationScore | null,
  now: Date = new Date(),
): number {
  if (!isUpcomingEvent(item.event.startsAt)) return -1;
  const hours = hoursUntilStart(item.event.startsAt, now);
  if (hours == null || hours > HAPPENING_SOON_HORIZON_MS / (60 * 60 * 1000)) return -1;

  let score = Math.max(0, 90 - Math.max(0, hours) * 0.85);
  if (item.kind === "external" && item.event.imageUrl) score += 12;
  if (feedEventIsAthletics(item)) score += 10;
  if (eventCardCategory(item) === "Fine Arts") score += 4;
  if (eventShowOnRealmEligible(item)) score += 8;
  if (recommendation?.score) score += Math.min(18, recommendation.score * 6);
  return score;
}

export function selectHappeningSoon(
  rows: RankedFeedEvent[],
  now: Date = new Date(),
  limit = HAPPENING_SOON_LIMIT,
): RankedFeedEvent[] {
  return rows
    .map((row) => ({ row, score: happeningSoonScore(row.item, row.recommendation, now) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.row.item.event.startsAt ? new Date(a.row.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.row.item.event.startsAt ? new Date(b.row.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
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
  const happeningIds = new Set(happeningSoon.map((row) => row.item.event.id));

  if (input.timeframe !== "for_you") {
    const more = input.ranked.filter((row) => !happeningIds.has(row.item.event.id));
    return { happeningSoon, forYou: [], more };
  }

  const forYouLimit = input.forYouLimit ?? 8;
  const forYou = input.ranked.filter((row) => !happeningIds.has(row.item.event.id)).slice(0, forYouLimit);
  const forYouIds = new Set(forYou.map((row) => row.item.event.id));
  const more = input.ranked.filter(
    (row) => !happeningIds.has(row.item.event.id) && !forYouIds.has(row.item.event.id),
  );
  return { happeningSoon, forYou, more };
}
