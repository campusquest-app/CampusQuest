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

/**
 * Required onboarding screens. Graduation year lives on About You.
 * School and URI email live on Campus. Interests and communities live on Personalize.
 * Legacy step ids from in-progress drafts are canonicalized below.
 */
export type DemographicOnboardingStep = "welcome" | "about_you" | "campus" | "personalize" | "ready";

export const DEMOGRAPHIC_ONBOARDING_STEPS: DemographicOnboardingStep[] = [
  "welcome",
  "about_you",
  "campus",
  "personalize",
  "ready",
];

const REQUIRED_ONBOARDING_STEPS: DemographicOnboardingStep[] = [
  "about_you",
  "campus",
  "personalize",
  "ready",
];

const LEGACY_STEP_TO_CURRENT: Record<string, DemographicOnboardingStep> = {
  welcome: "welcome",
  student_status: "about_you",
  graduation_year: "about_you",
  about_you: "about_you",
  school: "campus",
  email_verification: "campus",
  campus: "campus",
  interests: "personalize",
  communities: "personalize",
  personalize: "personalize",
  success: "ready",
  ready: "ready",
};

export function canonicalizeDemographicStep(value: unknown): DemographicOnboardingStep | null {
  if (typeof value !== "string") return null;
  return LEGACY_STEP_TO_CURRENT[value] ?? null;
}

export type DemographicStepsArgs = {
  studentStatus?: string | null;
  includeWelcome?: boolean;
  includeSuccess?: boolean;
  /** Skip earlier screens when demographics are already complete and only URI email is left. */
  emailOnly?: boolean;
};

export function isDemographicOnboardingStep(value: unknown): value is DemographicOnboardingStep {
  return canonicalizeDemographicStep(value) === value && typeof value === "string";
}

export function demographicStepsForUser(args: DemographicStepsArgs): DemographicOnboardingStep[] {
  if (args.emailOnly) {
    const steps: DemographicOnboardingStep[] = ["campus"];
    if (args.includeSuccess !== false) steps.push("ready");
    return steps;
  }
  const steps: DemographicOnboardingStep[] = [];
  if (args.includeWelcome) steps.push("welcome");
  steps.push("about_you", "campus", "personalize");
  if (args.includeSuccess !== false) steps.push("ready");
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
 * Progress is the four required screens. Welcome is the logged-out marketing
 * screen and is not counted. Avatar setup is not part of this sequence.
 */
export function demographicProgress(args: DemographicStepsArgs & { current: DemographicOnboardingStep }): {
  current: number;
  total: number;
  label: string;
} | null {
  if (args.current === "welcome") return null;
  const idx = REQUIRED_ONBOARDING_STEPS.indexOf(args.current);
  if (idx < 0) return null;
  const current = idx + 1;
  const total = REQUIRED_ONBOARDING_STEPS.length;
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
  const draftStep = canonicalizeDemographicStep(input.draft?.step);

  if (input.forceFullReplay) {
    // Welcome is the logged-out marketing screen. A signed-in replay starts
    // at the first real step.
    return draftStep && draftStep !== "welcome" ? draftStep : "about_you";
  }

  if (input.startAtEmailVerification) {
    return isCampusEmailVerified(input.profile ?? {}) ? "ready" : "campus";
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
  const passedAbout = Boolean(institution) || draftIdx >= stepIndex("campus", steps);

  if (!isKnownStudentStatus(studentStatus)) {
    return "about_you";
  }

  if (shouldAskGraduationYear(studentStatus)) {
    const graduationAnswered = classYear != null || graduateOther || passedAbout;
    if (!graduationAnswered) return "about_you";
  }

  if (!institution || !emailVerified) return "campus";

  if (interests.length < MIN_INTERESTS) return "personalize";
  if (draftStep === "personalize") return "personalize";

  const passedReady = prefsExist || draftIdx >= stepIndex("ready", steps);
  if (!passedReady) return "personalize";

  return "ready";
}
