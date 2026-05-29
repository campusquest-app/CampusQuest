import { ApiError } from "@/lib/server/http";
import {
  isAdminEmail,
  isAuthEmailConfirmed,
  userHasModerationAdminAccess,
} from "@/lib/server/adminEmails";
import { fetchProfileRole, roleAtLeast, userHasPlatformAdminAccess } from "@/lib/server/permissions";
import { requireAuthUser } from "@/lib/server/supabase";
import { headers } from "next/headers";

export { isAdminEmail, isAuthEmailConfirmed, userHasModerationAdminAccess } from "@/lib/server/adminEmails";

type AuthedUser = Awaited<ReturnType<typeof requireAuthUser>>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
  const profileRole = await fetchProfileRole(auth.userClient, auth.user.id, { email: auth.user.email });
  if (!userHasPlatformAdminAccess(auth.user, profileRole)) {
    throw new ApiError(403, "Unauthorized.", "FORBIDDEN");
  }
  return {
    ...auth,
    normalizedEmail: normalizeEmail(email),
  };
}

export async function requireQrAdminUser(request?: Request) {
  const auth = await requireAdminUser(request);
  const profileRole = await fetchProfileRole(auth.userClient, auth.user.id, { email: auth.user.email });
  if (!roleAtLeast(profileRole, "admin") && !isAdminEmail(auth.normalizedEmail)) {
    throw new ApiError(403, "QR admin access required.", "FORBIDDEN");
  }
  return { ...auth, profileRole };
}
