import { ApiError } from "@/lib/server/http";
import { recordQrScanActivityEvent } from "@/lib/server/userActivityEvents";
import { canBypassQrScanLimits, fetchProfileRole, type ProfileRole } from "@/lib/server/permissions";
import { applyQrActivityStatBoost, resolveQrActivityLink } from "@/lib/server/qrActivityLink";
import { applyQrLocationMilestones } from "@/lib/server/qrMilestones";
import { normalizeQrCode, isUuidLike } from "@/lib/qrCodeExtract";
import { logQrScanServer } from "@/lib/server/qrScanServerLog";
import { auditQrScanPatterns } from "@/lib/server/qrSuspiciousActivity";
import {
  completeAdminQuestFromQr,
  isAdminQuestCurrentlyActive,
} from "@/lib/server/adminQuests";
import type { AdminQuestRow } from "@/lib/adminQuestTypes";
import { addXpInternal, completeQuest, getOrCreateActiveUserQuest, getPlayerProgressSnapshot } from "@/lib/server/services";
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
  admin_quest_id: string | null;
  location_name: string | null;
  activity_name: string | null;
  xp_reward: number;
  is_active: boolean;
  is_permanent: boolean;
  cooldown_hours: number;
  max_scans_per_day: number;
  requires_staff_approval: boolean;
  expires_at: string | null;
  starts_at: string | null;
  qr_type: string | null;
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
  // Postgres column errors also contain "does not exist" — do not treat those as missing tables.
  if (/column\s+.+\s+does not exist/i.test(msg)) return false;
  return (
    /(schema cache|Could not find the table)/i.test(msg) &&
    /(qr_codes|qr_scans)/i.test(msg)
  );
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function isMissingClaimDedupColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    /claim_utc_day|idempotency_key/i.test(msg) &&
    /(does not exist|Could not find the|schema cache)/i.test(msg)
  );
}

function utcClaimDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function insertScanLog(args: {
  client: SupabaseClientLike;
  userId: string;
  qrCodeId: string;
  xpAwarded: number;
  status: "success" | "failed" | "admin_bypass";
  failureReason?: string | null;
  deviceHint?: string | null;
  claimUtcDay?: string | null;
  idempotencyKey?: string | null;
}) {
  const row: Record<string, unknown> = {
    user_id: args.userId,
    qr_code_id: args.qrCodeId,
    xp_awarded: args.xpAwarded,
    status: args.status,
    failure_reason: args.failureReason ?? null,
    device_hint: args.deviceHint ?? null,
  };
  if (args.claimUtcDay) row.claim_utc_day = args.claimUtcDay;
  if (args.idempotencyKey) row.idempotency_key = args.idempotencyKey;

  const { error } = await args.client.from("qr_scans").insert(row);
  if (error) {
    throw new ApiError(400, error.message, "QR_SCAN_LOG_FAILED");
  }
}

/** Reserve a successful claim before XP is applied (prevents concurrent double-award). */
async function reserveSuccessScanClaim(args: {
  client: SupabaseClientLike;
  userId: string;
  qr: QrCodeRow;
  xpAmount: number;
  scanStatus: "success" | "admin_bypass";
  deviceHint?: string | null;
  idempotencyKey?: string | null;
}): Promise<string> {
  // Per-day dedup applies to student claims only; admins log unlimited admin_bypass rows.
  const claimUtcDay =
    args.scanStatus === "admin_bypass" || args.qr.max_scans_per_day <= 0
      ? null
      : utcClaimDay();

  const baseRow: Record<string, unknown> = {
    user_id: args.userId,
    qr_code_id: args.qr.id,
    xp_awarded: args.xpAmount,
    status: args.scanStatus,
    failure_reason: args.scanStatus === "admin_bypass" ? "Admin bypass (audited)" : null,
    device_hint: args.deviceHint ?? null,
  };

  const rowWithDedup: Record<string, unknown> = { ...baseRow };
  if (claimUtcDay) rowWithDedup.claim_utc_day = claimUtcDay;
  if (args.idempotencyKey) rowWithDedup.idempotency_key = args.idempotencyKey;

  let rowToInsert = rowWithDedup;
  let { data, error } = await args.client.from("qr_scans").insert(rowToInsert).select("id").single();

  if (error && isMissingClaimDedupColumnError(error)) {
    logQrScanServer("scan_log_dedup_columns_missing", {
      code: args.qr.code,
      hint: "Apply migration 20260605120000_qr_scan_claim_dedup.sql for DB-level duplicate protection.",
    });
    rowToInsert = baseRow;
    ({ data, error } = await args.client.from("qr_scans").insert(rowToInsert).select("id").single());
  }

  if (error) {
    if (isUniqueViolation(error)) {
      return "";
    }
    logQrScanServer("scan_log_failed", {
      code: args.qr.code,
      message: error.message,
      pgCode: error.code ?? null,
    });
    throw new ApiError(400, error.message, "QR_SCAN_LOG_FAILED");
  }
  if (!data?.id) {
    throw new ApiError(400, "QR scan log insert returned no row.", "QR_SCAN_LOG_FAILED");
  }
  return String(data.id);
}

