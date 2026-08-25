import { deriveClassStanding } from "@/lib/onboarding/graduationYear";
import { isCampusWideImportant } from "@/lib/recommendations/campusImportance";
import { matchRecommendationTopics } from "@/lib/recommendations/match";
import { buildRecommendationReason } from "@/lib/recommendations/reasons";
import type {
  RecommendationEntity,
  RecommendationScore,
  RecommendationScoreBreakdown,
  UserRecommendationProfile,
} from "@/lib/recommendations/types";
import { RECOMMENDATION_WEIGHTS, REASON_MIN_SCORE } from "@/lib/recommendations/weights";

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function popularitySignal(count: number | undefined): number {
  const n = Math.max(0, count ?? 0);
  if (n <= 0) return 0;
  return clamp01(Math.log10(1 + n) / 2);
}

function eventTimeSignal(entity: RecommendationEntity, nowMs: number): number {
  if (entity.kind !== "event" && entity.kind !== "quest") return 0;
  const start = entity.startsAtMs ?? null;
  const end = entity.endsAtMs ?? null;
  if (start == null) return 0.35;
  if (end != null && end < nowMs) return 0.02;
  if (start <= nowMs && (end == null || end >= nowMs)) return 1;
  const hours = (start - nowMs) / (60 * 60 * 1000);
  if (hours < 0) return 0.08;
  if (hours <= 6) return 0.92;
  if (hours <= 24) return 0.8;
  if (hours <= 72) return 0.62;
  if (hours <= 168) return 0.48;
  if (hours <= 720) return 0.28;
  return 0.12;
}

function recencySignal(entity: RecommendationEntity, nowMs: number): number {
  if (entity.kind !== "post") return 0;
  const created = entity.createdAtMs ?? 0;
  if (!created) return 0.2;
  const hours = (nowMs - created) / (60 * 60 * 1000);
  if (hours <= 3) return 1;
  if (hours <= 24) return 0.75;
  if (hours <= 72) return 0.45;
  if (hours <= 168) return 0.2;
  return 0.05;
}

function engagementSignal(entity: RecommendationEntity): number {
  if (entity.kind !== "post") return 0;
  return popularitySignal(entity.engagementCount);
}

function organizationMatchSignal(entity: RecommendationEntity, profile: UserRecommendationProfile): number {
  const id = entity.organizationId?.trim();
  if (id && profile.followedOrganizationIds.includes(id)) return 1;
  const name = entity.organizationName?.trim().toLowerCase();
  if (!name) return 0;
  return profile.followedOrganizationNames.some((followed) => followed.trim().toLowerCase() === name) ? 1 : 0;
}

function inferredSignal(
  topics: string[],
  profile: UserRecommendationProfile,
  explicit: Set<string>,
): number {
  let max = 0;
  for (const topic of topics) {
    if (explicit.has(topic)) continue;
    max = Math.max(max, profile.inferredAffinities[topic] ?? 0);
  }
  return clamp01(max);
}

function studentTypeSignal(
  hints: string[],
  profile: UserRecommendationProfile,
  nowMs: number,
): number {
  const status = profile.studentStatus ?? "";
  if (status === "incoming_student" && hints.includes("incoming_student")) return 1;
  if (status === "graduate_student" && hints.includes("graduate_student")) return 1;
  if (status === "faculty_staff" && hints.includes("faculty_staff")) return 0.8;
  if (hints.includes("senior") && deriveClassStanding(profile.classYear, new Date(nowMs)) === "senior") {
    return 0.7;
  }
  return 0;
}

function campusMismatch(entity: RecommendationEntity, profile: UserRecommendationProfile): number {
  const userCampus = profile.campusId?.trim().toLowerCase();
  const entityCampus = entity.campusId?.trim().toLowerCase();
  if (!userCampus || !entityCampus) return 0;
  return userCampus === entityCampus ? 0 : 1;
}

