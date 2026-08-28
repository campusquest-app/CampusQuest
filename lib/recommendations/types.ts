/**
 * Shared CampusQuest recommendation types.
 * Safe for client + server. No private third-party data.
 */

export type RecommendationEntityKind = "event" | "post" | "location" | "quest" | "organization";

export type RecommendationReasonCode =
  | "interest"
  | "community"
  | "organization"
  | "campus_wide"
  | "popular"
  | "happening_now"
  | "recommended";

export type RecommendationReason = {
  code: RecommendationReasonCode;
  label: string;
};

export type RecommendationScoreBreakdown = {
  interestMatch: number;
  communityMatch: number;
  organizationMatch: number;
  inferredAffinity: number;
  timeRelevance: number;
  campusImportance: number;
  popularity: number;
  studentTypeRelevance: number;
  recency: number;
  engagement: number;
  campusMismatchPenalty: number;
  total: number;
};

export type RecommendationEntity = {
  id: string;
  kind: RecommendationEntityKind;
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  organizationId?: string | null;
  organizationName?: string | null;
  locationName?: string | null;
  campusId?: string | null;
  startsAtMs?: number | null;
  endsAtMs?: number | null;
  createdAtMs?: number | null;
  popularityCount?: number;
  engagementCount?: number;
  featured?: boolean;
  /** Major campus landmark or equivalent. */
  campusMajor?: boolean;
};

export type UserRecommendationProfile = {
  campusId: string | null;
  studentStatus: string | null;
  classYear: number | null;
  major: string | null;
  academicArea: string | null;
  verifiedSchoolEmail: boolean;
  explicitInterests: string[];
  explicitCommunities: string[];
  /** Topic id → 0–1 affinity learned from behavior. Never written over explicit prefs. */
  inferredAffinities: Record<string, number>;
  followedOrganizationIds: string[];
  followedOrganizationNames: string[];
  includeDebug: boolean;
};

export type RecommendationMatch = {
  interestIds: string[];
  communityIds: string[];
  primaryTopic: string | null;
  campusImportant: boolean;
  studentTypeHints: string[];
};

export type RecommendationScore = {
  entityId: string;
  score: number;
  matchedInterests: string[];
  matchedCommunities: string[];
  reason: RecommendationReason | null;
  debug?: RecommendationScoreBreakdown;
};

export type RankedRecommendation<T> = {
  item: T;
  entity: RecommendationEntity;
  recommendation: RecommendationScore;
};