async function deleteScanClaim(client: SupabaseClientLike, scanId: string) {
  await client.from("qr_scans").delete().eq("id", scanId);
}

function alreadyClaimedMessage(qr: QrCodeRow): string {
  if (isUriGymQr(qr)) {
    return "You already checked in at the URI Gym today. Come back tomorrow.";
  }
  return "You already claimed this QR reward.";
}

async function tryCompleteAdminLinkedQuest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  qr: QrCodeRow;
}) {
  if (!args.qr.admin_quest_id) return null;
  try {
    return await completeAdminQuestFromQr({
      userClient: args.userClient,
      userId: args.userId,
      adminQuestId: args.qr.admin_quest_id,
      qrCodeId: args.qr.id,
    });
  } catch (error) {
    logQrScanServer("admin_quest_complete_failed", {
      qrCodeId: args.qr.id,
      adminQuestId: args.qr.admin_quest_id,
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof ApiError ? error.code : null,
    });
    return null;
  }
}

async function tryCompleteLinkedQuest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  questId: string | null;
}) {
  const { userClient, userId, questId } = args;
  if (!questId) return null;

  const userQuest = await getOrCreateActiveUserQuest({ userClient, userId, questId });
  if (userQuest.status === "claimed") return null;

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

function isUriGymQr(qr: Pick<QrCodeRow, "code" | "location_name">): boolean {
  return (
    qr.code === "GYM" ||
    qr.code === "URI_GYM_CHECKIN_V1" ||
    /uri gym/i.test(qr.location_name ?? "")
  );
}

function scanFailureMessage(reason: ScanFailReason, qr: QrCodeRow): string {
  if (reason === "cooldown" && isUriGymQr(qr)) {
    return "You already checked in at the URI Gym today. Come back tomorrow.";
  }
  if (reason === "daily_limit" && isUriGymQr(qr)) {
    return "You already checked in at the URI Gym today. Come back tomorrow.";
  }
  return FAIL_MESSAGES[reason];
}

const QR_CODE_LOOKUP_SELECT =
  "id, code, title, description, type, qr_type, location_name, activity_name, xp_reward, is_active, is_permanent, cooldown_hours, max_scans_per_day, expires_at, starts_at, quest_id, admin_quest_id";

function codeLookupCandidates(code: string): string[] {
  const normalized = normalizeQrCode(code);
  const candidates = new Set<string>([normalized, code.trim()]);
  if (/^CQ_/i.test(normalized)) candidates.add(normalized.toUpperCase());
  if (/^cq_/i.test(normalized)) candidates.add(normalized.toLowerCase());
  return Array.from(candidates);
}

type QrLookupContext = {
  qr: QrCodeRow;
  lookupPath: string;
  adminQuest: AdminQuestRow | null;
};

async function fetchAdminQuestById(
  admin: SupabaseClientLike,
  adminQuestId: string,
): Promise<AdminQuestRow | null> {
  const { data, error } = await admin
    .from("admin_quests")
    .select("*")
    .eq("id", adminQuestId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return data ? (data as AdminQuestRow) : null;
}

async function lookupQrCodeRow(
  admin: SupabaseClientLike,
  rawCode: string,
): Promise<QrLookupContext | null> {
  const throwOnLookupError = (error: { message?: string; code?: string }) => {
    if (isMissingQrTablesError(error)) {
      throw new ApiError(
        503,
        "CampusQuest QR check-in is not set up on this database yet. Apply the latest Supabase migration (qr_tables_bootstrap), then try again.",
        "QR_TABLES_NOT_READY",
      );
    }
    if (/column\s+.+\s+does not exist/i.test(error.message ?? "")) {
      throw new ApiError(
        500,
        "CampusQuest QR check-in schema is out of date. Apply the latest Supabase migrations, then try again.",
        "QR_SCHEMA_OUT_OF_DATE",
      );
    }
    throw new ApiError(400, error.message ?? "QR lookup failed.", "QR_LOOKUP_FAILED");
  };

  for (const candidate of codeLookupCandidates(rawCode)) {
    const { data, error } = await admin
      .from("qr_codes")
      .select(QR_CODE_LOOKUP_SELECT)
      .eq("code", candidate)
      .maybeSingle();
    if (error) throwOnLookupError(error);
    if (data) {
      return {
        qr: mapQrCodeRow(data as Record<string, unknown>),
        lookupPath: `qr_codes.code:${candidate}`,
        adminQuest: null,
      };
    }
  }

  const idCandidate = normalizeQrCode(rawCode);
  if (!isUuidLike(idCandidate)) return null;
  const uuid = idCandidate.toLowerCase();

  const { data: byId, error: byIdError } = await admin
    .from("qr_codes")
    .select(QR_CODE_LOOKUP_SELECT)
    .eq("id", uuid)
    .maybeSingle();
  if (byIdError) throwOnLookupError(byIdError);
  if (byId) {
    return {
      qr: mapQrCodeRow(byId as Record<string, unknown>),
      lookupPath: "qr_codes.id",
      adminQuest: null,
    };
  }

  const adminQuest = await fetchAdminQuestById(admin, uuid);
  if (adminQuest?.qr_code_id) {
    const { data: linkedQr, error: linkedError } = await admin
      .from("qr_codes")
      .select(QR_CODE_LOOKUP_SELECT)
      .eq("id", adminQuest.qr_code_id)
      .maybeSingle();
    if (linkedError) throwOnLookupError(linkedError);
    if (linkedQr) {
      return {
        qr: mapQrCodeRow(linkedQr as Record<string, unknown>),
        lookupPath: "admin_quests.id->qr_codes",
        adminQuest,
      };
    }
  }

  const { data: byAdminQuestId, error: byAdminQuestError } = await admin
    .from("qr_codes")
    .select(QR_CODE_LOOKUP_SELECT)
    .eq("admin_quest_id", uuid)
    .maybeSingle();
  if (byAdminQuestError) throwOnLookupError(byAdminQuestError);
  if (byAdminQuestId) {
    return {
      qr: mapQrCodeRow(byAdminQuestId as Record<string, unknown>),
      lookupPath: "qr_codes.admin_quest_id",
      adminQuest: adminQuest ?? (await fetchAdminQuestById(admin, uuid)),
    };
  }

  const { data: byQuestId, error: byQuestError } = await admin
    .from("qr_codes")
    .select(QR_CODE_LOOKUP_SELECT)
    .eq("quest_id", uuid)
    .maybeSingle();
  if (byQuestError) throwOnLookupError(byQuestError);
  if (byQuestId) {
    return {
      qr: mapQrCodeRow(byQuestId as Record<string, unknown>),
      lookupPath: "qr_codes.quest_id",
      adminQuest: null,
    };
  }

  return null;
}

type QrOperationalRejectReason = "inactive" | "not_started" | "unavailable" | "not_linked";

export function evaluateQrOperationalStatus(args: {
  qr: QrCodeRow;
  adminQuest: AdminQuestRow | null;
  now?: Date;
}): { ok: true } | { ok: false; reason: QrOperationalRejectReason } {
  const now = args.now ?? new Date();

  if (args.qr.qr_type === "quest_completion" && !args.qr.admin_quest_id && !args.qr.quest_id) {
    return { ok: false, reason: "not_linked" };
  }

  if (args.adminQuest) {
    if (args.adminQuest.visibility_status !== "active" || args.adminQuest.deleted_at) {
      return { ok: false, reason: "inactive" };
    }
    if (args.adminQuest.starts_at && new Date(args.adminQuest.starts_at) > now) {
      return { ok: false, reason: "not_started" };
    }
    if (args.adminQuest.ends_at && new Date(args.adminQuest.ends_at) <= now) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true };
  }

  if (!args.qr.is_active) return { ok: false, reason: "inactive" };
  if (args.qr.starts_at && new Date(args.qr.starts_at) > now) {
    return { ok: false, reason: "not_started" };
  }
  if (args.qr.expires_at && new Date(args.qr.expires_at) <= now) {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

function effectiveQrRowForEligibility(qr: QrCodeRow, adminQuest: AdminQuestRow | null): QrCodeRow {
  if (!adminQuest || !isAdminQuestCurrentlyActive(adminQuest)) return qr;
  return {
    ...qr,
    is_active: true,
    starts_at: adminQuest.starts_at ?? qr.starts_at,
    expires_at: adminQuest.ends_at ?? qr.expires_at,
  };
}

function operationalRejectMessage(reason: QrOperationalRejectReason): string {
  switch (reason) {
    case "not_linked":
      return "This QR is not linked to a quest yet.";
    case "not_started":
    case "unavailable":
      return "Quest is not currently available.";
    case "inactive":
    default:
      return FAIL_MESSAGES.inactive;
  }
}

function operationalRejectCode(reason: QrOperationalRejectReason): string {
  switch (reason) {
    case "not_linked":
      return "QR_NOT_LINKED";
    case "not_started":
    case "unavailable":
      return "QUEST_UNAVAILABLE";
    case "inactive":
    default:
      return "INACTIVE_QR_CODE";
  }
}

function mapQrCodeRow(row: Record<string, unknown>): QrCodeRow {
  return {
    id: String(row.id),
    code: String(row.code),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    type: String(row.type),
    event_id: (row.event_id as string | null) ?? null,
    quest_id: (row.quest_id as string | null) ?? null,
    admin_quest_id: (row.admin_quest_id as string | null) ?? null,
    location_name: (row.location_name as string | null) ?? null,
    activity_name: (row.activity_name as string | null) ?? null,
    xp_reward: Number(row.xp_reward ?? 0),
    is_active: Boolean(row.is_active),
    is_permanent: Boolean(row.is_permanent),
    cooldown_hours: Number(row.cooldown_hours ?? 0),
    max_scans_per_day: Number(row.max_scans_per_day ?? 0),
    requires_staff_approval: Boolean(row.requires_staff_approval ?? false),
    expires_at: (row.expires_at as string | null) ?? null,
    starts_at: (row.starts_at as string | null) ?? null,
    qr_type: (row.qr_type as string | null) ?? null,
  };
}

/** Cooldown / daily caps for students only (admins test with unlimited scans). */
export function isDuplicateQrClaim(args: {
  row: QrCodeRow;
  lastSuccessAt: string | null;
  successToday: number;
  priorEventSuccess: boolean;
}): ScanFailReason | null {
  const { row, lastSuccessAt, successToday, priorEventSuccess } = args;
  if (row.type === "event" && priorEventSuccess) return "already_redeemed";
  if (lastSuccessAt && row.cooldown_hours > 0) {
    const nextAllowed = new Date(lastSuccessAt).getTime() + row.cooldown_hours * 60 * 60 * 1000;
    if (Date.now() < nextAllowed) return "cooldown";
  }
  if (row.max_scans_per_day > 0 && successToday >= row.max_scans_per_day) {
    return "daily_limit";
  }
  return null;
}

export function evaluateScanEligibility(args: {
  row: QrCodeRow;
  role: ProfileRole;
  lastSuccessAt: string | null;
  successToday: number;
  priorEventSuccess: boolean;
}): { allowed: boolean; reason?: ScanFailReason; bypass: boolean } {
  const { row, role, lastSuccessAt, successToday, priorEventSuccess } = args;
  const operationalBypass = canBypassQrScanLimits(role);

  if (operationalBypass) {
    return { allowed: true, bypass: true };
  }

  const duplicateReason = isDuplicateQrClaim({
    row,
    lastSuccessAt,
    successToday,
    priorEventSuccess,
  });
  if (duplicateReason) {
    return { allowed: false, reason: duplicateReason, bypass: false };
  }

  if (!row.is_active) return { allowed: false, reason: "inactive", bypass: false };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { allowed: false, reason: "expired", bypass: false };
  }
  if (row.requires_staff_approval) {
    return { allowed: false, reason: "staff_approval", bypass: false };
  }

  return { allowed: true, bypass: false };
}

export async function scanCampusQuestQrCode(args: {
  userClient: SupabaseClientLike;
  userId: string;
  code: string;
  deviceHint?: string | null;
  idempotencyKey?: string | null;
  userEmail?: string | null;
}) {
  const { userClient, userId } = args;
  const code = normalizeQrCode(args.code);
  logQrScanServer("validation_request", { code, userId: userId.slice(0, 8) });

  if (!code || code.length > 128) {
    throw new ApiError(400, FAIL_MESSAGES.invalid, "INVALID_QR_CODE");
  }

  const admin = createAdminClient();
  const role = await fetchProfileRole(userClient, userId, { email: args.userEmail });

  let lookupCtx = await lookupQrCodeRow(admin, code);

  logQrScanServer("supabase_lookup", {
    code,
    found: Boolean(lookupCtx),
    lookupPath: lookupCtx?.lookupPath ?? null,
  });

  if (!lookupCtx) {
    logQrScanServer("validation_rejected", {
      code,
      reason: "not_found",
    });
    throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");
  }

  const qr = lookupCtx.qr;
  let adminQuest = lookupCtx.adminQuest;
  if (!adminQuest && qr.admin_quest_id) {
    adminQuest = await fetchAdminQuestById(admin, qr.admin_quest_id);
  }

  logQrScanServer("validation_match", {
    code,
    lookupPath: lookupCtx.lookupPath,
    qrCodeId: qr.id,
    qrCode: qr.code,
    qrIsActive: qr.is_active,
    adminQuestId: qr.admin_quest_id,
    questId: qr.quest_id,
    adminQuestVisibility: adminQuest?.visibility_status ?? null,
    adminQuestActive: adminQuest ? isAdminQuestCurrentlyActive(adminQuest) : null,
  });

  const operational = evaluateQrOperationalStatus({ qr, adminQuest });
  if (!operational.ok && !canBypassQrScanLimits(role)) {
    const message = operationalRejectMessage(operational.reason);
    logQrScanServer("validation_rejected", {
      code: qr.code,
      reason: operational.reason,
      qrIsActive: qr.is_active,
      adminQuestVisibility: adminQuest?.visibility_status ?? null,
    });
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
    throw new ApiError(409, message, operationalRejectCode(operational.reason));
  }

  const eligibilityQr = effectiveQrRowForEligibility(qr, adminQuest);

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

  const eligibility = evaluateScanEligibility({
    row: eligibilityQr,
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
    const reason = eligibility.reason ?? "invalid";
    const code =
      reason === "cooldown" || reason === "daily_limit" || reason === "already_redeemed"
        ? "ALREADY_CLAIMED"
        : `QR_${reason.toUpperCase()}`;
    throw new ApiError(409, message, code);
  }

  const xpAmount = qr.admin_quest_id ? 0 : Math.max(0, Number(qr.xp_reward ?? 0));
  const scanStatus: "success" | "admin_bypass" = eligibility.bypass ? "admin_bypass" : "success";

  const { data: statsBeforeScan } = await userClient
    .from("user_stats")
    .select("total_xp, level")
    .eq("user_id", userId)
    .single();
  const levelBefore = Number(statsBeforeScan?.level ?? 1);

  const claimId = await reserveSuccessScanClaim({
    client: admin,
    userId,
    qr,
    xpAmount,
    scanStatus,
    deviceHint: args.deviceHint,
    idempotencyKey: args.idempotencyKey ?? null,
  });

  if (!claimId) {
    logQrScanServer("duplicate_blocked", {
      code: qr.code,
      userId: userId.slice(0, 8),
      idempotencyKey: args.idempotencyKey ?? null,
      adminBypass: eligibility.bypass,
    });
    throw new ApiError(409, alreadyClaimedMessage(qr), "ALREADY_CLAIMED");
  }

  let xpResult: Awaited<ReturnType<typeof addXpInternal>> | null = null;
  try {
    if (xpAmount > 0) {
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
  } catch (xpError) {
    await deleteScanClaim(admin, claimId);
    throw xpError;
  }

  const activityLink = resolveQrActivityLink({
    code: qr.code,
    activityName: qr.activity_name,
    locationName: qr.location_name,
  });

  let statBoost: { stat: string; statGain: number } | null = null;
  if (activityLink) {
    try {
      statBoost = (await applyQrActivityStatBoost({ userClient, userId, link: activityLink })) ?? null;
    } catch (statError) {
      logQrScanServer("stat_boost_failed", {
        code: qr.code,
        message: statError instanceof Error ? statError.message : String(statError),
      });
    }
  }

  const adminQuestCompletion = await tryCompleteAdminLinkedQuest({
    userClient,
    userId,
    qr,
  });

  const questCompletion = adminQuestCompletion
    ? null
    : await tryCompleteLinkedQuest({
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
  const leveledUp = player.progression.level > levelBefore;

  const questXpAwarded = adminQuestCompletion?.xpResult
    ? Math.max(0, Number(adminQuestCompletion.quest.xp_reward ?? 0))
    : questCompletion?.xp
      ? Math.max(0, Number(questCompletion.xp.xpLog?.xp_amount ?? 0))
      : 0;
  const totalXpAwarded = xpAmount + questXpAwarded;

  const questCompleted = adminQuestCompletion?.quest
    ? {
        questId: String(adminQuestCompletion.quest.id),
        questName: String(adminQuestCompletion.quest.name ?? qr.title),
        icon: String(adminQuestCompletion.quest.icon ?? "🎯"),
        xpReward: questXpAwarded,
      }
    : questCompletion
      ? {
          questId: String(questCompletion.completion.quest_id),
          questName: qr.title,
          icon: "🎯",
          xpReward: questXpAwarded,
        }
      : null;

  logQrScanServer("validation_response", {
    ok: true,
    code: qr.code,
    xpAwarded: totalXpAwarded,
    scanXp: xpAmount,
    questXp: questXpAwarded,
    activityId: activityLink?.activityId ?? null,
    statBoost,
    leveledUp,
    questCompleted: Boolean(questCompleted),
  });

  try {
    await recordQrScanActivityEvent({
      client: userClient,
      userId,
      questCompleted,
      locationName: qr.location_name,
      qrTitle: qr.title,
      totalXpAwarded,
      qrCodeId: qr.id,
      questId: questCompleted?.questId ?? qr.quest_id ?? null,
      locationId: (qr as { location_id?: string | null }).location_id ?? null,
    });
  } catch (activityError) {
    logQrScanServer("activity_event_failed", {
      code: qr.code,
      message: activityError instanceof Error ? activityError.message : String(activityError),
    });
  }

  return {
    scan: {
      status: scanStatus,
      qrCodeId: qr.id,
      title: qr.title,
      description: qr.description,
      type: qr.type,
      locationName: qr.location_name,
      xpAwarded: totalXpAwarded,
      bypassedLimits: eligibility.bypass,
      activityId: activityLink?.activityId ?? null,
      activityLabel: activityLink?.activityLabel ?? qr.activity_name ?? qr.title,
      statBoost,
    },
    xp: xpResult,
    quest: questCompletion,
    questCompleted,
    milestonesUnlocked,
    leveledUp,
    player,
    totalXpAwarded,
  };
}
