/**
 * Canonical authorization for /api/moderation/* routes that are invoked by
 * internal admin forwards (MESSAGE_MODERATION_API_KEY + x-admin-email).
 *
 * Aligns with `userHasPlatformAdminAccess`: env allow-list, email fallbacks,
 * or profiles.role admin/super_admin. Never trusts client-only flags.
 */

import type { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import { isAdminEmailFallback } from "@/lib/platformAdmin";
import { isAdminEmail, isAuthEmailConfirmed } from "@/lib/server/adminEmails";
import { findAuthUserIdByEmail } from "@/lib/server/authBootstrap";
import {
  fetchProfileRole,
  roleAtLeast,
  userHasPlatformAdminAccess,
} from "@/lib/server/permissions";
import { createAdminClient } from "@/lib/server/supabase";

export function assertModerationApiKey(request: Request): void {
  const expected = process.env.MESSAGE_MODERATION_API_KEY;
  if (!expected) {
    throw new ApiError(500, "Missing MESSAGE_MODERATION_API_KEY for moderation route.", "MODERATION_KEY_MISSING");
  }
  const provided = request.headers.get("x-message-moderation-key");
  if (!provided || provided !== expected) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
}

/**
 * Returns the normalized admin email after verifying platform-admin access.
 */
export async function assertPlatformModerationAdminEmail(request: Request): Promise<string> {
  assertModerationApiKey(request);
  const adminEmail = request.headers.get("x-admin-email")?.trim().toLowerCase() ?? "";
  if (!adminEmail) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }

  if (isAdminEmail(adminEmail) || isAdminEmailFallback(adminEmail)) {
    return adminEmail;
  }

  const userId = await findAuthUserIdByEmail(adminEmail);
  if (!userId) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
  if (!isAuthEmailConfirmed(data.user)) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }

  const profileRole = await fetchProfileRole(admin, userId, { email: adminEmail });
  const syntheticUser = {
    ...data.user,
    email: adminEmail,
  } as User;
  if (!userHasPlatformAdminAccess(syntheticUser, profileRole) && !roleAtLeast(profileRole, "admin")) {
    throw new ApiError(403, "Forbidden.", "FORBIDDEN");
  }
  return adminEmail;
}
