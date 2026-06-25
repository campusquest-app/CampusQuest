import { ApiError } from "@/lib/server/http";
import { logAdminAuditAction } from "@/lib/server/audit";
import { isAdminEmail } from "@/lib/server/adminEmails";
import { assertAdminCanDeleteTargetUser } from "@/lib/server/protectedAccounts";
import { fetchProfileRole, type ProfileRole } from "@/lib/server/permissions";
import { createAdminClient } from "@/lib/server/supabase";

type AdminClient = ReturnType<typeof createAdminClient>;

type DeletionStep = {
  table: string;
  columns: string[];
  description: string;
};

/**
 * Public tables that reference users/profiles. Delete rows explicitly so admin
 * deletion succeeds even when FKs use RESTRICT or auth cascade order differs.
 */
export const USER_DATA_DELETION_STEPS: DeletionStep[] = [
  { table: "guilds", columns: ["owner_id"], description: "owned guilds" },
  { table: "beta_founders", columns: ["user_id"], description: "torch bearer founder badge" },
  { table: "pinned_dm_users", columns: ["user_id", "pinned_user_id"], description: "pinned direct messages" },
  { table: "student_connections", columns: ["requester_id", "addressee_id"], description: "friend connections" },
  { table: "blocked_users", columns: ["blocker_id", "blocked_id"], description: "user blocks" },
  { table: "direct_messages", columns: ["sender_id", "recipient_id"], description: "direct messages" },
  { table: "message_reports", columns: ["reporter_id", "reported_user_id"], description: "message reports" },
  { table: "direct_conversation_participants", columns: ["user_id"], description: "conversation memberships" },
  { table: "direct_conversations", columns: ["created_by"], description: "owned conversations" },
  { table: "notifications", columns: ["user_id"], description: "notifications" },
  { table: "quad_posts", columns: ["user_id"], description: "quad posts" },
  { table: "quad_comment_likes", columns: ["user_id"], description: "quad comment likes" },
  { table: "quad_post_comments", columns: ["user_id"], description: "quad comments" },
  { table: "quad_post_reactions", columns: ["user_id"], description: "quad reactions" },
  { table: "quad_spark_xp_grants", columns: ["sparker_user_id"], description: "quad spark XP grants" },
  { table: "post_likes", columns: ["user_id"], description: "post likes" },
  { table: "posts", columns: ["user_id"], description: "legacy posts" },
  { table: "comments", columns: ["user_id"], description: "legacy comments" },
  { table: "likes", columns: ["user_id"], description: "legacy likes" },
  { table: "proof_submissions", columns: ["user_id"], description: "proof submissions" },
  { table: "user_quests", columns: ["user_id"], description: "active quests" },
  { table: "quest_completions", columns: ["user_id"], description: "quest completions" },
  { table: "admin_quest_completions", columns: ["user_id"], description: "admin quest completions" },
  { table: "boss_attempts", columns: ["user_id"], description: "boss attempts" },
  { table: "boss_drops", columns: ["user_id"], description: "boss drops" },
  { table: "user_inventory", columns: ["user_id"], description: "inventory" },
  { table: "xp_logs", columns: ["user_id"], description: "XP logs" },
  { table: "guild_members", columns: ["user_id"], description: "guild memberships" },
  { table: "guild_xp_logs", columns: ["user_id"], description: "guild XP logs" },
  { table: "event_rsvps", columns: ["user_id"], description: "event RSVPs" },
  { table: "organization_members", columns: ["user_id"], description: "organization memberships" },
  { table: "organization_join_requests", columns: ["requester_id"], description: "organization join requests" },
  { table: "organization_creation_requests", columns: ["requester_id"], description: "organization creation requests" },
  { table: "student_organizations", columns: ["created_by"], description: "owned organizations" },
  { table: "campus_events", columns: ["created_by"], description: "created campus events" },
  { table: "campus_event_reports", columns: ["reporter_id"], description: "campus event reports" },
  { table: "organization_reports", columns: ["reporter_id"], description: "organization reports" },
  { table: "quad_post_reports", columns: ["reporter_id", "post_owner_id"], description: "quad post reports" },
  { table: "user_onboarding_preferences", columns: ["user_id"], description: "onboarding preferences" },
  { table: "user_legal_consents", columns: ["user_id"], description: "legal consents" },
  { table: "user_beginner_quest_claims", columns: ["user_id"], description: "beginner quest claims" },
  { table: "user_account_safety", columns: ["user_id"], description: "account safety status" },
  { table: "user_safety_appeals", columns: ["user_id"], description: "safety appeals" },
  { table: "direct_message_favorites", columns: ["user_id"], description: "message favorites" },
  { table: "user_equipment_loadouts", columns: ["user_id"], description: "equipment loadouts" },
  { table: "user_school_verifications", columns: ["user_id"], description: "school verifications" },
  { table: "unlocked_milestones", columns: ["user_id"], description: "unlocked milestones" },
  { table: "realm_moments", columns: ["user_id"], description: "realm moments" },
  { table: "qr_scans", columns: ["user_id"], description: "QR scans" },
  { table: "qr_suspicious_events", columns: ["user_id"], description: "QR suspicious events" },
];

