import { ApiError } from "@/lib/server/http";
import { deleteRelatedUserData } from "@/lib/server/adminUserDeletion";
import { createAdminClient } from "@/lib/server/supabase";
import { isAdminEmail } from "@/lib/server/adminEmails";
import { fetchProfileRole } from "@/lib/server/permissions";

/**
 * Self-serve account deletion for App Store / Play compliance.
 * Deletes related app data, then the Auth user. Caller must re-auth confirm.
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

  // Protect platform admin accounts from accidental self-wipe via client API.
  const role = await fetchProfileRole(admin, userId, { email: userEmail });
  if (role === "admin" || role === "super_admin" || (userEmail && isAdminEmail(userEmail))) {
    throw new ApiError(
      403,
      "Admin accounts cannot be deleted from the app. Contact support@campusquest.app.",
      "ACCOUNT_DELETE_ADMIN_FORBIDDEN",
    );
  }

  const { data: authData, error: authLookupError } = await admin.auth.admin.getUserById(userId);
  if (authLookupError || !authData.user) {
    throw new ApiError(404, "Account not found.", "ACCOUNT_DELETE_NOT_FOUND");
  }

  const removedCounts = await deleteRelatedUserData(admin, userId);

  // profiles row may cascade from auth; attempt explicit cleanup first.
  await admin.from("profiles").delete().eq("id", userId);
  await admin.from("user_stats").delete().eq("user_id", userId);

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    throw new ApiError(
      400,
      `Could not finish deleting your account: ${deleteAuthError.message}`,
      "ACCOUNT_DELETE_AUTH_FAILED",
    );
  }

  return { userId, removedCounts };
}
