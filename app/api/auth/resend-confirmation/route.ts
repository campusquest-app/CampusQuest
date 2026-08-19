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

    const supabase = createPublicClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: getAuthEmailRedirectUrl() },
    });
    if (error) {
      logEmailVerification("resend provider error", {
        code: error.code ?? null,
        status: error.status ?? null,
      });
      throw classifyAuthEmailProviderError(error, "resend");
    }

    logEmailVerification("resend accepted", {});
    return ok(authEmailAcceptedPayload("resend"));
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, AUTH_EMAIL_USER_MESSAGES.invalidEmail, "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
