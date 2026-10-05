import { ApiError } from "@/lib/server/http";
import { resolveCampusAccessIdentity, userIdHasCampusBypassAccess } from "@/lib/server/campusAccess";
import { extractEmailDomain, getPilotSchoolConfig } from "@/lib/server/pilotMode";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type VerificationRow = {
  user_id: string;
  school_name: string | null;
  school_domain: string | null;
  status: "pending" | "verified";
  verified_at: string | null;
};

export type SchoolVerificationState = {
  status: "pending" | "verified";
  schoolName: string | null;
  schoolDomain: string | null;
  verifiedAt: string | null;
  requiredPilotDomain: string | null;
  requiredPilotSchoolName: string;
};

/** Pilot-aligned scope for platform admins (eligible for campus APIs without `@uri.edu`). */
export function syntheticPilotVerificationForPlatformAdmin(): SchoolVerificationState {
  const pilot = getPilotSchoolConfig();
  return {
    status: "verified",
    schoolName: pilot.schoolName,
    schoolDomain: pilot.schoolDomain ?? null,
    verifiedAt: new Date().toISOString(),
    requiredPilotDomain: pilot.schoolDomain,
    requiredPilotSchoolName: pilot.schoolName,
  };
}

/** @deprecated Use syntheticPilotVerificationForPlatformAdmin */
export const syntheticPilotVerificationForModerationAdmin = syntheticPilotVerificationForPlatformAdmin;

function mapRowToState(row: VerificationRow | null): SchoolVerificationState {
  const pilot = getPilotSchoolConfig();
  return {
    status: row?.status ?? "pending",
    schoolName: row?.school_name ?? null,
    schoolDomain: row?.school_domain ?? null,
    verifiedAt: row?.verified_at ?? null,
    requiredPilotDomain: pilot.schoolDomain,
    requiredPilotSchoolName: pilot.schoolName,
  };
}

export async function ensureSchoolVerificationForUser(args: {
  userClient: SupabaseClientLike;
  user: {
    id: string;
    email?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  };
}): Promise<SchoolVerificationState> {
  const { user } = args;
  const pilot = getPilotSchoolConfig();
  const emailDomain = extractEmailDomain(user.email ?? null);
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("campus_email_verified_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    throw new ApiError(400, "Could not verify school email.", "SCHOOL_VERIFICATION_FAILED");
  }
  const campusEmailVerified = Boolean(profile?.campus_email_verified_at);
  const pilotDomainAllowed = !pilot.schoolDomain || emailDomain === pilot.schoolDomain;
  const shouldVerify = Boolean(emailDomain && campusEmailVerified && pilotDomainAllowed);
  const nowIso = new Date().toISOString();

  const upsertPayload = {
    user_id: user.id,
    school_name: shouldVerify ? pilot.schoolName : null,
    school_domain: shouldVerify ? emailDomain : emailDomain,
    status: shouldVerify ? "verified" : "pending",
    verified_at: shouldVerify ? nowIso : null,
    updated_at: nowIso,
  };

  // AUD-001: verification state is server-owned. Everything in `upsertPayload`
  // is derived from the authenticated identity and the protected profile
  // timestamp, never from client input, so the write uses service_role.
  const { data, error } = await admin
    .from("user_school_verifications")
    .upsert(upsertPayload, { onConflict: "user_id" })
    .select("user_id, school_name, school_domain, status, verified_at")
    .single();

  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not verify school email.", "SCHOOL_VERIFICATION_FAILED");
  }

  return mapRowToState(data as VerificationRow);
}

export async function requireVerifiedSchoolForCoreAccess(args: {
  userClient: SupabaseClientLike;
  user: {
    id: string;
    email?: string | null;
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  };
}) {
  const { userClient, user } = args;
  const identity = await resolveCampusAccessIdentity(userClient, user);
  if (identity.isPlatformAdmin || identity.isInternalTester) {
    return syntheticPilotVerificationForPlatformAdmin();
  }
  // Re-derive on every core-access check so a stale legacy row that was
  // previously verified from auth.users.email_confirmed_at cannot bypass the
  // CampusQuest six-digit proof.
  const verification = await ensureSchoolVerificationForUser({ userClient, user });
  if (verification.status !== "verified" || !verification.schoolDomain || !verification.schoolName) {
    throw new ApiError(
      403,
      "Campus email verification is required before using this feature.",
      "SCHOOL_VERIFICATION_REQUIRED",
    );
  }
  return verification;
}

export async function requireMatchingVerifiedSchool(args: {
  userClient: SupabaseClientLike;
  userId: string;
  otherUserId: string;
}) {
  const { userId, otherUserId } = args;
  const [initiatorBypasses, otherBypasses] = await Promise.all([
    userIdHasCampusBypassAccess(userId),
    userIdHasCampusBypassAccess(otherUserId),
  ]);
  if (initiatorBypasses || otherBypasses) {
    return;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_school_verifications")
    .select("user_id, school_domain, status")
    .in("user_id", [userId, otherUserId]);
  if (error) {
    throw new ApiError(400, error.message, "SCHOOL_SCOPE_LOOKUP_FAILED");
  }
  const rows = data ?? [];
  const me = rows.find((row) => row.user_id === userId);
  const other = rows.find((row) => row.user_id === otherUserId);
  if (!me || me.status !== "verified" || !me.school_domain) {
    throw new ApiError(403, "Verify your school email to connect with students.", "SCHOOL_VERIFICATION_REQUIRED");
  }
  if (!other || other.status !== "verified" || !other.school_domain) {
    throw new ApiError(
      403,
      "This student is not in your verified campus community yet.",
      "CAMPUS_SCOPE_RESTRICTED",
    );
  }
  if (me.school_domain !== other.school_domain) {
    throw new ApiError(
      403,
      "Campus discovery is scoped to your verified school by default.",
      "CAMPUS_SCOPE_RESTRICTED",
    );
  }
}
