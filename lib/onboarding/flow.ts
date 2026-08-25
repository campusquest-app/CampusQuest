/**
 * Shared first-time demographic onboarding order.
 * Character/avatar remains CharacterGate after this flow.
 */

import { isCampusEmailVerified } from "@/lib/campusEmailVerification";
import {
  MIN_INTERESTS,
  isKnownStudentStatus,
  shouldAskGraduationYear,
} from "@/lib/onboarding/taxonomy";

export type DemographicOnboardingStep =
  | "welcome"
  | "student_status"
  | "graduation_year"
  | "school"
  | "interests"
  | "communities"
  | "email_verification"
  | "success";

export const DEMOGRAPHIC_ONBOARDING_STEPS: DemographicOnboardingStep[] = [
  "welcome",
  "student_status",
  "graduation_year",
  "school",
  "interests",
  "communities",
  "email_verification",
  "success",
];

export type DemographicStepsArgs = {
  studentStatus?: string | null;
  includeWelcome?: boolean;
  includeSuccess?: boolean;
  /** Skip earlier screens when demographics are already complete and only URI email is left. */
  emailOnly?: boolean;
};

export function isDemographicOnboardingStep(value: unknown): value is DemographicOnboardingStep {
  return (
    typeof value === "string" &&
    (DEMOGRAPHIC_ONBOARDING_STEPS as readonly string[]).includes(value)
  );
}

export function demographicStepsForUser(args: DemographicStepsArgs): DemographicOnboardingStep[] {
  if (args.emailOnly) {
    const steps: DemographicOnboardingStep[] = ["email_verification"];
    if (args.includeSuccess !== false) steps.push("success");
    return steps;
  }
  const steps: DemographicOnboardingStep[] = [];
  if (args.includeWelcome) steps.push("welcome");
  steps.push("student_status");
  if (shouldAskGraduationYear(args.studentStatus)) steps.push("graduation_year");
  steps.push("school", "interests", "communities", "email_verification");
  if (args.includeSuccess !== false) steps.push("success");
  return steps;
}

export function nextDemographicStep(
  args: DemographicStepsArgs & { current: DemographicOnboardingStep },
): DemographicOnboardingStep | null {
  const steps = demographicStepsForUser(args);
  const idx = steps.indexOf(args.current);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1] ?? null;
}

export function previousDemographicStep(
  args: DemographicStepsArgs & { current: DemographicOnboardingStep },
): DemographicOnboardingStep | null {
  const steps = demographicStepsForUser(args);
  const idx = steps.indexOf(args.current);
  if (idx <= 0) return null;
  return steps[idx - 1] ?? null;
}

/**
 * Progress uses the full demographic sequence even when the user resumed on
 * email verification. Welcome and success are not counted.
 */
export function demographicProgress(args: DemographicStepsArgs & { current: DemographicOnboardingStep }): {
  current: number;
  total: number;
  label: string;
} | null {
  if (args.current === "welcome" || args.current === "success") return null;
  const steps = demographicStepsForUser({
    studentStatus: args.studentStatus,
    includeWelcome: false,
    includeSuccess: false,
    emailOnly: false,
  });
  const idx = steps.indexOf(args.current);
  if (idx < 0) return null;
  const current = idx + 1;
  const total = steps.length;
  return {
    current,
    total,
    label: `Getting started · ${current} of ${total}`,
  };
}

export type DemographicResumeDraft = {
  step?: unknown;
  studentStatus?: string | null;
  graduationYear?: number | null;
  graduateOther?: boolean;
  interests?: string[] | null;
  communities?: string[] | null;
};

export type DemographicResumeProfile = {
  student_status?: string | null;
  institution_id?: string | null;
  class_year?: number | null;
  campus_email_verified_at?: string | null;
};

export type DemographicResumePreferences = {
  exists?: boolean;
  interests?: string[] | null;
  communities?: string[] | null;
  institutionId?: string | null;
};

function nonEmptyStrings(values?: string[] | null): string[] {
  return Array.isArray(values)
    ? values.filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];
}

function stepIndex(step: DemographicOnboardingStep | null, steps: DemographicOnboardingStep[]): number {
  if (!step) return -1;
  return steps.indexOf(step);
}

/**
 * Authoritative resume: evaluate required onboarding fields in order.
 * Unverified email is never treated as the current step until earlier
 * requirements are complete (unless this is a true email-only remainder).
 */
export function resolveDemographicResumeStep(input: {
  profile?: DemographicResumeProfile | null;
  preferences?: DemographicResumePreferences | null;
  draft?: DemographicResumeDraft | null;
  startAtEmailVerification?: boolean;
  forceFullReplay?: boolean;
}): DemographicOnboardingStep {
  const draftStep = isDemographicOnboardingStep(input.draft?.step) ? input.draft.step : null;

  if (input.forceFullReplay) {
    return draftStep && draftStep !== "welcome" ? draftStep : "welcome";
  }

  if (input.startAtEmailVerification) {
    return isCampusEmailVerified(input.profile ?? {}) ? "success" : "email_verification";
  }

  const studentStatus = input.draft?.studentStatus ?? input.profile?.student_status ?? null;
  const institution =
    input.profile?.institution_id?.trim() || input.preferences?.institutionId?.trim() || "";
  const classYear =
    input.draft?.graduationYear !== undefined && input.draft?.graduationYear !== null
      ? input.draft.graduationYear
      : (input.profile?.class_year ?? null);
  const graduateOther = input.draft?.graduateOther === true;
  const draftInterests = nonEmptyStrings(input.draft?.interests);
  const prefInterests = nonEmptyStrings(input.preferences?.interests);
  const interests = draftInterests.length > 0 ? draftInterests : prefInterests;
  const prefsExist = input.preferences?.exists === true;
  const emailVerified = isCampusEmailVerified(input.profile ?? {});

  const steps = demographicStepsForUser({
    studentStatus,
    includeWelcome: true,
    includeSuccess: true,
    emailOnly: false,
  });
  const draftIdx = stepIndex(draftStep, steps);

  if (!isKnownStudentStatus(studentStatus)) {
    return draftStep === "student_status" ? "student_status" : "welcome";
  }

  if (shouldAskGraduationYear(studentStatus)) {
    const passedSchool = Boolean(institution) || draftIdx >= stepIndex("school", steps);
    const graduationAnswered = classYear != null || graduateOther || passedSchool;
    if (!graduationAnswered) return "graduation_year";
  }

  const passedSchool = Boolean(institution) || draftIdx >= stepIndex("interests", steps);
  if (!passedSchool) return "school";

  if (interests.length < MIN_INTERESTS) return "interests";
  if (draftStep === "interests") return "interests";

  const passedCommunities = prefsExist || draftIdx >= stepIndex("email_verification", steps);
  if (!passedCommunities) return "communities";

  if (!emailVerified) return "email_verification";
  return "success";
}
