import { BEHAVIOR_SIGNAL_WEIGHTS } from "@/lib/recommendations/weights";
import {
  recommendationProfileFromDiscovery,
  type StudentDiscoveryInput,
} from "@/lib/recommendations/discoveryProfile";
import type { UserRecommendationProfile } from "@/lib/recommendations/types";

export type BehaviorSignalKind = keyof typeof BEHAVIOR_SIGNAL_WEIGHTS;

export type RecommendationBehaviorSignal = {
  kind: BehaviorSignalKind;
  topicIds: string[];
};

export function emptyRecommendationProfile(
  overrides?: Partial<UserRecommendationProfile>,
): UserRecommendationProfile {
  return {
    campusId: overrides?.campusId ?? null,
    studentStatus: overrides?.studentStatus ?? null,
    classYear: overrides?.classYear ?? null,
    major: overrides?.major ?? null,
    academicArea: overrides?.academicArea ?? null,
    verifiedSchoolEmail: overrides?.verifiedSchoolEmail === true,
    explicitInterests: [...(overrides?.explicitInterests ?? [])],
    explicitCommunities: [...(overrides?.explicitCommunities ?? [])],
    inferredAffinities: { ...(overrides?.inferredAffinities ?? {}) },
    followedOrganizationIds: [...(overrides?.followedOrganizationIds ?? [])],
    followedOrganizationNames: [...(overrides?.followedOrganizationNames ?? [])],
    includeDebug: overrides?.includeDebug === true,
  };
}

/**
 * Build inferred topic affinities from behavior.
 * Does not mutate or replace explicit onboarding selections.
 */
export function inferAffinitiesFromSignals(
  signals: RecommendationBehaviorSignal[],
): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const signal of signals) {
    const weight = BEHAVIOR_SIGNAL_WEIGHTS[signal.kind];
    for (const topic of signal.topicIds) {
      if (!topic) continue;
      raw[topic] = (raw[topic] ?? 0) + weight;
    }
  }
  const max = Math.max(0, ...Object.values(raw));
  if (max <= 0) return {};
  const normalized: Record<string, number> = {};
  for (const [topic, value] of Object.entries(raw)) {
    normalized[topic] = Math.min(1, value / max);
  }
  return normalized;
}

export function profileFromPersonalization(
  input?: (StudentDiscoveryInput & { includeDebug?: boolean }) | null,
): UserRecommendationProfile {
  return recommendationProfileFromDiscovery(input, { includeDebug: input?.includeDebug === true });
}

export function mergeRecommendationProfiles(
  base: UserRecommendationProfile,
  overlay: Partial<UserRecommendationProfile> | null | undefined,
): UserRecommendationProfile {
  if (!overlay) return base;
  return {
    campusId: overlay.campusId ?? base.campusId,
    studentStatus: overlay.studentStatus ?? base.studentStatus,
    classYear: overlay.classYear ?? base.classYear,
    major: overlay.major ?? base.major,
    academicArea: overlay.academicArea ?? base.academicArea,
    verifiedSchoolEmail: overlay.verifiedSchoolEmail ?? base.verifiedSchoolEmail,
    explicitInterests: overlay.explicitInterests ?? base.explicitInterests,
    explicitCommunities: overlay.explicitCommunities ?? base.explicitCommunities,
    inferredAffinities: overlay.inferredAffinities ?? base.inferredAffinities,
    followedOrganizationIds: overlay.followedOrganizationIds ?? base.followedOrganizationIds,
    followedOrganizationNames: overlay.followedOrganizationNames ?? base.followedOrganizationNames,
    includeDebug: overlay.includeDebug ?? base.includeDebug,
  };
}
