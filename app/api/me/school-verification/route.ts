import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { ensureSchoolVerificationForUser } from "@/lib/server/schoolVerification";
import { requireAuthUser } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:school-verification:get", limit: 30, windowMs: 60_000 });
    const verification = await ensureSchoolVerificationForUser({
      userClient: auth.userClient as any,
      user: auth.user,
    });
    return ok({ verification });
  } catch (error) {
    return fail(error);
  }
}
