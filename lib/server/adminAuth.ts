import { ApiError } from "@/lib/server/http";
import { requireAuthUser } from "@/lib/server/supabase";
import { headers } from "next/headers";

type AuthedUser = Awaited<ReturnType<typeof requireAuthUser>>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function listAdminEmails() {
  return (process.env.MODERATION_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function isAuthEmailConfirmed(user: { email_confirmed_at?: string | null; confirmed_at?: string | null }) {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

/** True when email is verified and listed in `MODERATION_ADMIN_EMAILS`; used for internal tooling auth and moderator campus-eligibility shortcuts. */
export function userHasModerationAdminAccess(user: {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  const email = user.email?.trim();
  if (!email) return false;
  if (!isAuthEmailConfirmed(user)) return false;
  return isAdminEmail(email);
}

export function isAdminEmail(email: string): boolean {
  return listAdminEmails().includes(normalizeEmail(email));
}

function getRequestFromServerHeaders() {
  const requestHeaders = headers();
  const authHeader = requestHeaders.get("authorization");
  return new Request("http://internal.local/admin-auth", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

export async function requireAdminUser(request?: Request): Promise<AuthedUser & { normalizedEmail: string }> {
  const auth = await requireAuthUser(request ?? getRequestFromServerHeaders());
  const email = auth.user.email;
  if (!email) {
    throw new ApiError(401, "Unauthorized.", "UNAUTHORIZED");
  }
  if (!isAuthEmailConfirmed(auth.user)) {
    throw new ApiError(401, "Unauthorized.", "UNAUTHORIZED");
  }
  if (!isAdminEmail(email)) {
    throw new ApiError(403, "Unauthorized.", "FORBIDDEN");
  }
  return {
    ...auth,
    normalizedEmail: normalizeEmail(email),
  };
}
