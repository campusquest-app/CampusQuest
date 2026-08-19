/** Public origin used for auth email redirects (confirmation, recovery). */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicSiteUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (explicit) return trimTrailingSlash(explicit);
  const vercel = (process.env.VERCEL_URL || "").trim();
  if (vercel) {
    const host = trimTrailingSlash(vercel.replace(/^https?:\/\//, ""));
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

export const AUTH_CALLBACK_PATH = "/auth/callback";

export function getAuthEmailRedirectUrl(): string {
  return `${getPublicSiteUrl()}${AUTH_CALLBACK_PATH}`;
}

export function describeAuthRedirectConfig(): {
  siteUrl: string;
  emailRedirectUrl: string;
  callbackPath: string;
} {
  return {
    siteUrl: getPublicSiteUrl(),
    emailRedirectUrl: getAuthEmailRedirectUrl(),
    callbackPath: AUTH_CALLBACK_PATH,
  };
}
