import { AUTH_CALLBACK_PATH, PASSWORD_RESET_PATH } from "@/lib/authRedirect";
import { mapAuthCallbackError, parseAuthCallbackParams } from "@/lib/client/authCallbackErrors";
import { passwordMeetsRequirements } from "@/lib/passwordRequirements";

export const PASSWORD_RESET_SUCCESS_PARAM = "password_reset";
export const NATIVE_AUTH_SCHEME = "campusquest:";
const PASSWORD_RESET_PENDING_KEY = "cq_password_reset_pending";

export function markPasswordResetPendingIfNeeded(pathname: string, search = "", hash = ""): void {
  if (typeof sessionStorage === "undefined") return;
  const params = parseAuthCallbackParams({ search, hash });
  if (isPasswordResetPath(pathname) || isPasswordRecoveryCallback(params)) {
    sessionStorage.setItem(PASSWORD_RESET_PENDING_KEY, "1");
  }
}

export function isPasswordResetPending(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(PASSWORD_RESET_PENDING_KEY) === "1";
}

export function clearPasswordResetPending(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(PASSWORD_RESET_PENDING_KEY);
}

export function isPasswordResetPath(pathname: string): boolean {
  return pathname === PASSWORD_RESET_PATH || pathname.startsWith(`${PASSWORD_RESET_PATH}/`);
}

/**
 * Recovery sessions stay in memory until the password changes.
 * `detectSessionInUrl` stays off so Safari can hand the same one-time link to the app.
 * Signup verification on `/auth/callback` keeps the normal persisted session.
 */
export function supabaseAuthOptionsForPath(pathname: string, search = "", hash = ""): {
  persistSession: boolean;
  autoRefreshToken: boolean;
  detectSessionInUrl: boolean;
} {
  const params = parseAuthCallbackParams({ search, hash });
  const recovery = isPasswordResetPath(pathname) || isPasswordRecoveryCallback(params);
  return {
    persistSession: !recovery,
    autoRefreshToken: !recovery,
    detectSessionInUrl: !recovery,
  };
}

/** While a reset is in progress, do not copy Supabase into the app Bearer token. */
export function shouldHoldRecoverySession(pending: boolean, pathname: string): "hold" | "release" | "ignore" {
  if (!pending) return "ignore";
  if (isPasswordResetPath(pathname) || pathname === AUTH_CALLBACK_PATH) return "hold";
  return "release";
}

export function hasRecoveryCredentials(params: Record<string, string>): boolean {
  return Boolean((params.access_token && params.refresh_token) || params.code);
}

export function passwordResetFormError(password: string, confirmation: string): string | null {
  if (!passwordMeetsRequirements(password)) {
    return "Choose a password that meets every requirement.";
  }
  if (password !== confirmation) {
    return "Enter the same password in both fields.";
  }
  return null;
}

export function isPasswordRecoveryCallback(params: Record<string, string>): boolean {
  return (params.type ?? "").toLowerCase() === "recovery";
}

export function passwordResetLinkFailure(params: Record<string, string>): string | null {
  const mapped = mapAuthCallbackError(params);
  if (!mapped) return null;
  if (mapped.code === "otp_expired") {
    return "This reset link expired. Request a new password reset and open the latest email.";
  }
  return "This reset link is no longer valid. It may have expired or already been used.";
}

const APP_LINK_HOSTS = new Set(["campusquestapp.com", "www.campusquestapp.com"]);

function isAppAuthPath(pathname: string): boolean {
  return (
    isPasswordResetPath(pathname) ||
    pathname === AUTH_CALLBACK_PATH ||
    pathname.startsWith(`${AUTH_CALLBACK_PATH}/`)
  );
}

/** Map a custom-scheme or universal link onto the current web origin. */
export function inAppAuthUrlFromOpenUrl(url: string, origin: string): string | null {
  const native = httpsPasswordResetFromNativeUrl(url, origin);
  if (native) return native;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !APP_LINK_HOSTS.has(parsed.hostname)) return null;
  if (!isAppAuthPath(parsed.pathname)) return null;
  const base = origin.replace(/\/+$/, "");
  return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function shouldOfferNativePasswordResetHandoff(env: {
  userAgent: string;
  maxTouchPoints?: number;
  nativeApp: boolean;
}): boolean {
  if (env.nativeApp) return false;
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true;
  return /Macintosh/i.test(env.userAgent) && (env.maxTouchPoints ?? 0) > 1;
}

/**
 * `campusquest://auth/reset-password?code=abc` → `{origin}/auth/reset-password?code=abc`
 */
export function httpsPasswordResetFromNativeUrl(url: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== NATIVE_AUTH_SCHEME) return null;
  if (parsed.hostname !== "auth" || !parsed.pathname.startsWith("/reset-password")) return null;
  const base = origin.replace(/\/+$/, "");
  return `${base}${PASSWORD_RESET_PATH}${parsed.search}${parsed.hash}`;
}

/** Link shown when a reset email opens in Safari instead of the installed app. */
export function nativePasswordResetHandoffUrl(search: string, hash: string): string {
  const query = search.startsWith("?") || search === "" ? search : `?${search}`;
  const fragment = hash.startsWith("#") || hash === "" ? hash : `#${hash}`;
  return `${NATIVE_AUTH_SCHEME}//auth/reset-password${query}${fragment}`;
}
