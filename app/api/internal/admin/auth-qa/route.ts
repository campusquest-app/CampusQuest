import { ZodError } from "zod";
import { z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { requireAdminUser } from "@/lib/server/adminAuth";
import { createPublicClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { getAuthEmailRedirectUrl } from "@/lib/authRedirect";
import {
  AUTH_EMAIL_USER_MESSAGES,
  authEmailAcceptedPayload,
  classifyAuthEmailProviderError,
} from "@/lib/authEmailDelivery";
import { isAllowedAuthQaTargetEmail, logAuthQa } from "@/lib/server/authQa";
import { buildAuthQaStatus } from "@/lib/server/authQaStatus";
import { readJson } from "@/lib/server/validation";

const authQaActionSchema = z.object({
  action: z.enum(["resend_confirmation", "password_reset"]),
  email: z.string().trim().email(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:auth-qa:get",
      limit: 30,
      windowMs: 60_000,
    });
    logAuthQa("status", { adminUserId: auth.user.id });
    return ok(buildAuthQaStatus());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser(request);
    enforceRateLimit({
      userId: auth.user.id,
      routeKey: "internal:admin:auth-qa:post",
      limit: 10,
      windowMs: 60_000,
    });
    const input = await readJson(request, authQaActionSchema);
    const targetEmail = input.email.trim().toLowerCase();
    if (!isAllowedAuthQaTargetEmail({ targetEmail, adminEmail: auth.normalizedEmail })) {
      throw new ApiError(
        403,
        "Auth QA email actions are limited to your admin email, approved QA accounts, or @uri.edu addresses.",
        "AUTH_QA_TARGET_FORBIDDEN",
      );
    }

    const supabase = createPublicClient();
    if (input.action === "resend_confirmation") {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: targetEmail,
        options: { emailRedirectTo: getAuthEmailRedirectUrl() },
      });
      if (error) throw classifyAuthEmailProviderError(error, "resend");
      logAuthQa("resend accepted", { adminUserId: auth.user.id });
      return ok({ ...authEmailAcceptedPayload("resend"), action: input.action });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: getAuthEmailRedirectUrl(),
    });
    if (error) throw classifyAuthEmailProviderError(error, "reset");
    logAuthQa("password reset accepted", { adminUserId: auth.user.id });
    return ok({ ...authEmailAcceptedPayload("reset"), action: input.action });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, AUTH_EMAIL_USER_MESSAGES.invalidEmail, "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
