import { userHasModerationAdminAccess } from "@/lib/server/adminAuth";
import { ApiError } from "@/lib/server/http";
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

function isVerifiedEmailUser(user: { email_confirmed_at?: string | null; confirmed_at?: string | null }) {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

/** Pilot-aligned scope for moderation admins (eligible for campus APIs without `@uri.edu`). */
export function syntheticPilotVerificationForModerationAdmin(): SchoolVerificationState {
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

async function userIdHasModerationAdminAccess(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  const u = data.user;
  return userHasModerationAdminAccess({
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    confirmed_at: (u as { confirmed_at?: string | null }).confirmed_at,
  });
}

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
  const { userClient, user } = args;
  const pilot = getPilotSchoolConfig();
  const emailDomain = extractEmailDomain(user.email ?? null);
  const isEmailVerified = isVerifiedEmailUser(user);
  const pilotDomainAllowed = !pilot.schoolDomain || emailDomain === pilot.schoolDomain;
  const shouldVerify = Boolean(emailDomain && isEmailVerified && pilotDomainAllowed);
  const nowIso = new Date().toISOString();

  const upsertPayload = {
    user_id: user.id,
    school_name: shouldVerify ? pilot.schoolName : null,
    school_domain: shouldVerify ? emailDomain : emailDomain,
    status: shouldVerify ? "verified" : "pending",
    verified_at: shouldVerify ? nowIso : null,
    updated_at: nowIso,
  };

  const { data, error } = await userClient
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
  if (userHasModerationAdminAccess(user)) {
    return syntheticPilotVerificationForModerationAdmin();
  }
  const existing = await userClient
    .from("user_school_verifications")
    .select("user_id, school_name, school_domain, status, verified_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing.error) {
    throw new ApiError(400, existing.error.message, "SCHOOL_VERIFICATION_FAILED");
  }
  const verification =
    existing.data && existing.data.status === "verified"
      ? mapRowToState(existing.data as VerificationRow)
      : await ensureSchoolVerificationForUser({ userClient, user });
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
  const [initiatorIsAdmin, otherIsAdmin] = await Promise.all([
    userIdHasModerationAdminAccess(userId),
    userIdHasModerationAdminAccess(otherUserId),
  ]);
  if (initiatorIsAdmin || otherIsAdmin) {
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
