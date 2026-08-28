/**
 * After Create Account, keep the student in an authenticated session when
 * technically safe instead of forcing a manual sign-in.
 */

const PENDING_SETUP_CODES = new Set([
  "AUTH_CREATED_SETUP_PENDING",
  "SIGNUP_PROFILE_SETUP_FAILED",
  "AUTH_USER_NOT_READY",
  "PROFILE_SETUP_PENDING",
  "STATS_SETUP_PENDING",
  "PLAYER_SETUP_PENDING",
  "PROFILE_NOT_FOUND",
  "STATS_NOT_FOUND",
]);

const EXISTING_ACCOUNT_CODES = new Set(["EMAIL_ALREADY_EXISTS", "EMAIL_ALREADY_REGISTERED"]);

export const SIGNUP_SESSION_RETRY_DELAYS_MS = [0, 800, 1600] as const;

export function isSignupPendingSetupCode(code?: string | null): boolean {
  if (!code) return false;
  return PENDING_SETUP_CODES.has(code.toUpperCase());
}

export function shouldAutoEstablishSignupSession(args: {
  hasAccessToken: boolean;
  verificationRequired: boolean;
  recoverSignIn?: boolean;
  errorCode?: string | null;
}): boolean {
  if (args.hasAccessToken) return false;
  if (args.verificationRequired) return false;
  const code = (args.errorCode ?? "").toUpperCase();
  if (EXISTING_ACCOUNT_CODES.has(code)) return false;
  if (args.recoverSignIn) return true;
  return !args.hasAccessToken;
}

export function shouldKeepSignupPassword(args: {
  verificationRequired: boolean;
  errorCode?: string | null;
}): boolean {
  if (args.verificationRequired) return false;
  const code = (args.errorCode ?? "").toUpperCase();
  if (EXISTING_ACCOUNT_CODES.has(code)) return false;
  return true;
}
