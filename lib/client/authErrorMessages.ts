import { isPasswordRequirementFailure } from "@/lib/passwordRequirements";
import {
  SIGNIN_USER_MESSAGES,
  isAuthNetworkError,
  isAuthRateLimitedError,
  isExplicitEmailNotConfirmedError,
  isInvalidCredentialsAuthError,
} from "@/lib/authSignInErrors";

/** Error thrown by the auth client when an API responds with a non-2xx status. */
export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

/** App-profile / setup codes that mean auth succeeded but the player row isn't ready. */
export const PROFILE_SETUP_CODES = new Set([
  "profile_not_found",
  "stats_not_found",
  "profile_setup_failed",
  "stats_setup_failed",
  "auth_user_not_ready",
  "signup_profile_setup_failed",
  "profile_setup_pending",
  "stats_setup_pending",
  "player_setup_pending",
]);

const PENDING_SETUP_MESSAGE =
  "We're finishing your account setup. Please wait a moment, then try signing in.";

function isPendingSetupError(error: HttpRequestError): boolean {
  const code = (error.code ?? "").toLowerCase();
  if (PROFILE_SETUP_CODES.has(code)) return true;
  return /finishing your account|still creating your profile|still preparing your account|still finishing your account/i.test(
    error.message,
  );
}

/** Signup codes with intentional, user-safe server copy we may surface as-is. */
const SAFE_SIGNUP_CODES = new Set([
  "EMAIL_ALREADY_EXISTS",
  "EMAIL_ALREADY_REGISTERED",
  "INVALID_EMAIL",
  "SCHOOL_EMAIL_REQUIRED",
  "CAMPUS_EMAIL_REQUIRED",
  "USERNAME_TAKEN",
  "VALIDATION_ERROR",
]);

function isSafeUserFacingSignupMessage(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 180) return false;
  // Block Postgres / stack / internal leakage patterns.
  if (/postgres|supabase|sqlstate|permission denied|row-level|jwt|stack|exception|column |relation /i.test(m)) {
    return false;
  }
  return true;
}

export function mapSignupError(
  error: unknown,
): { passwordRequirements: true } | { message: string } {
  if (error instanceof HttpRequestError) {
    if (error.code === "PASSWORD_REQUIREMENTS" || isPasswordRequirementFailure(error.message, error.code)) {
      return { passwordRequirements: true };
    }
    if (error.status === 429 || error.code === "EMAIL_RATE_LIMIT") {
      return {
        message: "Too many confirmation emails were sent. Please wait a few minutes before trying again.",
      };
    }
    if (isPendingSetupError(error)) {
      return { message: PENDING_SETUP_MESSAGE };
    }
    const code = (error.code ?? "").toUpperCase();
    if (SAFE_SIGNUP_CODES.has(code) && isSafeUserFacingSignupMessage(error.message)) {
      return { message: error.message.trim() };
    }
    if (error.status >= 500) {
      return { message: SIGNIN_USER_MESSAGES.server };
    }
    return { message: "Unable to create your account. Please try again." };
  }
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return { message: SIGNIN_USER_MESSAGES.network };
  }
  return { message: "Unable to create your account. Please try again." };
}

export function mapSigninError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return SIGNIN_USER_MESSAGES.network;
  }

  if (error instanceof HttpRequestError) {
    const code = error.code ?? null;
    const message = error.message ?? "";
    const status = error.status;

    // Auth succeeded but profile/stats are still provisioning (includes 503).
    if (isPendingSetupError(error)) {
      if (/finishing your account|still creating|still preparing|still finishing/i.test(error.message)) {
        return error.message.trim();
      }
      return PENDING_SETUP_MESSAGE;
    }

    // Explicit email confirmation only — never via substring matches on credential copy.
    if (isExplicitEmailNotConfirmedError({ code, message })) {
      return SIGNIN_USER_MESSAGES.emailNotConfirmed;
    }

    if (isAuthRateLimitedError({ code, message, status })) {
      return SIGNIN_USER_MESSAGES.rateLimited;
    }

    // Connectivity / Supabase outage (after pending-setup check).
    if (
      isAuthNetworkError({ code, message, status }) &&
      !PROFILE_SETUP_CODES.has((code ?? "").toLowerCase())
    ) {
      return SIGNIN_USER_MESSAGES.network;
    }

    if (isInvalidCredentialsAuthError({ code, message, status })) {
      return SIGNIN_USER_MESSAGES.invalidCredentials;
    }

    if (status === 404) {
      return PENDING_SETUP_MESSAGE;
    }

    if (status >= 500) {
      return SIGNIN_USER_MESSAGES.server;
    }

    return SIGNIN_USER_MESSAGES.generic;
  }

  return SIGNIN_USER_MESSAGES.generic;
}

export function mapGenericError(error: unknown, fallback = SIGNIN_USER_MESSAGES.network): string {
  if (error instanceof HttpRequestError) {
    return fallback;
  }
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return SIGNIN_USER_MESSAGES.network;
  }
  return fallback;
}
