/**
 * Single source of truth for CampusQuest account types.
 * Client-safe (no server imports); server permission ranking lives in
 * lib/server/permissions.ts and builds on these definitions.
 */

export type UserRole = "student" | "faculty_staff" | "admin" | "super_admin" | "qa" | "beta_internal";

export const USER_ROLES: readonly UserRole[] = [
  "student",
  "faculty_staff",
  "admin",
  "super_admin",
  "qa",
  "beta_internal",
] as const;

/** Roles a normal user may pick for themselves (sign-up + settings). */
export const SELECTABLE_ROLES = ["student", "faculty_staff"] as const;
export type SelectableRole = (typeof SELECTABLE_ROLES)[number];

export function isKnownRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function isSelectableRole(value: unknown): value is SelectableRole {
  return value === "student" || value === "faculty_staff";
}

type RoleHolder = { role?: string | null } | string | null | undefined;

function roleOf(user: RoleHolder): string | null {
  if (user == null) return null;
  if (typeof user === "string") return user;
  return user.role ?? null;
}

export function hasRole(user: RoleHolder, role: UserRole): boolean {
  return roleOf(user) === role;
}

export function isStudent(user: RoleHolder): boolean {
  return roleOf(user) === "student";
}

export function isFacultyStaff(user: RoleHolder): boolean {
  return roleOf(user) === "faculty_staff";
}

export function isAdmin(user: RoleHolder): boolean {
  const role = roleOf(user);
  return role === "admin" || role === "super_admin";
}

export function isQAUser(
  user: { role?: string | null; is_test_user?: boolean | null } | string | null | undefined,
): boolean {
  if (user != null && typeof user === "object" && user.is_test_user === true) return true;
  return roleOf(user) === "qa";
}

export function canAccessAdmin(user: RoleHolder): boolean {
  return isAdmin(user);
}

/**
 * Eligibility for faculty/staff event & opportunity tools. This does NOT
 * remove any existing student capability — it only gates future
 * faculty/staff-specific creation surfaces.
 */
export function canCreateEvent(user: RoleHolder): boolean {
  return isFacultyStaff(user) || isAdmin(user);
}

/** Friendly display labels (Settings, admin tools). */
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "student":
      return "Student";
    case "faculty_staff":
      return "Faculty / Staff";
    case "admin":
    case "super_admin":
      return "Administrator";
    case "qa":
      return "QA Test Account";
    case "beta_internal":
      return "Internal Tester";
    default:
      return "Not set";
  }
}

/**
 * True when the profile has a valid, explicitly chosen account type.
 * - admin / super_admin count as chosen (admins never see the prompt).
 * - QA/test accounts use qa_selected_role so they can re-test the screen;
 *   their protected role stays 'qa'.
 * - NULL, empty, or unknown legacy values require the one-time selection.
 */
export function hasValidRoleSelection(profile: {
  role?: string | null;
  is_test_user?: boolean | null;
  qa_selected_role?: string | null;
}): boolean {
  const role = profile.role ?? null;
  if (role === "admin" || role === "super_admin" || role === "beta_internal") return true;
  if (profile.is_test_user === true || role === "qa") {
    return isSelectableRole(profile.qa_selected_role);
  }
  return isSelectableRole(role);
}
