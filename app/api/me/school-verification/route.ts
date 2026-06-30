import { canUserAccessCampusFeatures, logCampusAccessServerDev, resolveIsPlatformAdmin } from "@/lib/server/campusAccess";
import { extractCampusEmailDomain } from "@/lib/campusAccess";
import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import {
  ensureSchoolVerificationForUser,
  syntheticPilotVerificationForPlatformAdmin,
} from "@/lib/server/schoolVerification";
import type { SchoolVerificationState } from "@/lib/server/schoolVerification";
import { requireAuthUser } from "@/lib/server/supabase";

type MeSchoolVerificationPayload = {
  verification: SchoolVerificationState;
  platformAdminAccess: boolean;
  /** @deprecated Use platformAdminAccess — kept for older clients */
  moderationAdminAccess: boolean;
  verified: boolean;
  schoolName: string | null;
  schoolDomain: string | null;
  requiredDomain: string | null;
  requiredSchoolName: string;
};

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:school-verification:get", limit: 30, windowMs: 60_000 });

    const platformAdminAccess = await resolveIsPlatformAdmin(auth.userClient, auth.user);

    const verification: SchoolVerificationState = platformAdminAccess
      ? syntheticPilotVerificationForPlatformAdmin()
      : await ensureSchoolVerificationForUser({
          userClient: auth.userClient as any,
          user: auth.user,
        });

    const verified = canUserAccessCampusFeatures({
      user: auth.user,
      isPlatformAdmin: platformAdminAccess,
      verification,
    });

    logCampusAccessServerDev({
      userId: auth.user.id,
      emailDomain: extractCampusEmailDomain(auth.user.email),
      isAdmin: platformAdminAccess,
      isConfirmed: Boolean(auth.user.email_confirmed_at ?? (auth.user as { confirmed_at?: string | null }).confirmed_at),
      verificationStatus: verification.status,
      decision: verified ? "allow" : "campus_verification_required",
    });

    const body: MeSchoolVerificationPayload = {
      verification,
      platformAdminAccess,
      moderationAdminAccess: platformAdminAccess,
      verified,
      schoolName: verification.schoolName,
      schoolDomain: verification.schoolDomain,
      requiredDomain: verification.requiredPilotDomain,
      requiredSchoolName: verification.requiredPilotSchoolName,
    };

    return ok(body);
  } catch (error) {
    return fail(error);
  }
}
