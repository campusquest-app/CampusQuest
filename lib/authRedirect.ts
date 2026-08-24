/**
 * Public origin + auth email redirect helpers.
 *
 * Canonical production app URL env (preferred): NEXT_PUBLIC_SITE_URL
 * Fallbacks: SITE_URL, then NEXT_PUBLIC_APP_URL (already used elsewhere in-repo).
 *
 * Production must never silently fall back to localhost — that embeds a dead
 * redirect into Supabase confirmation emails (ERR_CONNECTION_REFUSED).
 */

export const AUTH_CALLBACK_PATH = "/auth/callback";
export const LOCAL_DEV_SITE_URL = "http://localhost:3000";
/** Documented production origin for CampusQuest. */
export const PRODUCTION_SITE_ORIGIN = "https://campusquestapp.com";

export class AuthRedirectConfigError extends Error {
  readonly code = "AUTH_REDIRECT_CONFIG";

  constructor(message: string) {
    super(message);
    this.name = "AuthRedirectConfigError";
  }
}

type EnvLike = Record<string, string | undefined>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readEnv(env: EnvLike, key: string): string {
  return (env[key] ?? "").trim();
}

/** True when this process should never emit localhost auth redirects. */
export function isProductionRuntime(env: EnvLike = process.env): boolean {
  const vercelEnv = readEnv(env, "VERCEL_ENV").toLowerCase();
  if (vercelEnv === "production") return true;
  if (vercelEnv === "preview" || vercelEnv === "development") return false;
  return readEnv(env, "NODE_ENV").toLowerCase() === "production";
}

/**
 * Normalize a configured origin to `scheme://host[:port]` with no trailing slash.
 * Rejects empty / non-http(s) values.
 */
export function normalizePublicSiteOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AuthRedirectConfigError("Public site URL is empty.");
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new AuthRedirectConfigError(`Public site URL is invalid: ${trimmed}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AuthRedirectConfigError(`Public site URL must be http(s): ${trimmed}`);
  }

  // Strip path/query/hash — origin only. Callback path is appended separately.
  return trimTrailingSlash(url.origin);
}

function isLocalhostHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function assertProductionOriginSafe(origin: string): void {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new AuthRedirectConfigError(
      `Production auth redirect origin is invalid (${origin}). Set NEXT_PUBLIC_SITE_URL=${PRODUCTION_SITE_ORIGIN}`,
    );
  }
  if (url.protocol !== "https:") {
    throw new AuthRedirectConfigError(
      `Production auth redirects must use HTTPS (got ${origin}). Set NEXT_PUBLIC_SITE_URL=${PRODUCTION_SITE_ORIGIN}`,
    );
  }
  if (isLocalhostHostname(url.hostname)) {
    throw new AuthRedirectConfigError(
      `Production auth redirects must not use localhost (got ${origin}). Set NEXT_PUBLIC_SITE_URL=${PRODUCTION_SITE_ORIGIN} on Vercel Production and redeploy.`,
    );
  }
}

function resolveExplicitSiteUrl(env: EnvLike): string | null {
  const raw =
    readEnv(env, "NEXT_PUBLIC_SITE_URL") ||
    readEnv(env, "SITE_URL") ||
    readEnv(env, "NEXT_PUBLIC_APP_URL");
  if (!raw) return null;
  return normalizePublicSiteOrigin(raw);
}

function resolveVercelPreviewOrigin(env: EnvLike): string | null {
  const vercel = readEnv(env, "VERCEL_URL");
  if (!vercel) return null;
  const host = trimTrailingSlash(vercel.replace(/^https?:\/\//i, ""));
  if (!host || isLocalhostHostname(host.split(":")[0] ?? host)) return null;
  return normalizePublicSiteOrigin(`https://${host}`);
}

/**
 * Resolve the public site origin used for auth email redirects.
 * Injectable `env` supports unit tests.
 */
export function getPublicSiteUrl(env: EnvLike = process.env): string {
  const explicit = resolveExplicitSiteUrl(env);
  if (explicit) {
    if (isProductionRuntime(env)) {
      assertProductionOriginSafe(explicit);
    }
    return explicit;
  }

  if (isProductionRuntime(env)) {
    // Never fall back to localhost or a random *.vercel.app host in production —
    // confirmation emails must land on the canonical custom domain.
    console.error(
      "[auth-redirect] NEXT_PUBLIC_SITE_URL is missing in production. " +
        `Set NEXT_PUBLIC_SITE_URL=${PRODUCTION_SITE_ORIGIN} on Vercel (Production) and redeploy. ` +
        "Refusing to embed localhost into verification emails.",
    );
    throw new AuthRedirectConfigError(
      `NEXT_PUBLIC_SITE_URL must be set to ${PRODUCTION_SITE_ORIGIN} in production. ` +
        "Verification emails will not be sent with a localhost redirect.",
    );
  }

  // Preview deployments may use the Vercel deployment host when no explicit URL is set.
  const vercelOrigin = resolveVercelPreviewOrigin(env);
  if (vercelOrigin) return vercelOrigin;

  return LOCAL_DEV_SITE_URL;
}

export function getAuthEmailRedirectUrl(env: EnvLike = process.env): string {
  return `${getPublicSiteUrl(env)}${AUTH_CALLBACK_PATH}`;
}

export function describeAuthRedirectConfig(env: EnvLike = process.env): {
  siteUrl: string | null;
  emailRedirectUrl: string | null;
  callbackPath: string;
  configured: boolean;
  configError: string | null;
} {
  try {
    const siteUrl = getPublicSiteUrl(env);
    return {
      siteUrl,
      emailRedirectUrl: `${siteUrl}${AUTH_CALLBACK_PATH}`,
      callbackPath: AUTH_CALLBACK_PATH,
      configured: true,
      configError: null,
    };
  } catch (error) {
    const message =
      error instanceof AuthRedirectConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Auth redirect URL is misconfigured.";
    return {
      siteUrl: null,
      emailRedirectUrl: null,
      callbackPath: AUTH_CALLBACK_PATH,
      configured: false,
      configError: message,
    };
  }
}
