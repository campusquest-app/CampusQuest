import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { createPublicClient } from "@/lib/server/supabase";
import { authResendConfirmationSchema, readJson } from "@/lib/server/validation";
import { getAuthEmailRedirectUrl } from "@/lib/authRedirect";
import {
  AUTH_EMAIL_USER_MESSAGES,
  AUTH_RESEND_SERVER_LIMIT,
  AUTH_RESEND_SERVER_WINDOW_MS,
  authEmailAcceptedPayload,
  classifyAuthEmailProviderError,
  logEmailVerification,
} from "@/lib/authEmailDelivery";
import { enforceKeyedRateLimit, getRequestClientIp } from "@/lib/server/security";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authResendConfirmationSchema);
    const email = input.email.trim().toLowerCase();
    const clientIp = getRequestClientIp(request);

    enforceKeyedRateLimit({
      key: `email:${email}`,
      routeKey: "auth:reset-password:email",
      limit: AUTH_RESEND_SERVER_LIMIT,
      windowMs: AUTH_RESEND_SERVER_WINDOW_MS,
      message: AUTH_EMAIL_USER_MESSAGES.rateLimited,
      code: "EMAIL_RATE_LIMIT",
    });
    enforceKeyedRateLimit({
      key: `ip:${clientIp}`,
      routeKey: "auth:reset-password:ip",
      limit: 8,
      windowMs: AUTH_RESEND_SERVER_WINDOW_MS,
      message: AUTH_EMAIL_USER_MESSAGES.rateLimited,
      code: "EMAIL_RATE_LIMIT",
    });

    const supabase = createPublicClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthEmailRedirectUrl(),
    });
    if (error) {
      logEmailVerification("reset provider error", {
        code: error.code ?? null,
        status: error.status ?? null,
      });
      throw classifyAuthEmailProviderError(error, "reset");
    }

    logEmailVerification("reset accepted", {});
    return ok(authEmailAcceptedPayload("reset"));
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, AUTH_EMAIL_USER_MESSAGES.invalidEmail, "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
