/**
 * Campus role is derived from the canonical onboarding field `studentStatus`.
 * About You is the only collector. Later screens read this mapping and must
 * never ask Student / Faculty / Staff again.
 */

import { isKnownStudentStatus, STUDENT_STATUS } from "@/lib/onboarding/taxonomy";

/** About You is the sole onboarding screen that collects campus status. */
export const STUDENT_STATUS_COLLECTION_STEP = "about_you" as const;

export function selectableRoleFromStudentStatus(
  status?: string | null,
): "student" | "faculty_staff" | null {
  if (!isKnownStudentStatus(status)) return null;
  if (status === STUDENT_STATUS.faculty_staff || status === STUDENT_STATUS.not_student) {
    return "faculty_staff";
  }
  return "student";
}

/** True when the user has not yet answered the canonical status question. */
export function isStudentStatusMissing(status?: string | null): boolean {
  return !isKnownStudentStatus(status);
}

/**
 * A "fresh unanswered" status question — not a later screen showing a
 * preselected value, and not RoleSelectionGate after About You already ran.
 */
export function isFreshStudentStatusQuestion(args: {
  step: string;
  studentStatus?: string | null;
}): boolean {
  return args.step === STUDENT_STATUS_COLLECTION_STEP && isStudentStatusMissing(args.studentStatus);
}

export function persistStudentStatusPatch(status: string): { studentStatus: typeof status } {
  return { studentStatus: status };
}