function logDeletePhase(phase: string, details: Record<string, unknown>): void {
  console.info(`[admin:delete-user] ${phase}`, details);
}

function logDeleteError(phase: string, details: Record<string, unknown>): void {
  console.error(`[admin:delete-user] ${phase}`, details);
}

async function deleteRowsForColumn(
  admin: AdminClient,
  table: string,
  column: string,
  targetUserId: string,
): Promise<number> {
  const { count, error } = await admin.from(table).delete({ count: "exact" }).eq(column, targetUserId);
  if (error) {
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist/i.test(error.message ?? "") ||
      /could not find the table/i.test(error.message ?? "")
    ) {
      return 0;
    }
    throw new ApiError(
      400,
      `Could not delete related data from ${table}.${column}: ${error.message}`,
      "USER_DELETE_DATA_FAILED",
    );
  }
  return count ?? 0;
}

export async function deleteRelatedUserData(
  admin: AdminClient,
  targetUserId: string,
): Promise<Record<string, number>> {
  const removedCounts: Record<string, number> = {};

  for (const step of USER_DATA_DELETION_STEPS) {
    for (const column of step.columns) {
      const key = `${step.table}.${column}`;
      try {
        const count = await deleteRowsForColumn(admin, step.table, column, targetUserId);
        if (count > 0) {
          removedCounts[key] = count;
          logDeletePhase("data_deleted", { targetUserId, table: step.table, column, count, description: step.description });
        }
      } catch (error) {
        logDeleteError("data_delete_failed", {
          targetUserId,
          table: step.table,
          column,
          description: step.description,
          message: error instanceof ApiError ? error.message : error instanceof Error ? error.message : "unknown",
        });
        throw error;
      }
    }
  }

  return removedCounts;
}

export async function findDeletionBlockers(admin: AdminClient, targetUserId: string): Promise<string[]> {
  const blockers: string[] = [];

  for (const step of USER_DATA_DELETION_STEPS) {
    for (const column of step.columns) {
      const { count, error } = await admin
        .from(step.table)
        .select("*", { count: "exact", head: true })
        .eq(column, targetUserId);
      if (error) continue;
      if ((count ?? 0) > 0) {
        blockers.push(`${step.table}.${column} (${count} row${count === 1 ? "" : "s"})`);
      }
    }
  }

  return blockers;
}

export async function deleteAdminTargetUser(args: {
  targetUserId: string;
  adminUserId: string;
  adminEmail: string;
}): Promise<{ targetUserId: string; removedCounts: Record<string, number> }> {
  const { targetUserId, adminUserId, adminEmail } = args;

  if (!targetUserId || targetUserId === adminUserId) {
    throw new ApiError(400, "Choose a different user to delete.", "USER_DELETE_SELF_FORBIDDEN");
  }

  const admin = createAdminClient();

  const { data: authData, error: authLookupError } = await admin.auth.admin.getUserById(targetUserId);
  if (authLookupError || !authData.user) {
    throw new ApiError(404, "User not found in authentication records.", "USER_DELETE_NOT_FOUND");
  }

  const targetEmail = authData.user.email ?? null;
  let targetRole: ProfileRole = "student";
  const { data: profileRow } = await admin.from("profiles").select("role").eq("id", targetUserId).maybeSingle();
  if (profileRow?.role === "admin" || profileRow?.role === "super_admin") {
    targetRole = profileRow.role;
  } else if (targetEmail && isAdminEmail(targetEmail)) {
    targetRole = "super_admin";
  } else {
    targetRole = await fetchProfileRole(admin, targetUserId, { email: targetEmail });
  }

  assertAdminCanDeleteTargetUser({ targetUserId, targetEmail, targetRole });

  logDeletePhase("start", {
    targetUserId,
    targetEmail,
    targetRole,
    adminUserId,
    adminEmail,
  });

  const removedCounts = await deleteRelatedUserData(admin, targetUserId);

  await logAdminAuditAction({
    actionType: "user_deleted",
    targetUserId,
    adminUserId,
    adminEmail,
    metadata: {
      targetEmail,
      removedCounts,
    },
  });

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteAuthError) {
    const blockers = await findDeletionBlockers(admin, targetUserId);
    logDeleteError("auth_delete_failed", {
      targetUserId,
      targetEmail,
      message: deleteAuthError.message,
      code: deleteAuthError.code ?? null,
      blockers,
      removedCounts,
    });

    const blockerSummary = blockers.length > 0 ? blockers.join(", ") : "unknown foreign-key reference";
    throw new ApiError(
      400,
      `Failed to delete user: still blocked by ${blockerSummary}. Database reported: ${deleteAuthError.message}`,
      "USER_DELETE_AUTH_FAILED",
    );
  }

  logDeletePhase("complete", { targetUserId, targetEmail, removedCounts });

  return { targetUserId, removedCounts };
}
