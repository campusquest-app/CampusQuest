/**
 * Demographic onboarding policy (v2).
 * Separate from beginner-chain / tutorial overlays in onboardingTutorialGating.ts.
 */

import { isCampusEmailVerificationRequired } from "@/lib/campusEmailVerification";
import { MIN_INTERESTS, ONBOARDING_VERSION, isKnownStudentStatus } from "@/lib/onboarding/taxonomy";

/** Product switch: demographic screens are a real authenticated routing gate. */
export const DEMOGRAPHIC_ONBOARDING_ENABLED = true;

export type DemographicProfileSnapshot = {
  student_status?: string | null;
  institution_id?: string | null;
  class_year?: number | null;
  onboarding_version?: number | null;
  onboarding_completed?: boolean | null;
  onboarding_character_completed?: boolean | null;
  campus_email_verified_at?: string | null;
  created_at?: string | null;
};

export type DemographicPreferencesSnapshot = {
  exists?: boolean;
  interests?: string[] | null;
  communities?: string[] | null;
  institutionId?: string | null;
  completedAt?: string | null;
};

export type DemographicCompletionInput = {
  profile: DemographicProfileSnapshot;
  preferences?: DemographicPreferencesSnapshot | null;
};

/**
 * Completion criteria (communities optional / may be empty):
 * - student_status
 * - institution_id (profile or prefs)
 * - ≥3 interests
 * - class_year optional (Other / non-year paths allowed)
 */
export function isDemographicsComplete(input: DemographicCompletionInput): boolean {
  const status = input.profile.student_status?.trim() ?? "";
  if (!isKnownStudentStatus(status)) return false;

  const institution =
    input.profile.institution_id?.trim() ||
    input.preferences?.institutionId?.trim() ||
    "";
  if (!institution) return false;

  const interests = Array.isArray(input.preferences?.interests) ? input.preferences!.interests! : [];
  if (interests.filter((id) => typeof id === "string" && id.trim().length > 0).length < MIN_INTERESTS) {
    return false;
  }

  return true;
}

/** Pre-v2 users who already finished character/app setup are not mass-forced into demographics. */
export function isDemographicsGrandfathered(profile: DemographicProfileSnapshot): boolean {
  const setupDone =
    profile.onboarding_character_completed === true || profile.onboarding_completed === true;
  if (!setupDone) return false;
  const version = profile.onboarding_version;
  if (version != null && Number(version) >= ONBOARDING_VERSION) return false;
  return true;
}

export function isDemographicsRequired(args: {
  profile: DemographicProfileSnapshot;
  preferences?: DemographicPreferencesSnapshot | null;
  /** Session QA overlay — forces the gate without mutating DB rows. */
  forceQaReplay?: boolean;
}): boolean {
  if (!DEMOGRAPHIC_ONBOARDING_ENABLED) return false;
  if (args.forceQaReplay) return true;
  if (isDemographicsComplete({ profile: args.profile, preferences: args.preferences })) {
    return false;
  }
  if (isDemographicsGrandfathered(args.profile)) return false;
  return true;
}

/**
 * True only when demographic requirements are already satisfied and URI email
 * is the remaining onboarding step. Never true during QA full replay, and
 * never true merely because email is unverified.
 */
export function shouldStartOnboardingAtEmailVerification(args: {
  profile: DemographicProfileSnapshot;
  preferences?: DemographicPreferencesSnapshot | null;
  forceQaReplay?: boolean;
}): boolean {
  if (args.forceQaReplay) return false;
  if (
    isDemographicsRequired({
      profile: args.profile,
      preferences: args.preferences,
      forceQaReplay: false,
    })
  ) {
    return false;
  }
  return isCampusEmailVerificationRequired(args.profile);
}
