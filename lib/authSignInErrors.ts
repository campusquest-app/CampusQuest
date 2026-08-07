/**
 * Shared sign-in error classification (client + server).
 * Never infer "email unconfirmed" from a generic credential failure.
 */

export const SIGNIN_USER_MESSAGES = {
  invalidCredentials: "Incorrect email or password.",
  emailNotConfirmed: "Please confirm your URI email before signing in.",
  rateLimited: "Too many sign-in attempts. Please wait a moment and try again.",
  network: "Unable to connect. Check your internet connection and try again.",
  generic: "Unable to sign in. Please try again.",
  server: "Something went wrong on our end. Please try again.",
} as const;

export type ClassifiedSignInFailure = {
  status: number;
  message: string;
  code: string;
};

function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").toLowerCase().trim();
}

function normalizeMessage(message: string | null | undefined): string {
  return (message ?? "").toLowerCase().trim();
}

/**
 * True only when Supabase (or our API) explicitly reports email confirmation
 * as the blocker — never because a password check failed.
 *
 * Do NOT treat messages that merely mention "confirm your email" as
 * unconfirmed (that broke wrong-password UX).
 */
export function isExplicitEmailNotConfirmedError(args: {
  code?: string | null;
  message?: string | null;
}): boolean {
  const code = normalizeCode(args.code);
  if (code === "email_not_confirmed" || code === "email_not_confirmed_error") {
    return true;
  }

  const message = normalizeMessage(args.message);
  // Exact Supabase wording only.
  return message === "email not confirmed" || message === "email_not_confirmed";
}

export function isInvalidCredentialsAuthError(args: {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}): boolean {
  const code = normalizeCode(args.code);
  if (
    code === "invalid_credentials" ||
    code === "invalid_grant" ||
    code === "invalid_login_credentials" ||
    code === "user_not_found"
  ) {
    return true;
  }

  const message = normalizeMessage(args.message);
  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid email or password") ||
    message.includes("incorrect email or password") ||
    message.includes("invalid_credentials")
  ) {
    return true;
  }

  // Generic 401s from Auth that aren't explicitly email-not-confirmed
  // are treated as credential failures (avoid account-existence leaks).
  if (args.status === 401 && !isExplicitEmailNotConfirmedError(args)) {
    return true;
  }

  return false;
}

export function isAuthRateLimitedError(args: {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}): boolean {
  if (args.status === 429) return true;
  const code = normalizeCode(args.code);
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "too_many_requests" ||
    code === "email_rate_limit" ||
    code === "rate_limit"
  ) {
    return true;
  }
  const message = normalizeMessage(args.message);
  return message.includes("rate limit") || message.includes("too many requests");
}

export function isAuthNetworkError(args: {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}): boolean {
  if (args.status === 503) {
    const code = normalizeCode(args.code);
    if (code === "auth_service_unavailable" || code === "") return true;
  }
  const code = normalizeCode(args.code);
  if (code.includes("fetch") || code === "auth_service_unavailable" || code === "network_error") {
    return true;
  }
  const message = normalizeMessage(args.message);
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("getaddrinfo") ||
    message.includes("enotfound") ||
    message.includes("unable to connect")
  );
}

/** Classify a raw Supabase AuthError (or similar) for the login API response. */
export function classifySupabaseSignInFailure(error: unknown): ClassifiedSignInFailure {
  const rawMessage =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const rawCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : null;

  const args = {
    code: rawCode,
    message: rawMessage,
    status: Number.isFinite(status) ? status : null,
  };

  if (isAuthNetworkError(args)) {
    return {
      status: 503,
      message: SIGNIN_USER_MESSAGES.network,
      code: "AUTH_SERVICE_UNAVAILABLE",
    };
  }

  if (isAuthRateLimitedError(args)) {
    return {
      status: 429,
      message: SIGNIN_USER_MESSAGES.rateLimited,
      code: "RATE_LIMITED",
    };
  }

  if (isExplicitEmailNotConfirmedError(args)) {
    return {
      status: 401,
      message: SIGNIN_USER_MESSAGES.emailNotConfirmed,
      code: "EMAIL_NOT_CONFIRMED",
    };
  }

  if (isInvalidCredentialsAuthError(args) || args.status === 400) {
    // Supabase often returns 400 for bad passwords — treat as credentials,
    // never as email confirmation, unless the code/message was explicit above.
    return {
      status: 401,
      message: SIGNIN_USER_MESSAGES.invalidCredentials,
      code: "INVALID_CREDENTIALS",
    };
  }

  return {
    status: 401,
    message: SIGNIN_USER_MESSAGES.generic,
    code: "SIGNIN_FAILED",
  };
}
