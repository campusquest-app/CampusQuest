import { ApiError } from "@/lib/server/http";

export const AUTH_EMAIL_USER_MESSAGES = {
  accepted:
    "If this address still needs verification, another email is on the way. Delivery can take a minute.",
  resetAccepted:
    "If an account exists for this address, a password reset email is on the way. Delivery can take a minute.",
  rateLimited: "Please wait a moment before requesting another email.",
  invalidEmail: "Enter a valid email address.",
  generic: "We couldn't send that email right now. Please try again in a moment.",
} as const;

export const AUTH_RESEND_COOLDOWN_MS = 60_000;
export const AUTH_RESEND_SERVER_LIMIT = 3;
export const AUTH_RESEND_SERVER_WINDOW_MS = 15 * 60_000;

type AuthProviderError = {
  message?: string;
  code?: string;
  status?: number;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

export function isAuthEmailRateLimitError(error: AuthProviderError): boolean {
  if (error.status === 429) return true;
  const code = normalize(error.code);
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "email_rate_limit" ||
    code === "too_many_requests"
  ) {
    return true;
  }
  const message = normalize(error.message);
  return message.includes("rate limit") || message.includes("too many requests");
}

export function classifyAuthEmailProviderError(
  error: AuthProviderError,
  action: "resend" | "reset",
): ApiError {
  if (isAuthEmailRateLimitError(error)) {
    return new ApiError(429, AUTH_EMAIL_USER_MESSAGES.rateLimited, "EMAIL_RATE_LIMIT");
  }

  const code = normalize(error.code);
  const message = normalize(error.message);
  if (code === "validation_failed" || (message.includes("invalid") && message.includes("email"))) {
    return new ApiError(400, AUTH_EMAIL_USER_MESSAGES.invalidEmail, "INVALID_EMAIL");
  }

  if (
    message.includes("otp_expired") ||
    message.includes("token has expired") ||
    code === "otp_expired"
  ) {
    return new ApiError(
      400,
      "That link is no longer valid. Request a new email and try again.",
      "AUTH_LINK_EXPIRED",
    );
  }

  return new ApiError(
    400,
    action === "reset" ? AUTH_EMAIL_USER_MESSAGES.resetAccepted : AUTH_EMAIL_USER_MESSAGES.generic,
    action === "reset" ? "RESET_PASSWORD_FAILED" : "RESEND_CONFIRMATION_FAILED",
  );
}

export function authEmailAcceptedPayload(action: "resend" | "reset"): {
  accepted: true;
  delivered: false;
  message: string;
} {
  return {
    accepted: true,
    delivered: false,
    message:
      action === "reset" ? AUTH_EMAIL_USER_MESSAGES.resetAccepted : AUTH_EMAIL_USER_MESSAGES.accepted,
  };
}

export function logEmailVerification(phase: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production" && process.env.AUTH_QA_LOG !== "1") return;
  console.info("[Email Verification]", phase, details ?? {});
}
