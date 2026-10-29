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

/** Bounded retries for transient Resend/network failures. Permanent 4xx responses are not retried. */
export const CAMPUS_EMAIL_SEND_ATTEMPTS = 3;
export const CAMPUS_EMAIL_SEND_BACKOFF_MS = [400, 1200] as const;

export function isRetryableResendStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

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
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const env = args.env ?? process.env;
  const apiKey = getResendApiKey(env);
  const from = getCampusVerificationFromAddress(env);
  const fetchImpl = args.fetchImpl ?? fetch;
  const sleep = args.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const keyConfigured = Boolean(apiKey);
  const toDomain = recipientDomain(args.to);
  const payload = JSON.stringify({
    from,
    to: [args.to],
    subject: "Your CampusQuest verification code",
    text: buildCampusVerificationEmailText(args.code),
  });

  let lastFailure: { status: number; summary: ReturnType<typeof summarizeResendErrorBody>; requestId: string | null } | null =
    null;

  for (let attempt = 1; attempt <= CAMPUS_EMAIL_SEND_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: payload,
      });
    } catch {
      lastFailure = {
        status: 0,
        summary: { errorName: "network_error", errorMessage: null, requestId: null },
        requestId: null,
      };
      if (attempt < CAMPUS_EMAIL_SEND_ATTEMPTS) {
        await sleep(CAMPUS_EMAIL_SEND_BACKOFF_MS[attempt - 1] ?? 1200);
        continue;
      }
      break;
    }

    if (response.ok) {
      logEmailVerification("campus code email accepted", {
        from,
        recipientDomain: toDomain,
        httpStatus: response.status,
        attempt,
      });
      return;
    }

    const raw = await response.text().catch(() => "");
    lastFailure = {
      status: response.status,
      summary: summarizeResendErrorBody(raw),
      requestId: response.headers.get("x-request-id"),
    };
    if (isRetryableResendStatus(response.status) && attempt < CAMPUS_EMAIL_SEND_ATTEMPTS) {
      await sleep(CAMPUS_EMAIL_SEND_BACKOFF_MS[attempt - 1] ?? 1200);
      continue;
    }
    break;
  }

  console.warn("[Email Verification] campus code email send failed", {
    RESEND_API_KEY_configured: keyConfigured,
    from,
    recipientDomain: toDomain,
    httpStatus: lastFailure?.status ?? 0,
    resendErrorName: lastFailure?.summary.errorName ?? null,
    resendErrorMessage: lastFailure?.summary.errorMessage ?? null,
    resendRequestId: lastFailure?.summary.requestId ?? lastFailure?.requestId ?? null,
    attempts: CAMPUS_EMAIL_SEND_ATTEMPTS,
  });
  throw new ApiError(
    502,
    "We couldn't send your code. Please try again.",
    "EMAIL_VERIFICATION_SEND_FAILED",
  );
}
