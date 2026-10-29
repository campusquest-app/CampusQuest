import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { authResendConfirmationSchema, readJson } from "@/lib/server/validation";
import {
  AUTH_EMAIL_USER_MESSAGES,
  AUTH_RESEND_SERVER_LIMIT,
  AUTH_RESEND_SERVER_WINDOW_MS,
  logEmailVerification,
} from "@/lib/authEmailDelivery";
import { enforceKeyedRateLimit, getRequestClientIp } from "@/lib/server/security";
import { resendStudentVerificationEmail } from "@/lib/server/resendStudentVerificationEmail";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authResendConfirmationSchema);
    const email = input.email.trim().toLowerCase();
    const clientIp = getRequestClientIp(request);

    enforceKeyedRateLimit({
      key: `email:${email}`,
      routeKey: "auth:resend-confirmation:email",
      limit: AUTH_RESEND_SERVER_LIMIT,
      windowMs: AUTH_RESEND_SERVER_WINDOW_MS,
      message: AUTH_EMAIL_USER_MESSAGES.rateLimited,
      code: "EMAIL_RATE_LIMIT",
    });
    enforceKeyedRateLimit({
      key: `ip:${clientIp}`,
      routeKey: "auth:resend-confirmation:ip",
      limit: 8,
      windowMs: AUTH_RESEND_SERVER_WINDOW_MS,
      message: AUTH_EMAIL_USER_MESSAGES.rateLimited,
      code: "EMAIL_RATE_LIMIT",
    });

    const result = await resendStudentVerificationEmail(email);
    logEmailVerification("resend finished", {
      channel: result.channel,
      delivered: "delivered" in result ? result.delivered : false,
      alreadyVerified: "alreadyVerified" in result ? result.alreadyVerified : false,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, AUTH_EMAIL_USER_MESSAGES.invalidEmail, "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
