import { isPasswordRequirementFailure } from "@/lib/passwordRequirements";

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
      return { message: error.message.trim() || PENDING_SETUP_MESSAGE };
    }
    if (error.message.trim()) {
      return { message: error.message };
    }
    return { message: "Unable to create your account. Please try again." };
  }
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return { message: "Unable to connect. Please try again." };
  }
  return { message: "Unable to create your account. Please try again." };
}

export function mapSigninError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return "Unable to connect. Please try again.";
  }
  if (error instanceof HttpRequestError) {
    const raw = (error.message ?? "").toLowerCase();
    const code = (error.code ?? "").toLowerCase();

    // Auth succeeded but profile/stats are still provisioning (includes 503).
    if (isPendingSetupError(error)) {
      // Prefer user-facing wait copy over raw server diagnostics like "Profile not found".
      if (/finishing your account|still creating|still preparing|still finishing/i.test(error.message)) {
        return error.message.trim();
      }
      return PENDING_SETUP_MESSAGE;
    }

    // Genuine connectivity / Supabase outage.
    if (
      error.status === 503 ||
      code === "auth_service_unavailable" ||
      raw.includes("unable to connect") ||
      raw.includes("fetch failed") ||
      raw.includes("network")
    ) {
      return "Unable to connect. Please try again.";
    }
    // Email confirmation must be checked before the generic 401 branch.
    if (code === "email_not_confirmed" || raw.includes("confirm your email")) {
      return "Please confirm your URI email before signing in.";
    }
    if (
      error.status === 401 ||
      code === "invalid_credentials" ||
      raw.includes("invalid email or password") ||
      raw.includes("incorrect email or password")
    ) {
      return "Invalid email or password. If you just signed up, confirm your email first.";
    }
    if (error.status === 429 || code === "email_rate_limit") {
      return "Too many confirmation emails were sent. Please wait a few minutes before trying again.";
    }
    if (error.status === 404) {
      return PENDING_SETUP_MESSAGE;
    }
    if (error.status >= 500) {
      return "Something went wrong on our end. Please try again.";
    }
  }
  return "Unable to connect. Please try again.";
}

export function mapGenericError(error: unknown, fallback = "Unable to connect. Please try again."): string {
  if (error instanceof HttpRequestError) {
    return fallback;
  }
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return "Unable to connect. Please try again.";
  }
  return fallback;
}
