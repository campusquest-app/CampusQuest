import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import { isAdminEmailFallback } from "@/lib/platformAdmin";
import { isAdminEmail, isAuthEmailConfirmed, userHasModerationAdminAccess } from "@/lib/server/adminEmails";

export type ProfileRole = "student" | "faculty_staff" | "qa" | "beta_internal" | "admin" | "super_admin";

const ROLE_RANK: Record<ProfileRole, number> = {
  student: 0,
  faculty_staff: 0,
  qa: 0,
  beta_internal: 0,
  admin: 1,
  super_admin: 2,
};

export function normalizeProfileRole(raw: string | null | undefined): ProfileRole {
  if (
    raw === "admin" ||
    raw === "super_admin" ||
    raw === "qa" ||
    raw === "beta_internal" ||
    raw === "faculty_staff"
  ) {
    return raw;
  }
  return "student";
}

/** Internal testing roles: full campus access, no admin privileges. */
export function isInternalTesterRole(role: ProfileRole): boolean {
  return role === "qa" || role === "beta_internal";
}

export function roleAtLeast(role: ProfileRole, minimum: ProfileRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

function isMissingProfileRoleColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column profiles\.role does not exist/i.test(error.message ?? "");
}

type ProfileRoleRow = { role?: string | null };

function emailImpliesAdminRole(email?: string | null): boolean {
  if (!email) return false;
  return isAdminEmail(email) || isAdminEmailFallback(email);
}

/**
 * Reads profiles.role with safe fallbacks:
 * - null/unknown role → student
 * - missing column (pre-migration) → student, or super_admin for moderation allow-list email
 */
export async function fetchProfileRole(
  userClient: SupabaseClient,
  userId: string,
  options?: { email?: string | null },
): Promise<ProfileRole> {
  const { data, error } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingProfileRoleColumn(error)) {
      if (options?.email && emailImpliesAdminRole(options.email)) return "super_admin";
      return "student";
    }
    throw new ApiError(400, error.message, "PROFILE_ROLE_FETCH_FAILED");
  }

  const role = normalizeProfileRole((data as ProfileRoleRow | null)?.role);
  if (role === "student" && options?.email && emailImpliesAdminRole(options.email)) {
    return "super_admin";
  }
  return role;
}

export type ProfileAccessFlags = {
  role: ProfileRole;
  /** profiles.is_internal_tester = true, or an internal testing role (qa / beta_internal). */
  isInternalTester: boolean;
};

/**
 * Reads profiles.role + profiles.is_internal_tester in one query.
 * Tolerates pre-migration schemas (missing columns → student / false).
 */
export async function fetchProfileAccessFlags(
  userClient: SupabaseClient,
  userId: string,
  options?: { email?: string | null },
): Promise<ProfileAccessFlags> {
  const { data, error } = await userClient
    .from("profiles")
    .select("role, is_internal_tester")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Missing is_internal_tester column (pre-migration): fall back to role-only fetch.
    if (error.code === "42703" || /column .* does not exist/i.test(error.message ?? "")) {
      const role = await fetchProfileRole(userClient, userId, options);
      return { role, isInternalTester: isInternalTesterRole(role) };
    }
    throw new ApiError(400, error.message, "PROFILE_ROLE_FETCH_FAILED");
  }

  const row = data as { role?: string | null; is_internal_tester?: boolean | null } | null;
  let role = normalizeProfileRole(row?.role);
  if (role === "student" && options?.email && emailImpliesAdminRole(options.email)) {
    role = "super_admin";
  }
  return {
    role,
    isInternalTester: row?.is_internal_tester === true || isInternalTesterRole(role),
  };
}

/** Platform admin: DB role, moderation allow-list, or dev email fallback (confirmed email required for email paths). */
export function userHasPlatformAdminAccess(user: User, profileRole: ProfileRole): boolean {
  if (roleAtLeast(profileRole, "admin")) return true;
  if (!isAuthEmailConfirmed(user)) return false;
  if (userHasModerationAdminAccess(user)) return true;
  return isAdminEmailFallback(user.email);
}

/** Alias for campus-access and feature gates. */
export function isPlatformAdmin(user: User, profileRole: ProfileRole): boolean {
  return userHasPlatformAdminAccess(user, profileRole);
}

export function canManageQrCodes(profileRole: ProfileRole, user: User): boolean {
  return roleAtLeast(profileRole, "admin") || userHasModerationAdminAccess(user);
}

/** Admins may scan any active/inactive QR unlimited times for testing (no cooldown/daily cap). */
export function canBypassQrScanLimits(profileRole: ProfileRole): boolean {
  return roleAtLeast(profileRole, "admin");
}

export function canViewAllQrScans(profileRole: ProfileRole, user: User): boolean {
  return canManageQrCodes(profileRole, user);
}

/** Legacy email allow-list without confirmed role row — treat as admin for QR tooling only. */
export function isLegacyModerationAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return isAdminEmail(email);
}
