import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  canAccessCampusFeatures,
  extractCampusEmailDomain,
  isEmailVerifiedForCampus,
  type CampusVerificationSnapshot,
} from "@/lib/campusAccess";
import { isInternalAccount } from "@/lib/internalAccount";
import { getPilotSchoolConfig } from "@/lib/server/pilotMode";
import {
  fetchProfileAccessFlags,
  isInternalTesterRole,
  isPlatformAdmin,
  normalizeProfileRole,
} from "@/lib/server/permissions";
import { createAdminClient } from "@/lib/server/supabase";

export { canAccessCampusFeatures, isEmailVerifiedForCampus } from "@/lib/campusAccess";

export function logCampusAccessServerDev(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[cq] school-verification", payload);
}

type CampusAccessUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

export type CampusAccessIdentity = {
  isPlatformAdmin: boolean;
  /** qa / beta_internal role or profiles.is_internal_tester — full campus access, no admin rights. */
  isInternalTester: boolean;
};

/**
 * Resolves the trusted-account bypasses (platform admin + internal tester) in
 * a single profile read. Role/flag based only — never email-domain based.
 */
export async function resolveCampusAccessIdentity(
  userClient: SupabaseClient,
  user: CampusAccessUser,
): Promise<CampusAccessIdentity> {
  const flags = await fetchProfileAccessFlags(userClient, user.id, { email: user.email });
  const isAdmin = isPlatformAdmin(user as User, flags.role);
  // fetchProfileAccessFlags already applies isInternalAccount (email + flags).
  const isInternalTester = flags.isInternalTester;
  logCampusAccessServerDev({
    emailDomain: extractCampusEmailDomain(user.email),
    profileRole: flags.role,
    isAdmin,
    isInternalTester,
    isConfirmed: isEmailVerifiedForCampus(user),
  });
  return { isPlatformAdmin: isAdmin, isInternalTester };
}

/** Platform admin: profiles.role admin+ with confirmed email, moderation allow-list, or dev fallback emails. */
export async function resolveIsPlatformAdmin(
  userClient: SupabaseClient,
  user: CampusAccessUser,
): Promise<boolean> {
  const identity = await resolveCampusAccessIdentity(userClient, user);
  return identity.isPlatformAdmin;
}

export async function userIdHasPlatformAdminAccess(userId: string): Promise<boolean> {
  const identity = await userIdCampusAccessIdentity(userId);
  return identity.isPlatformAdmin;
}

/** Admin OR internal tester — the set of accounts that bypass campus scoping. */
export async function userIdHasCampusBypassAccess(userId: string): Promise<boolean> {
  const identity = await userIdCampusAccessIdentity(userId);
  return identity.isPlatformAdmin || identity.isInternalTester;
}

async function userIdCampusAccessIdentity(userId: string): Promise<CampusAccessIdentity> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return { isPlatformAdmin: false, isInternalTester: false };
  const user = data.user;

  let { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, is_internal_tester, is_test_user")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    // Pre-migration schema without is_internal_tester — retry with role only.
    ({ data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle());
  }
  const row = profile as { role?: string | null; is_internal_tester?: boolean | null; is_test_user?: boolean | null } | null;
  const profileRole = normalizeProfileRole(row?.role);
  const isInternalTester =
    isInternalAccount(
      { email: user.email },
      {
        role: profileRole,
        is_internal_tester: row?.is_internal_tester,
        is_test_user: row?.is_test_user,
      },
    ) ||
    row?.is_internal_tester === true ||
    isInternalTesterRole(profileRole);

  if (!isEmailVerifiedForCampus(user)) {
    return { isPlatformAdmin: false, isInternalTester };
  }
  return { isPlatformAdmin: isPlatformAdmin(user, profileRole), isInternalTester };
}

export function canUserAccessCampusFeatures(args: {
  user: Pick<User, "email" | "email_confirmed_at"> & { confirmed_at?: string | null };
  isPlatformAdmin: boolean;
  isInternalTester?: boolean;
  verification?: CampusVerificationSnapshot | null;
  pilotDomain?: string | null;
}): boolean {
  const pilotDomain = args.pilotDomain ?? getPilotSchoolConfig().schoolDomain;
  return canAccessCampusFeatures({
    isPlatformAdmin: args.isPlatformAdmin,
    isInternalTester: args.isInternalTester ?? false,
    email: args.user.email,
    emailVerified: isEmailVerifiedForCampus(args.user),
    pilotDomain,
    verification: args.verification ?? null,
  });
}