export function scoreRecommendationEntity(
  entity: RecommendationEntity,
  profile: UserRecommendationProfile,
  nowMs: number,
): RecommendationScore {
  const match = matchRecommendationTopics(entity);
  const campusImportant = isCampusWideImportant(entity) || match.campusImportant;
  const explicitInterests = new Set(profile.explicitInterests);
  const explicitCommunities = new Set(profile.explicitCommunities);
  const matchedInterests = match.interestIds.filter((id) => explicitInterests.has(id));
  const matchedCommunities = match.communityIds.filter((id) => explicitCommunities.has(id));
  const allTopics = [...match.interestIds, ...match.communityIds];

  const breakdown: RecommendationScoreBreakdown = {
    interestMatch: matchedInterests.length > 0 ? Math.min(1, 0.72 + 0.14 * matchedInterests.length) : 0,
    communityMatch: matchedCommunities.length > 0 ? Math.min(1, 0.72 + 0.14 * matchedCommunities.length) : 0,
    organizationMatch: organizationMatchSignal(entity, profile),
    inferredAffinity: inferredSignal(
      allTopics,
      profile,
      new Set([...profile.explicitInterests, ...profile.explicitCommunities]),
    ),
    timeRelevance: eventTimeSignal(entity, nowMs),
    campusImportance: campusImportant ? 1 : 0,
    popularity: popularitySignal(entity.popularityCount),
    studentTypeRelevance: studentTypeSignal(match.studentTypeHints, profile, nowMs),
    recency: recencySignal(entity, nowMs),
    engagement: engagementSignal(entity),
    campusMismatchPenalty: campusMismatch(entity, profile),
    total: 0,
  };

  const total =
    breakdown.interestMatch * RECOMMENDATION_WEIGHTS.interestMatch +
    breakdown.communityMatch * RECOMMENDATION_WEIGHTS.communityMatch +
    breakdown.organizationMatch * RECOMMENDATION_WEIGHTS.organizationMatch +
    breakdown.inferredAffinity * RECOMMENDATION_WEIGHTS.inferredAffinity +
    breakdown.timeRelevance * RECOMMENDATION_WEIGHTS.timeRelevance +
    breakdown.campusImportance * RECOMMENDATION_WEIGHTS.campusImportance +
    breakdown.popularity * RECOMMENDATION_WEIGHTS.popularity +
    breakdown.studentTypeRelevance * RECOMMENDATION_WEIGHTS.studentTypeRelevance +
    breakdown.recency * RECOMMENDATION_WEIGHTS.recency +
    breakdown.engagement * RECOMMENDATION_WEIGHTS.engagement -
    breakdown.campusMismatchPenalty * RECOMMENDATION_WEIGHTS.campusMismatchPenalty;

  breakdown.total = Math.round(total * 100) / 100;

  let reason = null;
  if (breakdown.total >= REASON_MIN_SCORE) {
    if (matchedInterests[0]) {
      reason = buildRecommendationReason({ code: "interest", topic: matchedInterests[0] });
    } else if (matchedCommunities[0]) {
      reason = buildRecommendationReason({ code: "community", topic: matchedCommunities[0] });
    } else if (breakdown.organizationMatch >= 1) {
      reason = buildRecommendationReason({ code: "organization" });
    } else if (campusImportant) {
      reason = buildRecommendationReason({ code: "campus_wide" });
    } else if (breakdown.timeRelevance >= 1 && entity.kind === "event") {
      reason = buildRecommendationReason({ code: "happening_now" });
    } else if (breakdown.inferredAffinity >= 0.45) {
      reason = buildRecommendationReason({ code: "recommended" });
    } else if (breakdown.popularity >= 0.55 && matchedInterests.length === 0) {
      reason = buildRecommendationReason({ code: "popular" });
    }
  }

  return {
    entityId: entity.id,
    score: breakdown.total,
    matchedInterests,
    matchedCommunities,
    reason,
    debug: profile.includeDebug ? breakdown : undefined,
  };
}
