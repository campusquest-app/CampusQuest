/** Decode a JWT payload without verifying it. Never log the token. */

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  if (typeof atob === "function") {
    return atob(padded);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

export type AccessTokenClaims = {
  sub: string | null;
  email: string | null;
  sessionId: string | null;
  emailConfirmed: boolean | null;
};

export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readAccessTokenClaims(token: string | null | undefined): AccessTokenClaims | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const sub = typeof payload.sub === "string" && payload.sub.trim() ? payload.sub : null;
  const email = typeof payload.email === "string" && payload.email.trim() ? payload.email : null;
  const sessionId =
    typeof payload.session_id === "string" && payload.session_id.trim()
      ? payload.session_id
      : typeof payload.sessionId === "string" && payload.sessionId.trim()
        ? payload.sessionId
        : null;
  let emailConfirmed: boolean | null = null;
  if (typeof payload.email_confirmed_at === "string") {
    emailConfirmed = Boolean(payload.email_confirmed_at);
  } else if (payload.email_verified === true || payload.email_confirmed === true) {
    emailConfirmed = true;
  } else if (payload.email_verified === false || payload.email_confirmed === false) {
    emailConfirmed = false;
  }
  return { sub, email, sessionId, emailConfirmed };
}
