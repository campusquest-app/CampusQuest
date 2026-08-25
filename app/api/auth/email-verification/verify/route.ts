import { ZodError } from "zod";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { enforceKeyedRateLimit, enforceRateLimit, getRequestClientIp } from "@/lib/server/security";
import { readJson } from "@/lib/server/validation";
import { CAMPUS_EMAIL_USER_MESSAGES } from "@/lib/campusEmailVerification";
import {
  createSupabaseCampusEmailStore,
  verifyCampusEmailCode,
} from "@/lib/server/campusEmailVerification";

const verifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, CAMPUS_EMAIL_USER_MESSAGES.incorrect),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "auth:email-verification:verify",
      limit: 20,
      windowMs: 60_000,
      message: CAMPUS_EMAIL_USER_MESSAGES.tooManyAttempts,
      code: "EMAIL_VERIFICATION_RATE_LIMIT",
    });
    enforceKeyedRateLimit({
      key: `ip:${getRequestClientIp(request)}`,
      routeKey: "auth:email-verification:verify:ip",
      limit: 40,
      windowMs: 60_000,
      message: CAMPUS_EMAIL_USER_MESSAGES.tooManyAttempts,
      code: "EMAIL_VERIFICATION_RATE_LIMIT",
    });

    const input = await readJson(request, verifySchema);
    const store = createSupabaseCampusEmailStore();
    const result = await verifyCampusEmailCode({
      userId: auth.user.id,
      email: auth.user.email ?? "",
      code: input.code,
      store,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, CAMPUS_EMAIL_USER_MESSAGES.incorrect, "EMAIL_VERIFICATION_INVALID_CODE"));
    }
    return fail(error);
  }
}
