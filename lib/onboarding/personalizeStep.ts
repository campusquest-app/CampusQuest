/**
 * Canonical personalize-step validation for demographic onboarding.
 * Display count, Continue enablement, click-handler checks, and submit payload
 * must all derive from the same interest ID array.
 */

import {
  MIN_INTERESTS,
  isKnownStudentStatus,
  shouldAskGraduationYear,
  type InterestId,
  type StudentStatusId,
} from "@/lib/onboarding/taxonomy";
import type { DemographicOnboardingStep } from "@/lib/onboarding/flow";

export type PersonalizeContinueBlockReason = "missing_status" | "needs_interests";

export function interestSelectionCount(interests: readonly string[]): number {
  return interests.length;
}

export function isInterestMinimumMet(
  interests: readonly string[],
  min: number = MIN_INTERESTS,
): boolean {
  return interests.length >= min;
}

export function personalizeInterestCounterLabel(
  interests: readonly string[],
  min: number = MIN_INTERESTS,
): string {
  const count = interestSelectionCount(interests);
  return count < min ? `${count} of ${min} selected` : `${count} selected`;
}

export function personalizeContinueBlockReason(args: {
  studentStatus: string | null | undefined;
  interests: readonly string[];
  minInterests?: number;
}): PersonalizeContinueBlockReason | null {
  if (!isKnownStudentStatus(args.studentStatus)) return "missing_status";
  if (!isInterestMinimumMet(args.interests, args.minInterests ?? MIN_INTERESTS)) {
    return "needs_interests";
  }
  return null;
}

export function personalizeContinueErrorMessage(
  reason: PersonalizeContinueBlockReason,
  min: number = MIN_INTERESTS,
): string {
  if (reason === "missing_status") {
    return "Tell us about yourself before continuing.";
  }
  return `Pick at least ${min} interests to continue.`;
}

/** Mutate interest selection immutably; caps at maxSelections. */
export function toggleInterestId(
  prev: readonly InterestId[],
  id: InterestId,
  maxSelections = 15,
): InterestId[] {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  if (prev.length >= maxSelections) return [...prev];
  return [...prev, id];
}

/**
 * After URI email is verified on the campus step, decide the next screen.
 * Email-first new signups must still collect About You before interests.
 * Email-only remainder (demographics already complete) goes to ready.
 */
export function stepAfterCampusVerification(args: {
  demographicsAlreadyComplete: boolean;
  studentStatus: string | null | undefined;
  graduationYear: number | null | undefined;
  graduateOther?: boolean;
  interests: readonly string[];
  minInterests?: number;
}): DemographicOnboardingStep {
  if (args.demographicsAlreadyComplete) return "ready";
  if (!isKnownStudentStatus(args.studentStatus)) return "about_you";
  if (
    shouldAskGraduationYear(args.studentStatus) &&
    args.graduationYear == null &&
    !args.graduateOther
  ) {
    return "about_you";
  }
  if (!isInterestMinimumMet(args.interests, args.minInterests ?? MIN_INTERESTS)) {
    return "personalize";
  }
  return "ready";
}

export function isAboutYouReady(args: {
  studentStatus: StudentStatusId | null | undefined;
  graduationYear: number | null | undefined;
  graduateOther?: boolean;
}): boolean {
  if (!isKnownStudentStatus(args.studentStatus)) return false;
  if (!shouldAskGraduationYear(args.studentStatus)) return true;
  return args.graduateOther === true || args.graduationYear != null;
}
