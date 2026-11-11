import { classifyAuthEmailProviderError, logEmailVerification, AUTH_EMAIL_USER_MESSAGES } from "@/lib/authEmailDelivery";
import { getCampusVerificationFromAddress, getResendApiKey } from "@/lib/server/campusEmailVerificationMail";
import { ApiError } from "@/lib/server/http";
import { createAdminClient, createPublicClient } from "@/lib/server/supabase";

function recipientDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "unknown";
}

export function buildPasswordResetEmailText(link: string): string {
  return [
    "CampusQuest",
    "",
    "Reset your password",
    "",
    "We received a request to reset the password for this CampusQuest account.",
    "Open this link to choose a new password. The link works once and then expires:",
    "",
    link,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");
}

export function isUnknownAuthUserError(error: { message?: string; code?: string } | null | undefined): boolean {
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();
  return (
    code === "user_not_found" ||
    message.includes("user not found") ||
    message.includes("user with this email not found")
  );
}

/** Send the one-time reset link from the authenticated CampusQuest domain. */
export async function sendPasswordResetEmailViaResend(args: {
  to: string;
  link: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<void> {
  const env = args.env ?? process.env;
  const apiKey = getResendApiKey(env);
  const from = getCampusVerificationFromAddress(env);
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: "Reset your CampusQuest password",
      text: buildPasswordResetEmailText(args.link),
    }),
  });
  if (!response.ok) {
    logEmailVerification("reset resend failed", {
      recipientDomain: recipientDomain(args.to),
      httpStatus: response.status,
    });
    throw new Error("password_reset_email_failed");
  }
  logEmailVerification("reset resend accepted", {
    recipientDomain: recipientDomain(args.to),
    httpStatus: response.status,
  });
}

/**
 * Prefer the authenticated CampusQuest mail domain. Fall back to Supabase's
 * own mailer only when Resend or the service role is not configured.
 * Unknown addresses return without sending so the caller can stay generic.
 */
export async function deliverPasswordResetEmail(email: string, redirectTo: string): Promise<void> {
  const preferResend = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (preferResend) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (error) {
      if (isUnknownAuthUserError(error)) return;
      throw classifyAuthEmailProviderError(error, "reset");
    }
    const link = data.properties?.action_link;
    if (!link) {
      throw classifyAuthEmailProviderError({ message: "missing recovery link" }, "reset");
    }
    try {
      await sendPasswordResetEmailViaResend({ to: email, link });
    } catch {
      throw new ApiError(502, AUTH_EMAIL_USER_MESSAGES.generic, "RESET_PASSWORD_FAILED");
    }
    return;
  }

  const supabase = createPublicClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    if (isUnknownAuthUserError(error)) return;
    throw classifyAuthEmailProviderError(error, "reset");
  }
}
