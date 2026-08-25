import { ApiError } from "@/lib/server/http";
import { logEmailVerification } from "@/lib/authEmailDelivery";
import { CAMPUS_EMAIL_CODE_TTL_SECONDS } from "@/lib/campusEmailVerification";

/**
 * Default From for campus OTP via Resend.
 * Must match a verified Resend domain. Production currently verifies
 * `auth.campusquestapp.com` (not the apex `campusquestapp.com`).
 * Override with RESEND_FROM_EMAIL / EMAIL_VERIFICATION_FROM — do not invent senders.
 */
const DEFAULT_FROM = "CampusQuest <noreply@auth.campusquestapp.com>";

function recipientDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "unknown";
}

function summarizeResendErrorBody(raw: string): {
  errorName: string | null;
  errorMessage: string | null;
  requestId: string | null;
} {
  try {
    const parsed = JSON.parse(raw) as {
      name?: unknown;
      message?: unknown;
      id?: unknown;
    };
    return {
      errorName: typeof parsed.name === "string" ? parsed.name : null,
      errorMessage: typeof parsed.message === "string" ? parsed.message.slice(0, 300) : null,
      requestId: typeof parsed.id === "string" ? parsed.id : null,
    };
  } catch {
    return { errorName: null, errorMessage: null, requestId: null };
  }
}

export function getResendApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = (env.RESEND_API_KEY ?? "").trim();
  if (!key) {
    throw new ApiError(
      500,
      "We couldn't send your code. Please try again.",
      "EMAIL_VERIFICATION_RESEND_MISSING",
    );
  }
  return key;
}

export function getCampusVerificationFromAddress(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = (env.RESEND_FROM_EMAIL ?? env.EMAIL_VERIFICATION_FROM ?? "").trim();
  return configured || DEFAULT_FROM;
}

export function buildCampusVerificationEmailText(code: string): string {
  const minutes = Math.round(CAMPUS_EMAIL_CODE_TTL_SECONDS / 60);
  return [
    "CampusQuest",
    "",
    "Verify your URI email",
    "",
    "Your verification code is:",
    "",
    code,
    "",
    `This code expires in ${minutes} minutes.`,
    "",
    "If you didn't request this code, you can ignore this email.",
  ].join("\n");
}

export async function sendCampusVerificationEmailViaResend(args: {
  to: string;
  code: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<void> {
  const env = args.env ?? process.env;
  const apiKey = getResendApiKey(env);
  const from = getCampusVerificationFromAddress(env);
  const fetchImpl = args.fetchImpl ?? fetch;
  const keyConfigured = Boolean(apiKey);
  const toDomain = recipientDomain(args.to);

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: "Your CampusQuest verification code",
      text: buildCampusVerificationEmailText(args.code),
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    const summary = summarizeResendErrorBody(raw);
    // Always log failures (safe fields only) so production diagnosis is possible.
    console.warn("[Email Verification] campus code email send failed", {
      RESEND_API_KEY_configured: keyConfigured,
      from,
      recipientDomain: toDomain,
      httpStatus: response.status,
      resendErrorName: summary.errorName,
      resendErrorMessage: summary.errorMessage,
      resendRequestId: summary.requestId ?? response.headers.get("x-request-id"),
    });
    throw new ApiError(
      502,
      "We couldn't send your code. Please try again.",
      "EMAIL_VERIFICATION_SEND_FAILED",
    );
  }

  logEmailVerification("campus code email accepted", {
    from,
    recipientDomain: toDomain,
    httpStatus: response.status,
  });
}
