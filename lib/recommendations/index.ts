export type { RecommendationEntity, RecommendationScore, UserRecommendationProfile } from "@/lib/recommendations/types";
export {
  RECOMMENDATION_WEIGHTS,
  recommendationTimeBucket,
} from "@/lib/recommendations/weights";
export { matchRecommendationTopics } from "@/lib/recommendations/match";
export { isCampusWideImportant } from "@/lib/recommendations/campusImportance";
export { scoreRecommendationEntity } from "@/lib/recommendations/score";
export { rankRecommendationEntities } from "@/lib/recommendations/rank";
export {
  emptyRecommendationProfile,
  inferAffinitiesFromSignals,
  mergeRecommendationProfiles,
  profileFromPersonalization,
} from "@/lib/recommendations/profile";
export {
  campusEventToRecommendationEntity,
  externalEventToRecommendationEntity,
  fieldNoteToRecommendationEntity,
  locationToRecommendationEntity,
  mapEventPinToRecommendationEntity,
  organizationToRecommendationEntity,
  questToRecommendationEntity,
} from "@/lib/recommendations/adapters";
export { publicPopularityCount, shouldExposeRecommendationDebug, formatRecommendationDebugLine } from "@/lib/recommendations/debug";
