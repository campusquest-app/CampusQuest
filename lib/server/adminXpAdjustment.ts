import { ApiError } from "@/lib/server/http";
import { logAdminAuditAction } from "@/lib/server/audit";
import { calculateLevelProgression } from "@/lib/server/gameplay";
import { createAdminClient } from "@/lib/server/supabase";
import { getTrustedStatsWriteClient } from "@/lib/server/trustedStatsWrite";

export type AdminXpAdjustAction = "add" | "subtract";

export async function adminAdjustUserXp(args: {
  adminUserId: string;
  adminEmail: string;
  targetUserId: string;
  amount: number;
  action: AdminXpAdjustAction;
  reason: string;
}) {
  const { adminUserId, adminEmail, targetUserId, amount, action, reason } = args;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(400, "Amount must be a positive integer.", "INVALID_XP_AMOUNT");
  }
  const reasonTrimmed = reason.trim();
  if (reasonTrimmed.length < 3) {
    throw new ApiError(400, "A reason is required (min 3 characters).", "REASON_REQUIRED");
  }

  const admin = createAdminClient();
  const statsWriter = getTrustedStatsWriteClient();

  // QA/test accounts never earn XP — not even through manual admin grants.
  const { data: targetFlags } = await admin
    .from("profiles")
    .select("is_test_user")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetFlags?.is_test_user === true) {
    throw new ApiError(
      403,
      "This is a QA test account (is_test_user = true); it cannot receive XP adjustments.",
      "QA_ACCOUNT_XP_FORBIDDEN",
    );
  }

  const { data: stats, error: statsError } = await admin
    .from("user_stats")
    .select("total_xp, level")
    .eq("user_id", targetUserId)
    .single();

  if (statsError || !stats) {
    throw new ApiError(404, "Target user stats not found.", "STATS_NOT_FOUND");
  }

  const previousXp = Math.max(0, Number(stats.total_xp ?? 0));
  const previousLevel = Math.max(1, Number(stats.level ?? 1));
  const signedDelta = action === "add" ? amount : -amount;
  const newXp = Math.max(0, previousXp + signedDelta);
  const newLevel = calculateLevelProgression(newXp).level;

  const { error: updateError } = await statsWriter
    .from("user_stats")
    .update({ total_xp: newXp, level: newLevel })
    .eq("user_id", targetUserId);

  if (updateError) {
    throw new ApiError(400, updateError.message, "XP_ADJUST_FAILED");
  }

  const xpLogAmount = action === "add" ? amount : -amount;
  const activityTitle =
    action === "add" ? `Admin granted +${amount} XP` : `Admin removed -${amount} XP`;

  const { error: logError } = await statsWriter.from("xp_logs").insert({
    user_id: targetUserId,
    source_type: "admin_adjustment",
    source_id: adminUserId,
    xp_amount: xpLogAmount,
    note: reasonTrimmed,
  });
  if (logError) {
    throw new ApiError(400, logError.message, "XP_LOG_FAILED");
  }

  await admin.from("user_activity_events").insert({
    user_id: targetUserId,
    activity_type: "admin_xp_adjustment",
    title: activityTitle,
    description: reasonTrimmed,
    xp_awarded: action === "add" ? amount : 0,
    metadata: {
      admin_user_id: adminUserId,
      action,
      signed_delta: signedDelta,
      previous_xp: previousXp,
      new_xp: newXp,
    },
  });

  await logAdminAuditAction({
    actionType: "admin_xp_adjustment",
    targetUserId,
    adminUserId,
    adminEmail,
    reason: reasonTrimmed,
    metadata: {
      amount,
      action,
      previous_xp: previousXp,
      new_xp: newXp,
      previous_level: previousLevel,
      new_level: newLevel,
    },
  });

  console.log("[XP] Awarded through trusted path", {
    path: "admin_adjust_user_xp",
    targetUserId,
    adminUserId,
    signedDelta,
    newXp,
    newLevel,
  });

  return {
    targetUserId,
    previousXp,
    newXp,
    previousLevel,
    newLevel,
    signedDelta,
    reason: reasonTrimmed,
  };
}

/** Recompute XP from xp_logs ledger; falls back to zero when no trusted logs exist. */
export async function recomputeUserXpFromLedger(userId: string): Promise<{
  previousXp: number;
  newXp: number;
  previousLevel: number;
  newLevel: number;
  ledgerTotal: number;
}> {
  const admin = createAdminClient();
  const statsWriter = getTrustedStatsWriteClient();

  const [{ data: stats, error: statsError }, { data: logs, error: logsError }] = await Promise.all([
    admin.from("user_stats").select("total_xp, level").eq("user_id", userId).single(),
    admin.from("xp_logs").select("xp_amount").eq("user_id", userId),
  ]);

  if (statsError || !stats) {
    throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");
  }
  if (logsError) {
    throw new ApiError(400, logsError.message, "XP_LEDGER_FETCH_FAILED");
  }

  const previousXp = Math.max(0, Number(stats.total_xp ?? 0));
  const previousLevel = Math.max(1, Number(stats.level ?? 1));
  const ledgerTotal = Math.max(
    0,
    (logs ?? []).reduce((sum, row) => sum + Number(row.xp_amount ?? 0), 0),
  );
  const newXp = ledgerTotal;
  const newLevel = calculateLevelProgression(newXp).level;

  const { error: updateError } = await statsWriter
    .from("user_stats")
    .update({ total_xp: newXp, level: newLevel })
    .eq("user_id", userId);

  if (updateError) {
    throw new ApiError(400, updateError.message, "XP_REPAIR_FAILED");
  }

  return { previousXp, newXp, previousLevel, newLevel, ledgerTotal };
}

/** Find and repair users with suspicious XP (e.g. exploit victims/cheaters). */
export async function repairSuspiciousUserXp(args?: { username?: string; minXp?: number }) {
  const admin = createAdminClient();
  const minXp = args?.minXp ?? 50_000;

  let userIds: string[] = [];

  if (args?.username) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, username")
      .ilike("username", args.username.trim())
      .limit(10);
    if (profileError) {
      throw new ApiError(400, profileError.message, "SUSPICIOUS_XP_QUERY_FAILED");
    }
    userIds = (profiles ?? []).map((row) => row.id as string);
  } else {
    const { data: statsRows, error: statsError } = await admin
      .from("user_stats")
      .select("user_id")
      .gte("total_xp", minXp)
      .limit(50);
    if (statsError) {
      throw new ApiError(400, statsError.message, "SUSPICIOUS_XP_QUERY_FAILED");
    }
    userIds = (statsRows ?? []).map((row) => row.user_id as string);
  }

  const repaired: Array<{
    userId: string;
    username: string | null;
    previousXp: number;
    newXp: number;
  }> = [];

  for (const userId of userIds) {
    const { data: profile } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
    const result = await recomputeUserXpFromLedger(userId);
    repaired.push({
      userId,
      username: (profile?.username as string | null | undefined) ?? null,
      previousXp: result.previousXp,
      newXp: result.newXp,
    });
  }

  return repaired;
}
