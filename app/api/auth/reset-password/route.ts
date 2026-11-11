import { ZodError } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { authResendConfirmationSchema, readJson } from "@/lib/server/validation";
import { getPasswordResetRedirectUrl } from "@/lib/authRedirect";
import { deliverPasswordResetEmail } from "@/lib/server/passwordResetMail";
import {
  AUTH_EMAIL_USER_MESSAGES,
  authEmailAcceptedPayload,
  logEmailVerification,
} from "@/lib/authEmailDelivery";
import { enforcePasswordResetRateLimits } from "@/lib/server/passwordResetRateLimit";
import { getRequestClientIp } from "@/lib/server/security";

export async function POST(request: Request) {
  try {
    const input = await readJson(request, authResendConfirmationSchema);
    const email = input.email.trim().toLowerCase();
    const clientIp = getRequestClientIp(request);

    await enforcePasswordResetRateLimits({ email, ip: clientIp });

    await deliverPasswordResetEmail(email, getPasswordResetRedirectUrl());

    logEmailVerification("reset accepted", {});
    return ok(authEmailAcceptedPayload("reset"));
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, AUTH_EMAIL_USER_MESSAGES.invalidEmail, "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
