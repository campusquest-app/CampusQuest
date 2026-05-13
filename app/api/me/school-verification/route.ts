import { userHasModerationAdminAccess } from "@/lib/server/adminAuth";
import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import {
  ensureSchoolVerificationForUser,
  syntheticPilotVerificationForModerationAdmin,
} from "@/lib/server/schoolVerification";
import type { SchoolVerificationState } from "@/lib/server/schoolVerification";
import { requireAuthUser } from "@/lib/server/supabase";

type MeSchoolVerificationPayload = {
  /** Row-shaped verification (synthetic for moderation admins). */
  verification: SchoolVerificationState;
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

    const moderationAdminAccess = userHasModerationAdminAccess(auth.user);

    const verification: SchoolVerificationState = moderationAdminAccess
      ? syntheticPilotVerificationForModerationAdmin()
      : await ensureSchoolVerificationForUser({
          userClient: auth.userClient as any,
          user: auth.user,
        });

    const verified =
      moderationAdminAccess ||
      (verification.status === "verified" && Boolean(verification.schoolName) && Boolean(verification.schoolDomain));

    const body: MeSchoolVerificationPayload = {
      verification,
      moderationAdminAccess,
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
