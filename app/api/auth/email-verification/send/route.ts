import { fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceKeyedRateLimit, enforceRateLimit, getRequestClientIp } from "@/lib/server/security";
import { CAMPUS_EMAIL_USER_MESSAGES } from "@/lib/campusEmailVerification";
import {
  createSupabaseCampusEmailStore,
  sendCampusEmailVerification,
} from "@/lib/server/campusEmailVerification";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "auth:email-verification:send",
      limit: 8,
      windowMs: 60_000,
      message: CAMPUS_EMAIL_USER_MESSAGES.cooldown(60),
      code: "EMAIL_VERIFICATION_COOLDOWN",
    });
    enforceKeyedRateLimit({
      key: `ip:${getRequestClientIp(request)}`,
      routeKey: "auth:email-verification:send:ip",
      limit: 12,
      windowMs: 60_000,
      message: CAMPUS_EMAIL_USER_MESSAGES.cooldown(60),
      code: "EMAIL_VERIFICATION_COOLDOWN",
    });

    const store = createSupabaseCampusEmailStore();
    const result = await sendCampusEmailVerification({
      userId: auth.user.id,
      email: auth.user.email ?? "",
      store,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
