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

function isVerifiedEmailUser(user: { email_confirmed_at?: string | null; confirmed_at?: string | null }) {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
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
  if (!isVerifiedEmailUser(auth.user)) {
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
