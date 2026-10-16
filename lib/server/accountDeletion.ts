import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { collectUserStorageObjects, removeUserStorageObjects } from "@/lib/server/userStorageCleanup";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AccountDeletionResult = {
  userId: string;
  removedCounts: Record<string, number>;
  storageRemoved: number;
  storageFailed: number;
};

/**
 * Shared deletion order for self-serve and admin:
 * 1. Collect storage paths while the user still exists.
 * 2. Delete Auth so the session cannot outlive wiped data.
 * 3. Remove collected storage objects (best-effort).
 * 4. Delete leftover relational rows (best-effort after Auth cascade).
 */
export async function executeAccountDeletion(args: {
  admin: AdminClient;
  userId: string;
}): Promise<AccountDeletionResult> {
  const { admin, userId } = args;
  const storageRefs = await collectUserStorageObjects(admin, userId);

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    throw new ApiError(
      400,
      "Could not finish deleting the account. Please try again or contact support.",
      "ACCOUNT_DELETE_AUTH_FAILED",
    );
  }

  let storageRemoved = 0;
  let storageFailed = 0;
  try {
    const storage = await removeUserStorageObjects(admin, storageRefs);
    storageRemoved = storage.removed;
    storageFailed = storage.failed;
  } catch (error) {
    console.error("[cq:account-delete] storage cleanup failed", {
      userId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  let removedCounts: Record<string, number> = {};
  try {
    const { deleteRelatedUserData } = await import("@/lib/server/adminUserDeletion");
    removedCounts = await deleteRelatedUserData(admin, userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.from("user_stats").delete().eq("user_id", userId);
  } catch (cleanupError) {
    console.error("[cq:account-delete] post-auth cleanup failed", {
      userId,
      message: cleanupError instanceof Error ? cleanupError.message : "unknown",
    });
  }

  return { userId, removedCounts, storageRemoved, storageFailed };
}
