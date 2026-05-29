import { ApiError } from "@/lib/server/http";
import { canBypassQrScanLimits, fetchProfileRole, type ProfileRole } from "@/lib/server/permissions";
import { applyQrActivityStatBoost, resolveQrActivityLink } from "@/lib/server/qrActivityLink";
import { applyQrLocationMilestones } from "@/lib/server/qrMilestones";
import { normalizeQrCode } from "@/lib/qrCodeExtract";
import { auditQrScanPatterns } from "@/lib/server/qrSuspiciousActivity";
import { addXpInternal, completeQuest, getPlayerProgressSnapshot } from "@/lib/server/services";
import { createAdminClient } from "@/lib/server/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseClientLike = SupabaseClient;

export type QrCodeRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  event_id: string | null;
  quest_id: string | null;
  location_name: string | null;
  activity_name: string | null;
  xp_reward: number;
  is_active: boolean;
  is_permanent: boolean;
  cooldown_hours: number;
  max_scans_per_day: number;
  requires_staff_approval: boolean;
  expires_at: string | null;
};

type ScanFailReason =
  | "invalid"
  | "inactive"
  | "expired"
  | "cooldown"
  | "daily_limit"
  | "already_redeemed"
  | "staff_approval";

const FAIL_MESSAGES: Record<ScanFailReason, string> = {
  invalid: "This QR code is not valid.",
  inactive: "This QR code is no longer active.",
  expired: "This QR code has expired.",
  cooldown: "You already scanned this QR recently. Come back after the cooldown.",
  daily_limit: "You reached the daily scan limit for this QR code.",
  already_redeemed: "You already claimed XP from this event QR code.",
  staff_approval: "This check-in is waiting for staff approval.",
};

function utcDayStartIso(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function isMissingQrTablesError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  if (error.code === "PGRST205") return true;
  return /qr_codes/i.test(msg) && /(schema cache|does not exist|Could not find the table)/i.test(msg);
}

async function insertScanLog(args: {
  client: SupabaseClientLike;
  userId: string;
  qrCodeId: string;
  xpAwarded: number;
  status: "success" | "failed" | "admin_bypass";
  failureReason?: string | null;
  deviceHint?: string | null;
}) {
  const { error } = await args.client.from("qr_scans").insert({
    user_id: args.userId,
    qr_code_id: args.qrCodeId,
    xp_awarded: args.xpAwarded,
    status: args.status,
    failure_reason: args.failureReason ?? null,
    device_hint: args.deviceHint ?? null,
  });
  if (error) {
    throw new ApiError(400, error.message, "QR_SCAN_LOG_FAILED");
  }
}

async function tryCompleteLinkedQuest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  questId: string | null;
}) {
  const { userClient, userId, questId } = args;
  if (!questId) return null;

  const { data: userQuest } = await userClient
    .from("user_quests")
    .select("id, status, progress_count")
    .eq("user_id", userId)
    .eq("quest_id", questId)
    .neq("status", "claimed")
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!userQuest || userQuest.status === "claimed") return null;

  await userClient
    .from("user_quests")
    .update({
      progress_count: Math.max(Number(userQuest.progress_count ?? 0), 1),
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", userQuest.id)
    .eq("user_id", userId);

  try {
    return await completeQuest({ userClient, userId, userQuestId: userQuest.id });
  } catch {
    return null;
  }
}

function scanFailureMessage(reason: ScanFailReason, qr: QrCodeRow): string {
  if (reason === "cooldown" && (qr.code === "GYM" || /uri gym/i.test(qr.location_name ?? ""))) {
    return "You already checked in at the URI Gym today. Come back tomorrow to earn more XP.";
  }
  if (reason === "daily_limit" && qr.code === "GYM") {
    return "You already checked in at the URI Gym today. Come back tomorrow to earn more XP.";
  }
  return FAIL_MESSAGES[reason];
}

function evaluateScanEligibility(args: {
  row: QrCodeRow;
  role: ProfileRole;
  lastSuccessAt: string | null;
  successToday: number;
  priorEventSuccess: boolean;
}): { allowed: boolean; reason?: ScanFailReason; bypass: boolean } {
  const { row, role, lastSuccessAt, successToday, priorEventSuccess } = args;
  const bypass = canBypassQrScanLimits(role);

  if (bypass) return { allowed: true, bypass: true };
  if (!row.is_active) return { allowed: false, reason: "inactive", bypass: false };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { allowed: false, reason: "expired", bypass: false };
  }
  if (row.requires_staff_approval) {
    return { allowed: false, reason: "staff_approval", bypass: false };
  }
  if (row.type === "event" && priorEventSuccess) {
    return { allowed: false, reason: "already_redeemed", bypass: false };
  }
  if (lastSuccessAt && row.cooldown_hours > 0) {
    const nextAllowed = new Date(lastSuccessAt).getTime() + row.cooldown_hours * 60 * 60 * 1000;
    if (Date.now() < nextAllowed) {
      return { allowed: false, reason: "cooldown", bypass: false };
    }
  }
  if (row.max_scans_per_day > 0 && successToday >= row.max_scans_per_day) {
    return { allowed: false, reason: "daily_limit", bypass: false };
  }
  return { allowed: true, bypass: false };
}

