/**
 * Shared first-time demographic onboarding order.
 * Character/avatar remains CharacterGate after this flow.
 */

import { shouldAskGraduationYear } from "@/lib/onboarding/taxonomy";

export type DemographicOnboardingStep =
  | "welcome"
  | "student_status"
  | "school"
  | "email_verification"
  | "graduation_year"
  | "interests"
  | "communities";

export const DEMOGRAPHIC_ONBOARDING_STEPS: DemographicOnboardingStep[] = [
  "welcome",
  "student_status",
  "school",
  "email_verification",
  "graduation_year",
  "interests",
  "communities",
];

export function isDemographicOnboardingStep(value: unknown): value is DemographicOnboardingStep {
  return (
    typeof value === "string" &&
    (DEMOGRAPHIC_ONBOARDING_STEPS as readonly string[]).includes(value)
  );
}

export function demographicStepsForUser(args: {
  studentStatus?: string | null;
  includeWelcome?: boolean;
  emailOnly?: boolean;
}): DemographicOnboardingStep[] {
  if (args.emailOnly) return ["email_verification"];
  const steps: DemographicOnboardingStep[] = [];
  if (args.includeWelcome) steps.push("welcome");
  steps.push("student_status", "school", "email_verification");
  if (shouldAskGraduationYear(args.studentStatus)) steps.push("graduation_year");
  steps.push("interests", "communities");
  return steps;
}

export function nextDemographicStep(args: {
  current: DemographicOnboardingStep;
  studentStatus?: string | null;
  includeWelcome?: boolean;
  emailOnly?: boolean;
}): DemographicOnboardingStep | null {
  const steps = demographicStepsForUser(args);
  const idx = steps.indexOf(args.current);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1] ?? null;
}

export function previousDemographicStep(args: {
  current: DemographicOnboardingStep;
  studentStatus?: string | null;
  includeWelcome?: boolean;
  emailOnly?: boolean;
}): DemographicOnboardingStep | null {
  const steps = demographicStepsForUser(args);
  const idx = steps.indexOf(args.current);
  if (idx <= 0) return null;
  return steps[idx - 1] ?? null;
}

export function demographicProgress(args: {
  current: DemographicOnboardingStep;
  studentStatus?: string | null;
  includeWelcome?: boolean;
  emailOnly?: boolean;
}): { current: number; total: number; label: string } | null {
  if (args.current === "welcome") return null;
  const steps = demographicStepsForUser({
    studentStatus: args.studentStatus,
    includeWelcome: false,
    emailOnly: args.emailOnly,
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
