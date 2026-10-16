import { ApiError } from "@/lib/server/http";
import { executeAccountDeletion } from "@/lib/server/accountDeletion";
import { createAdminClient } from "@/lib/server/supabase";
import { isAdminEmail } from "@/lib/server/adminEmails";
import { fetchProfileRole } from "@/lib/server/permissions";

/**
 * Self-serve account deletion for App Store / Play compliance.
 * Collects storage paths, deletes Auth first, then media and leftover rows.
 */
export async function deleteOwnAccount(args: {
  userId: string;
  userEmail: string | null | undefined;
}): Promise<{ userId: string; removedCounts: Record<string, number> }> {
  const { userId, userEmail } = args;
  if (!userId) {
    throw new ApiError(400, "Missing user id.", "ACCOUNT_DELETE_INVALID");
  }

  const admin = createAdminClient();

  const role = await fetchProfileRole(admin, userId, { email: userEmail });
  if (role === "admin" || role === "super_admin" || (userEmail && isAdminEmail(userEmail))) {
    throw new ApiError(
      403,
      "Admin accounts cannot be deleted from the app. Contact support@campusquestapp.com.",
      "ACCOUNT_DELETE_ADMIN_FORBIDDEN",
    );
  }

  const { data: authData, error: authLookupError } = await admin.auth.admin.getUserById(userId);
  if (authLookupError || !authData.user) {
    throw new ApiError(404, "Account not found.", "ACCOUNT_DELETE_NOT_FOUND");
  }

  return executeAccountDeletion({ admin, userId });
}
