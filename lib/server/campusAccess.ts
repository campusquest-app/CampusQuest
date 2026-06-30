import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  canAccessCampusFeatures,
  extractCampusEmailDomain,
  isEmailVerifiedForCampus,
  type CampusVerificationSnapshot,
} from "@/lib/campusAccess";
import { getPilotSchoolConfig } from "@/lib/server/pilotMode";
import { fetchProfileRole, isPlatformAdmin, normalizeProfileRole } from "@/lib/server/permissions";
import { createAdminClient } from "@/lib/server/supabase";

export { canAccessCampusFeatures, isEmailVerifiedForCampus } from "@/lib/campusAccess";

export function logCampusAccessServerDev(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[cq] school-verification", payload);
}

/** Platform admin: profiles.role admin+ with confirmed email, moderation allow-list, or dev fallback emails. */
export async function resolveIsPlatformAdmin(
  userClient: SupabaseClient,
  user: {
    id: string;
    email?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  },
): Promise<boolean> {
  const profileRole = await fetchProfileRole(userClient, user.id, { email: user.email });
  const isAdmin = isPlatformAdmin(user as User, profileRole);
  logCampusAccessServerDev({
    emailDomain: extractCampusEmailDomain(user.email),
    profileRole,
    isAdmin,
    isConfirmed: isEmailVerifiedForCampus(user),
  });
  return isAdmin;
}

export async function userIdHasPlatformAdminAccess(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  const user = data.user;
  if (!isEmailVerifiedForCampus(user)) return false;

  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  const profileRole = normalizeProfileRole((profile as { role?: string | null } | null)?.role);
  return isPlatformAdmin(user, profileRole);
}

export function canUserAccessCampusFeatures(args: {
  user: Pick<User, "email" | "email_confirmed_at"> & { confirmed_at?: string | null };
  isPlatformAdmin: boolean;
  verification?: CampusVerificationSnapshot | null;
  pilotDomain?: string | null;
}): boolean {
  const pilotDomain = args.pilotDomain ?? getPilotSchoolConfig().schoolDomain;
  return canAccessCampusFeatures({
    isPlatformAdmin: args.isPlatformAdmin,
    email: args.user.email,
    emailVerified: isEmailVerifiedForCampus(args.user),
    pilotDomain,
    verification: args.verification ?? null,
  });
}