export async function scanCampusQuestQrCode(args: {
  userClient: SupabaseClientLike;
  userId: string;
  code: string;
  deviceHint?: string | null;
  userEmail?: string | null;
}) {
  const { userClient, userId } = args;
  const code = normalizeQrCode(args.code);
  if (!code || code.length > 128) {
    throw new ApiError(400, FAIL_MESSAGES.invalid, "INVALID_QR_CODE");
  }

  const admin = createAdminClient();
  const role = await fetchProfileRole(userClient, userId, { email: args.userEmail });

  const { data: row, error: lookupError } = await admin
    .from("qr_codes")
    .select(
      "id, code, title, description, type, event_id, quest_id, location_name, activity_name, xp_reward, is_active, is_permanent, cooldown_hours, max_scans_per_day, requires_staff_approval, expires_at",
    )
    .eq("code", code)
    .maybeSingle();

  if (lookupError) {
    if (isMissingQrTablesError(lookupError)) {
      throw new ApiError(
        503,
        "CampusQuest QR check-in is not set up on this database yet. Apply the latest Supabase migration (qr_tables_bootstrap), then try again.",
        "QR_TABLES_NOT_READY",
      );
    }
    throw new ApiError(400, lookupError.message, "QR_LOOKUP_FAILED");
  }
  if (!row) {
    throw new ApiError(404, FAIL_MESSAGES.invalid, "INVALID_QR_CODE");
  }

  const qr = row as QrCodeRow;

  const dayStart = utcDayStartIso();
  const { data: priorScans } = await admin
    .from("qr_scans")
    .select("scanned_at, status")
    .eq("user_id", userId)
    .eq("qr_code_id", qr.id)
    .order("scanned_at", { ascending: false })
    .limit(50);

  const successes = (priorScans ?? []).filter((s) => s.status === "success" || s.status === "admin_bypass");
  const lastSuccessAt = successes[0]?.scanned_at ?? null;
  const successToday = successes.filter((s) => s.scanned_at >= dayStart).length;
  const priorEventSuccess = qr.type === "event" && successes.length > 0;

  if (!qr.is_active && !canBypassQrScanLimits(role)) {
    await insertScanLog({
      client: userClient,
      userId,
      qrCodeId: qr.id,
      xpAwarded: 0,
      status: "failed",
      failureReason: FAIL_MESSAGES.inactive,
      deviceHint: args.deviceHint,
    });
    void auditQrScanPatterns({
      adminClient: admin,
      userId,
      qrCodeId: qr.id,
      status: "failed",
      deviceHint: args.deviceHint,
      locationName: qr.location_name,
    });
    throw new ApiError(409, FAIL_MESSAGES.inactive, "INACTIVE_QR_CODE");
  }

  const eligibility = evaluateScanEligibility({
    row: qr,
    role,
    lastSuccessAt,
    successToday,
    priorEventSuccess,
  });

  if (!eligibility.allowed) {
    const message = scanFailureMessage(eligibility.reason ?? "invalid", qr);
    await insertScanLog({
      client: userClient,
      userId,
      qrCodeId: qr.id,
      xpAwarded: 0,
      status: "failed",
      failureReason: message,
      deviceHint: args.deviceHint,
    });
    void auditQrScanPatterns({
      adminClient: admin,
      userId,
      qrCodeId: qr.id,
      status: "failed",
      deviceHint: args.deviceHint,
      locationName: qr.location_name,
    });
    throw new ApiError(409, message, `QR_${(eligibility.reason ?? "invalid").toUpperCase()}`);
  }

  const xpAmount = Math.max(0, Number(qr.xp_reward ?? 0));
  const scanStatus: "success" | "admin_bypass" = eligibility.bypass ? "admin_bypass" : "success";

  let xpResult: Awaited<ReturnType<typeof addXpInternal>> | null = null;
  let levelBefore = 1;
  if (xpAmount > 0) {
    const { data: statsBefore } = await userClient
      .from("user_stats")
      .select("total_xp, level")
      .eq("user_id", userId)
      .single();
    levelBefore = Number(statsBefore?.level ?? 1);
    xpResult = await addXpInternal({
      userClient,
      userId,
      amount: xpAmount,
      sourceType: "activity",
      sourceId: qr.id,
      note: `CQ QR · ${qr.title}`,
      applyStreakUpdate: true,
    });
  } else {
    await userClient
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();
  }

  await insertScanLog({
    client: userClient,
    userId,
    qrCodeId: qr.id,
    xpAwarded: xpAmount,
    status: scanStatus,
    failureReason: eligibility.bypass ? "Admin bypass (audited)" : null,
    deviceHint: args.deviceHint,
  });

  const activityLink = resolveQrActivityLink({
    code: qr.code,
    activityName: qr.activity_name,
    locationName: qr.location_name,
  });

  let statBoost: { stat: string; statGain: number } | null = null;
  if (activityLink) {
    statBoost = (await applyQrActivityStatBoost({ userClient, userId, link: activityLink })) ?? null;
  }

  const questCompletion = await tryCompleteLinkedQuest({
    userClient,
    userId,
    questId: qr.quest_id,
  });

  const milestonesUnlocked =
    scanStatus === "success"
      ? await applyQrLocationMilestones({
          adminClient: admin,
          userId,
          qrCode: qr.code,
          locationName: qr.location_name,
        })
      : [];

  void auditQrScanPatterns({
    adminClient: admin,
    userId,
    qrCodeId: qr.id,
    status: scanStatus,
    deviceHint: args.deviceHint,
    locationName: qr.location_name,
  });

  const player = await getPlayerProgressSnapshot(userClient, userId);
  const leveledUp = xpResult ? player.progression.level > levelBefore : false;

  return {
    scan: {
      status: scanStatus,
      qrCodeId: qr.id,
      title: qr.title,
      description: qr.description,
      type: qr.type,
      locationName: qr.location_name,
      xpAwarded: xpAmount,
      bypassedLimits: eligibility.bypass,
      activityId: activityLink?.activityId ?? null,
      activityLabel: activityLink?.activityLabel ?? qr.activity_name ?? qr.title,
      statBoost,
    },
    xp: xpResult,
    quest: questCompletion,
    milestonesUnlocked,
    leveledUp,
    player,
  };
}
