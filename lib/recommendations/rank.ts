import { matchRecommendationTopics } from "@/lib/recommendations/match";
import { scoreRecommendationEntity } from "@/lib/recommendations/score";
import type {
  RankedRecommendation,
  RecommendationEntity,
  UserRecommendationProfile,
} from "@/lib/recommendations/types";
import { DIVERSITY_MAX_STREAK, FEED_EXPLORE_EVERY } from "@/lib/recommendations/weights";

function entityTieBreak(a: RecommendationEntity, b: RecommendationEntity): number {
  const aTime = a.startsAtMs ?? a.createdAtMs ?? 0;
  const bTime = b.startsAtMs ?? b.createdAtMs ?? 0;
  if (a.kind === "event" || a.kind === "quest") {
    if (aTime !== bTime) return aTime - bTime;
  } else if (aTime !== bTime) {
    return bTime - aTime;
  }
  return a.id.localeCompare(b.id);
}

function applyDiversity<T>(
  ranked: Array<RankedRecommendation<T>>,
  options: { exploreEvery: number },
): Array<RankedRecommendation<T>> {
  if (ranked.length < 3) return ranked;
  const remaining = [...ranked];
  const out: Array<RankedRecommendation<T>> = [];
  let streakTopic: string | null = null;
  let streak = 0;

  while (remaining.length > 0) {
    const preferExploration =
      options.exploreEvery > 0 && out.length > 0 && out.length % options.exploreEvery === 0;
    let pickIndex = 0;
    if (preferExploration) {
      const exploreIndex = remaining.findIndex((row) => {
        const topic = matchRecommendationTopics(row.entity).primaryTopic;
        return topic && topic !== streakTopic && row.recommendation.matchedInterests.length === 0;
      });
      if (exploreIndex > 0) pickIndex = exploreIndex;
    } else if (streak >= DIVERSITY_MAX_STREAK && streakTopic) {
      const nextDifferent = remaining.findIndex((row) => {
        const topic = matchRecommendationTopics(row.entity).primaryTopic;
        return topic !== streakTopic;
      });
      if (nextDifferent > 0) pickIndex = nextDifferent;
    }

    const [picked] = remaining.splice(pickIndex, 1);
    if (!picked) break;
    const topic = matchRecommendationTopics(picked.entity).primaryTopic;
    if (topic === streakTopic) streak += 1;
    else {
      streakTopic = topic;
      streak = 1;
    }
    out.push(picked);
  }
  return out;
}

export function rankRecommendationEntities<T>(args: {
  items: T[];
  toEntity: (item: T) => RecommendationEntity;
  profile: UserRecommendationProfile;
  nowMs: number;
  diversity?: boolean;
  exploreEvery?: number;
}): Array<RankedRecommendation<T>> {
  const scored = args.items.map((item) => {
    const entity = args.toEntity(item);
    return {
      item,
      entity,
      recommendation: scoreRecommendationEntity(entity, args.profile, args.nowMs),
    };
  });

  scored.sort((a, b) => {
    if (b.recommendation.score !== a.recommendation.score) {
      return b.recommendation.score - a.recommendation.score;
    }
    return entityTieBreak(a.entity, b.entity);
  });

  if (!args.diversity) return scored;
  return applyDiversity(scored, { exploreEvery: args.exploreEvery ?? FEED_EXPLORE_EVERY });
}
