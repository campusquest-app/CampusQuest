import { selectableRoleFromStudentStatus } from "@/lib/onboarding/studentStatusRole";
import { isSelectableRole, type SelectableRole } from "@/lib/roles";

export type AccountTypeProfile = {
  role?: string | null;
  is_test_user?: boolean | null;
};

export type AccountTypeDecision =
  | { kind: "invalid_role" }
  | { kind: "admin_locked" }
  | {
      kind: "update";
      /** Column patch to apply with the service-role client. */
      patch: Record<string, unknown>;
      /** Role reported back to the client after the save. */
      effectiveRole: string;
      qaAccount: boolean;
    };

/**
 * Server-side account-type guard (pure — unit tested):
 * - only student / faculty_staff may be requested (admin/qa never selectable);
 * - admin / super_admin profiles are locked and can never be downgraded here;
 * - QA/test accounts keep their protected 'qa' role — the choice is stored in
 *   qa_selected_role so the onboarding screen stays repeatably testable.
 */
export function resolveAccountTypeUpdate(
  profile: AccountTypeProfile,
  requestedRole: unknown,
): AccountTypeDecision {
  if (!isSelectableRole(requestedRole)) return { kind: "invalid_role" };
  const requested: SelectableRole = requestedRole;

  const currentRole = profile.role ?? null;
  if (currentRole === "admin" || currentRole === "super_admin") {
    return { kind: "admin_locked" };
  }

  const qaAccount = profile.is_test_user === true || currentRole === "qa";
  return {
    kind: "update",
    patch: qaAccount ? { qa_selected_role: requested } : { role: requested },
    effectiveRole: qaAccount ? "qa" : requested,
    qaAccount,
  };
}

/**
 * Derive the profiles.role (or qa_selected_role) write from canonical
 * studentStatus. About You is the collector; this is not a second question.
 * Returns null when status is unknown or the account type is locked.
 */
export function rolePatchFromStudentStatus(
  profile: AccountTypeProfile,
  studentStatus?: string | null,
): Extract<AccountTypeDecision, { kind: "update" }> | null {
  const derived = selectableRoleFromStudentStatus(studentStatus);
  if (!derived) return null;
  const decision = resolveAccountTypeUpdate(profile, derived);
  if (decision.kind !== "update") return null;
  return decision;
}

/** Missing/legacy role only — never overwrite an explicit Settings choice. */
export function shouldHealRoleFromStudentStatus(profile: AccountTypeProfile & {
  qa_selected_role?: string | null;
}): boolean {
  const role = profile.role ?? null;
  if (role === "admin" || role === "super_admin" || role === "beta_internal") return false;
  if (profile.is_test_user === true || role === "qa") {
    return !isSelectableRole(profile.qa_selected_role);
  }
  return !isSelectableRole(role);
}
