/**
 * Unified Student Discovery Profile — one interpretation of onboarding data
 * for Realm, Events, For You, Quad, Organizations, Market, and Quests.
 */

import {
  communityIdsFromAcademicArea,
  normalizeAcademicAreaId,
  type AcademicAreaId,
} from "@/lib/onboarding/academicAreas";
import { normalizeCommunityIds, normalizeInterestIds } from "@/lib/onboarding/taxonomy";
import type { UserRecommendationProfile } from "@/lib/recommendations/types";

export type StudentDiscoveryInput = {
  campusId?: string | null;
  schoolName?: string | null;
  institutionId?: string | null;
  studentStatus?: string | null;
  classYear?: number | null;
  graduationYear?: number | null;
  major?: string | null;
  academicArea?: string | null;
  interests?: string[] | null;
  communities?: string[] | null;
  campusEmailVerifiedAt?: string | null;
  campusEmailVerified?: boolean | null;
  onboardingCompleted?: boolean | null;
  onboardingCharacterCompleted?: boolean | null;
  realmIntroCompletedAt?: string | null;
};

export type StudentDiscoveryProfile = {
  campusId: string | null;
  studentStatus: string | null;
  graduationYear: number | null;
  major: string | null;
  academicArea: AcademicAreaId | null;
  interests: string[];
  campusConnections: string[];
  verifiedSchoolEmail: boolean;
  onboardingComplete: boolean;
  realmIntroCompleted: boolean;
};

function resolveCampusId(input?: StudentDiscoveryInput | null): string | null {
  const fromId = input?.institutionId?.trim() || input?.campusId?.trim() || "";
  if (fromId) return fromId;
  return input?.schoolName?.toLowerCase().includes("rhode island") ? "uri" : null;
}

function uniqueIds(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildStudentDiscoveryProfile(
  input?: StudentDiscoveryInput | null,
): StudentDiscoveryProfile {
  const academicArea = normalizeAcademicAreaId(input?.academicArea ?? null);
  const interests = normalizeInterestIds(input?.interests ?? []);
  const campusConnections = normalizeCommunityIds(input?.communities ?? []);
  const graduationYear =
    typeof input?.graduationYear === "number"
      ? input.graduationYear
      : typeof input?.classYear === "number"
        ? input.classYear
        : null;
  const major = typeof input?.major === "string" && input.major.trim() ? input.major.trim() : null;
  return {
    campusId: resolveCampusId(input),
    studentStatus: input?.studentStatus?.trim() || null,
    graduationYear,
    major,
    academicArea,
    interests,
    campusConnections,
    verifiedSchoolEmail:
      input?.campusEmailVerified === true || Boolean(input?.campusEmailVerifiedAt),
    onboardingComplete:
      input?.onboardingCompleted === true || input?.onboardingCharacterCompleted === true,
    realmIntroCompleted: Boolean(input?.realmIntroCompletedAt),
  };
}

/**
 * Recommendation overlay: academic area can hint related campus connections
 * without writing a conflicting stored community value.
 */
export function recommendationCommunitiesFromDiscovery(profile: StudentDiscoveryProfile): string[] {
  return uniqueIds([
    ...profile.campusConnections,
    ...communityIdsFromAcademicArea(profile.academicArea),
  ]);
}

export function recommendationProfileFromDiscovery(
  input?: StudentDiscoveryInput | null,
  extras?: Partial<UserRecommendationProfile>,
): UserRecommendationProfile {
  const discovery = buildStudentDiscoveryProfile(input);
  return {
    campusId: extras?.campusId ?? discovery.campusId,
    studentStatus: extras?.studentStatus ?? discovery.studentStatus,
    classYear: extras?.classYear ?? discovery.graduationYear,
    major: extras?.major ?? discovery.major,
    academicArea: extras?.academicArea ?? discovery.academicArea,
    verifiedSchoolEmail: extras?.verifiedSchoolEmail ?? discovery.verifiedSchoolEmail,
    explicitInterests: extras?.explicitInterests ?? discovery.interests,
    explicitCommunities: extras?.explicitCommunities ?? recommendationCommunitiesFromDiscovery(discovery),
    inferredAffinities: extras?.inferredAffinities ?? {},
    followedOrganizationIds: extras?.followedOrganizationIds ?? [],
    followedOrganizationNames: extras?.followedOrganizationNames ?? [],
    includeDebug: extras?.includeDebug === true,
  };
}
