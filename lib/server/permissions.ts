import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import { isAdminEmail, userHasModerationAdminAccess } from "@/lib/server/adminEmails";

export type ProfileRole = "student" | "admin" | "super_admin";

const ROLE_RANK: Record<ProfileRole, number> = {
  student: 0,
  admin: 1,
  super_admin: 2,
};

export function normalizeProfileRole(raw: string | null | undefined): ProfileRole {
  if (raw === "admin" || raw === "super_admin") return raw;
  return "student";
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
      if (options?.email && isAdminEmail(options.email)) return "super_admin";
      return "student";
    }
    throw new ApiError(400, error.message, "PROFILE_ROLE_FETCH_FAILED");
  }

  const role = normalizeProfileRole((data as ProfileRoleRow | null)?.role);
  if (role === "student" && options?.email && isAdminEmail(options.email)) {
    return "super_admin";
  }
  return role;
}

/** Platform admin: DB role or legacy moderation email allow-list. */
export function userHasPlatformAdminAccess(user: User, profileRole: ProfileRole): boolean {
  if (roleAtLeast(profileRole, "admin")) return true;
  return userHasModerationAdminAccess(user);
}

export function canManageQrCodes(profileRole: ProfileRole, user: User): boolean {
  return roleAtLeast(profileRole, "admin") || userHasModerationAdminAccess(user);
}

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
