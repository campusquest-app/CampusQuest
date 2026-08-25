/**
 * Single configurable weight table for CampusQuest recommendations.
 * Tune here — do not scatter magic numbers in Feed/Events/Map.
 */

export const RECOMMENDATION_WEIGHTS = {
  interestMatch: 28,
  communityMatch: 22,
  organizationMatch: 14,
  inferredAffinity: 12,
  timeRelevance: 16,
  campusImportance: 20,
  popularity: 8,
  studentTypeRelevance: 8,
  recency: 14,
  engagement: 6,
  campusMismatchPenalty: 36,
} as const;

export type RecommendationWeightKey = keyof typeof RECOMMENDATION_WEIGHTS;

/** Floor timestamps so ranking stays stable within a session. */
export const RECOMMENDATION_TIME_BUCKET_MS = 15 * 60 * 1000;

export function recommendationTimeBucket(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / RECOMMENDATION_TIME_BUCKET_MS) * RECOMMENDATION_TIME_BUCKET_MS;
}

export const DIVERSITY_MAX_STREAK = 2;
export const FEED_EXPLORE_EVERY = 4;
export const REASON_MIN_SCORE = 18;
export const BEHAVIOR_SIGNAL_WEIGHTS = {
  check_in: 1,
  rsvp_going: 0.7,
  rsvp_interested: 0.4,
  org_member: 0.85,
  org_follower: 0.5,
  quest_complete: 0.45,
} as const;
