import { ApiError } from "@/lib/server/http";
import { logAdminAuditAction } from "@/lib/server/audit";
import { addXpInternal } from "@/lib/server/services";
import { createAdminClient } from "@/lib/server/supabase";
import { buildQuestCompletionQrInput, createQrCodeAdmin } from "@/lib/server/qrCodeAdmin";
import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { isExpiredAt, locationFieldsFromInput, mapPercentForCoordinates, type CampusMapPin } from "@/lib/server/campusMapPins";
import { resolveRealmLocationIdFromFields } from "@/lib/locations/resolveRealmLocationId";
import { normalizeCreateQrCodeInput } from "@/lib/server/qrCodeInput";
import type {
  AdminQuestAnalytics,
  AdminQuestCompletionMethod,
  AdminQuestFilter,
  AdminQuestLinkedQr,
  AdminQuestRow,
  AdminQuestVisibility,
  UserQuestBoardItem,
} from "@/lib/adminQuestTypes";
import {
  adminQuestRequiresQrScan,
  verifiedQuestCompletions,
} from "@/lib/adminQuestQr";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type SupabaseErrorLike = { message?: string; code?: string };

export const ADMIN_QUESTS_SCHEMA_MISSING_MESSAGE =
  "admin_quests table is missing. Run the quest system migration.";

export function isAdminQuestsSchemaError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  if (msg.includes("schema cache") && msg.includes("could not find")) return true;
  return (
    (msg.includes("admin_quests") || msg.includes("admin_quest_completions")) &&
    (msg.includes("schema cache") || msg.includes("could not find") || msg.includes("does not exist"))
  );
}

export function throwIfAdminQuestsSchemaError(
  error: SupabaseErrorLike | null | undefined,
  code = "ADMIN_QUESTS_SCHEMA_MISSING",
): void {
  if (isAdminQuestsSchemaError(error)) {
    throw new ApiError(503, ADMIN_QUESTS_SCHEMA_MISSING_MESSAGE, code);
  }
}

function isAdminQuestsSchemaErrorFromUnknown(error: unknown): boolean {
  if (error instanceof ApiError) {
    return isAdminQuestsSchemaError({ message: error.message, code: error.code });
  }
  if (error && typeof error === "object" && "message" in error) {
    const maybe = error as { message?: string; code?: string };
    return isAdminQuestsSchemaError(maybe);
  }
  return false;
}

const EMPTY_ADMIN_QUEST_ANALYTICS: AdminQuestAnalytics = {
  totalCompletions: 0,
  uniqueUsers: 0,
  totalXpAwarded: 0,
  completionRate: 0,
  activeProgressCount: 0,
  qrScans: 0,
};

function utcDayString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function weekStartDayString(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

export function isAdminQuestCurrentlyActive(quest: AdminQuestRow, now = new Date()): boolean {
  if (quest.visibility_status !== "active" || quest.deleted_at) return false;
  if (quest.starts_at && new Date(quest.starts_at) > now) return false;
  if (quest.ends_at && new Date(quest.ends_at) <= now) return false;
  return true;
}

export function deriveAdminQuestStatus(
  quest: AdminQuestRow,
  completions: { status: string; completion_day: string | null; completion_method?: string | null }[],
): UserQuestBoardItem["status"] {
  const now = new Date();
  const qrRequired = adminQuestRequiresQrScan(quest);
  const verified = verifiedQuestCompletions(quest, completions);
  const defaultOpenStatus: UserQuestBoardItem["status"] = qrRequired ? "available" : "ready";

  if (!isAdminQuestCurrentlyActive(quest, now)) {
    if (verified.some((c) => c.status === "completed")) return "completed";
    return "available";
  }

  const latestPending = completions.find((c) => c.status === "pending");
  if (latestPending) return "pending";

  if (quest.repeat_limit === "unlimited") return defaultOpenStatus;

  if (quest.repeat_limit === "once_per_user") {
    if (verified.some((c) => c.status === "completed")) return "completed";
    return defaultOpenStatus;
  }

  if (quest.repeat_limit === "once_per_day") {
    const today = utcDayString(now);
    if (verified.some((c) => c.status === "completed" && c.completion_day === today)) return "completed";
    return defaultOpenStatus;
  }

  if (quest.repeat_limit === "once_per_week") {
    const weekStart = weekStartDayString(now);
    if (
      verified.some(
        (c) => c.status === "completed" && c.completion_day && c.completion_day >= weekStart,
      )
    ) {
      return "completed";
    }
    return defaultOpenStatus;
  }

  return verified.some((c) => c.status === "completed") ? "completed" : defaultOpenStatus;
}

function canClaimAdminQuest(quest: AdminQuestRow, status: UserQuestBoardItem["status"]): boolean {
  if (!isAdminQuestCurrentlyActive(quest)) return false;
  if (status === "completed" || status === "pending") return false;
  if (adminQuestRequiresQrScan(quest)) return false;
  if (quest.completion_method === "admin_approval") return true;
  return status === "ready" || status === "available";
}

export function mapAdminQuestToBoardItem(
  quest: AdminQuestRow,
  completions: { status: string; completion_day: string | null }[],
): UserQuestBoardItem {
  const status = deriveAdminQuestStatus(quest, completions);
  const completed = status === "completed";
  return {
    id: quest.id,
    source: "admin",
    name: quest.name,
    description: quest.description,
    xpReward: quest.xp_reward,
    difficulty: quest.difficulty,
    questType: quest.quest_type,
    icon: quest.icon ?? "🎯",
    requiresQr: quest.requires_qr,
    completionMethod: quest.completion_method,
    locationName: quest.location_name,
    locationId: resolveRealmLocationIdFromFields({
      locationId: quest.location_id,
      locationKey: quest.location_key,
    }),
    locationLat: quest.location_lat,
    locationLng: quest.location_lng,
    status,
    progress: {
      current: completed ? 1 : status === "pending" ? 0 : 0,
      max: 1,
      percent: completed ? 100 : status === "pending" ? 0 : 0,
    },
    startsAt: quest.starts_at,
    endsAt: quest.ends_at,
    repeatType: quest.repeat_type,
    canClaim: canClaimAdminQuest(quest, status),
    qrCodeId: quest.qr_code_id,
  };
}

export async function listActiveAdminQuestsForUser(userId: string): Promise<AdminQuestRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_quests")
    .select("*")
    .eq("visibility_status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (isAdminQuestsSchemaError(error)) {
      console.warn("[cq][admin-quests] admin_quests table missing; returning empty quest list");
      return [];
    }
    throw new ApiError(400, error.message, "ADMIN_QUESTS_FETCH_FAILED");
  }
  const now = new Date();
  return (data ?? []).filter((row) => isAdminQuestCurrentlyActive(row as AdminQuestRow, now)) as AdminQuestRow[];
}

export async function fetchUserAdminQuestCompletions(userId: string, questIds: string[]) {
  if (questIds.length === 0) {
    return new Map<string, { status: string; completion_day: string | null; completion_method: string | null }[]>();
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_quest_completions")
    .select("quest_id, status, completion_day, completion_method, completed_at")
    .eq("user_id", userId)
    .in("quest_id", questIds)
    .order("completed_at", { ascending: false });
  if (error) {
    if (isAdminQuestsSchemaError(error)) {
      console.warn("[cq][admin-quests] admin_quest_completions table missing; returning empty completions");
      return new Map();
    }
    throw new ApiError(400, error.message, "ADMIN_QUEST_COMPLETIONS_FETCH_FAILED");
  }
  const map = new Map<string, { status: string; completion_day: string | null; completion_method: string | null }[]>();
  for (const row of data ?? []) {
    const list = map.get(row.quest_id) ?? [];
    list.push({
      status: row.status,
      completion_day: row.completion_day,
      completion_method: row.completion_method ?? null,
    });
    map.set(row.quest_id, list);
  }
  return map;
}

export async function buildUserQuestBoardAdminItems(userId: string): Promise<UserQuestBoardItem[]> {
  const quests = await listActiveAdminQuestsForUser(userId);
  const completionMap = await fetchUserAdminQuestCompletions(
    userId,
    quests.map((q) => q.id),
  );
  return quests.map((quest) => mapAdminQuestToBoardItem(quest, completionMap.get(quest.id) ?? []));
}

export async function safeBuildUserQuestBoardAdminItems(userId: string): Promise<UserQuestBoardItem[]> {
  try {
    return await buildUserQuestBoardAdminItems(userId);
  } catch (error) {
    if (isAdminQuestsSchemaErrorFromUnknown(error)) {
      console.warn("[cq][admin-quests] schema unavailable; returning empty quest board");
      return [];
    }
    throw error;
  }
}

export function filterUserQuestBoardItems(
  items: UserQuestBoardItem[],
  filter: AdminQuestFilter,
  opts?: { userLat?: number; userLng?: number; locationId?: string },
): UserQuestBoardItem[] {
  let result = items;
  if (opts?.locationId) {
    result = result.filter((item) => item.locationId === opts.locationId);
  }
  if (filter === "all") return result;
  if (filter === "daily") return result.filter((i) => i.source === "daily" || i.questType === "daily" || i.repeatType === "daily");
  if (filter === "qr") return result.filter((i) => i.requiresQr || i.completionMethod === "qr_scan");
  if (filter === "active") return result.filter((i) => i.status === "available" || i.status === "ready" || i.status === "active");
  if (filter === "completed") return result.filter((i) => i.status === "completed");
  if (filter === "nearby") {
    const { userLat, userLng } = opts ?? {};
    if (userLat == null || userLng == null) {
      return result.filter((i) => i.locationLat != null && i.locationLng != null);
    }
    return result
      .filter((i) => i.locationLat != null && i.locationLng != null)
      .sort((a, b) => {
        const da = haversineKm(userLat, userLng, a.locationLat!, a.locationLng!);
        const db = haversineKm(userLat, userLng, b.locationLat!, b.locationLng!);
        return da - db;
      });
  }
  return result;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type CreateAdminQuestInput = {
  name: string;
  description: string;
  xpReward: number;
  difficulty: AdminQuestRow["difficulty"];
  questType: AdminQuestRow["quest_type"];
  locationName?: string | null;
  locationKey?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  mapPinX?: number | null;
  mapPinY?: number | null;
  requiresQr?: boolean;
  completionMethod: AdminQuestCompletionMethod;
  visibilityStatus?: AdminQuestVisibility;
  startsAt?: string;
  endsAt?: string;
  activeDurationMinutes?: number;
  repeatType?: AdminQuestRow["repeat_type"];
  repeatLimit?: AdminQuestRow["repeat_limit"];
  isRepeatable?: boolean;
  expiresAutomatically?: boolean;
  icon?: string;
  imageUrl?: string;
  organizationId?: string;
  eventId?: string;
};

function resolveEndsAt(input: CreateAdminQuestInput): string | null {
  if (input.endsAt) return input.endsAt;
  if (input.startsAt && input.activeDurationMinutes) {
    return new Date(new Date(input.startsAt).getTime() + input.activeDurationMinutes * 60_000).toISOString();
  }
  return null;
}

export async function createAdminQuest(args: {
  input: CreateAdminQuestInput;
  createdBy: string;
  createdByEmail?: string;
}) {
  const admin = createAdminClient();
  await getCampusLocations({ client: admin, refreshCache: true });
  const requiresQr =
    args.input.requiresQr != null
      ? args.input.requiresQr
      : args.input.completionMethod === "qr_scan" || args.input.questType === "qr";
  const location = locationFieldsFromInput(args.input as Record<string, unknown>);
  const locationId = resolveRealmLocationIdFromFields({
    locationKey: location.locationKey,
    locationId: (args.input as { locationId?: string }).locationId,
  });
  const row = {
    name: args.input.name.trim(),
    description: args.input.description.trim(),
    xp_reward: args.input.xpReward,
    difficulty: args.input.difficulty,
    quest_type: args.input.questType,
    location_id: locationId,
    location_key: location.locationKey,
    location_name: location.locationName,
    location_address: location.locationAddress,
    location_lat: location.locationLat,
    location_lng: location.locationLng,
    map_pin_x: location.mapPinX ?? args.input.mapPinX ?? (location.locationLat != null ? 50 : null),
    map_pin_y: location.mapPinY ?? args.input.mapPinY ?? (location.locationLat != null ? 50 : null),
    requires_qr: requiresQr,
    completion_method: args.input.completionMethod,
    visibility_status: args.input.visibilityStatus ?? "draft",
    starts_at: args.input.startsAt ?? null,
    ends_at: resolveEndsAt(args.input),
    active_duration_minutes: args.input.activeDurationMinutes ?? null,
    repeat_type: args.input.repeatType ?? "one_time",
    repeat_limit: args.input.repeatLimit ?? "once_per_user",
    is_repeatable: args.input.isRepeatable ?? false,
    expires_automatically: args.input.expiresAutomatically ?? true,
    icon: args.input.icon ?? null,
    image_url: args.input.imageUrl ?? null,
    organization_id: args.input.organizationId ?? null,
    event_id: args.input.eventId ?? null,
    created_by: args.createdBy,
  };

  const { data, error } = await admin.from("admin_quests").insert(row).select("*").single();
  if (error) throwIfAdminQuestsSchemaError(error);
  if (error || !data) throw new ApiError(400, error?.message ?? "Create failed.", "ADMIN_QUEST_CREATE_FAILED");

  let quest = data as AdminQuestRow;
  let qrMeta: { qrCodeId: string; scanUrl: string; code: string } | null = null;
  let qrError: string | null = null;
  if (requiresQr) {
    try {
      const qrInput = normalizeCreateQrCodeInput(
        buildQuestCompletionQrInput({ quest }),
      );
      const qrResult = await createQrCodeAdmin({ input: qrInput, createdBy: args.createdBy });
      qrMeta = {
        qrCodeId: String(qrResult.row.id),
        scanUrl: qrResult.scanUrl,
        code: String(qrResult.row.code),
      };
      const { data: linkedQuest } = await admin
        .from("admin_quests")
        .select("*")
        .eq("id", quest.id)
        .maybeSingle();
      if (linkedQuest) quest = linkedQuest as AdminQuestRow;
    } catch (qrErr) {
      qrError =
        qrErr instanceof ApiError
          ? qrErr.message
          : qrErr instanceof Error
            ? qrErr.message
            : "QR code could not be created.";
      console.error("[cq][admin-quests] quest QR creation failed", {
        questId: quest.id,
        message: qrError,
      });
      if (quest.visibility_status !== "draft") {
        const { data: draftQuest } = await admin
          .from("admin_quests")
          .update({ visibility_status: "draft" })
          .eq("id", quest.id)
          .select("*")
          .maybeSingle();
        if (draftQuest) quest = draftQuest as AdminQuestRow;
      }
    }
  }

  await logAdminAuditAction({
    actionType: "admin_quest_created",
    adminUserId: args.createdBy,
    adminEmail: args.createdByEmail ?? null,
    metadata: { questId: quest.id, name: quest.name, qrError },
  });

  return { quest, qr: qrMeta, qrError };
}

export type UpdateAdminQuestResult = {
  quest: AdminQuestRow;
  qr: { qrCodeId: string; scanUrl: string; code: string } | null;
  qrError: string | null;
  linkedQr: AdminQuestLinkedQr | null;
};

async function fetchLinkedQrRow(
  admin: SupabaseClientLike,
  qrCodeId: string | null,
): Promise<AdminQuestLinkedQr | null> {
  if (!qrCodeId) return null;
  const { data } = await admin
    .from("qr_codes")
    .select("id, code, image_url, qr_png_url, metadata")
    .eq("id", qrCodeId)
    .maybeSingle();
  return data ? (data as AdminQuestLinkedQr) : null;
}

async function ensureQuestLinkedQr(args: {
  admin: SupabaseClientLike;
  quest: AdminQuestRow;
  createdBy: string;
}): Promise<{ quest: AdminQuestRow; qr: { qrCodeId: string; scanUrl: string; code: string } | null; qrError: string | null }> {
  const requiresQr =
    args.quest.requires_qr || args.quest.completion_method === "qr_scan" || args.quest.quest_type === "qr";
  if (!requiresQr || args.quest.qr_code_id) {
    return { quest: args.quest, qr: null, qrError: null };
  }

  try {
    const qrInput = normalizeCreateQrCodeInput(buildQuestCompletionQrInput({ quest: args.quest }));
    const qrResult = await createQrCodeAdmin({ input: qrInput, createdBy: args.createdBy });
    const { data: linkedQuest } = await args.admin
      .from("admin_quests")
      .select("*")
      .eq("id", args.quest.id)
      .maybeSingle();
    return {
      quest: (linkedQuest ?? args.quest) as AdminQuestRow,
      qr: {
        qrCodeId: String(qrResult.row.id),
        scanUrl: qrResult.scanUrl,
        code: String(qrResult.row.code),
      },
      qrError: null,
    };
  } catch (qrErr) {
    const qrError =
      qrErr instanceof ApiError
        ? qrErr.message
        : qrErr instanceof Error
          ? qrErr.message
          : "QR code could not be created.";
    console.error("[cq][admin-quests] quest QR creation failed on update", {
      questId: args.quest.id,
      message: qrError,
    });
    return { quest: args.quest, qr: null, qrError };
  }
}

export async function updateAdminQuest(args: {
  questId: string;
  patch: Partial<CreateAdminQuestInput>;
  adminUserId: string;
  adminEmail?: string;
}): Promise<UpdateAdminQuestResult> {
  const admin = createAdminClient();
  await getCampusLocations({ client: admin, refreshCache: true });
  const patch: Record<string, unknown> = {};
  const p = args.patch;
  if (p.name != null) patch.name = p.name.trim();
  if (p.description != null) patch.description = p.description.trim();
  if (p.xpReward != null) patch.xp_reward = p.xpReward;
  if (p.difficulty != null) patch.difficulty = p.difficulty;
  if (p.questType != null) patch.quest_type = p.questType;
  if (p.locationName !== undefined) patch.location_name = p.locationName?.trim() || null;
  if (p.locationKey !== undefined) patch.location_key = p.locationKey || null;
  if (p.locationAddress !== undefined) patch.location_address = p.locationAddress?.trim() || null;
  if (p.locationLat !== undefined) patch.location_lat = p.locationLat ?? null;
  if (p.locationLng !== undefined) patch.location_lng = p.locationLng ?? null;
  if (p.locationKey !== undefined || p.locationName !== undefined || p.locationLat !== undefined || p.locationLng !== undefined) {
    const location = locationFieldsFromInput({
      locationKey: p.locationKey,
      locationName: p.locationName,
      locationAddress: p.locationAddress,
      locationLat: p.locationLat,
      locationLng: p.locationLng,
    });
    patch.location_key = location.locationKey;
    patch.location_name = location.locationName;
    patch.location_address = location.locationAddress;
    patch.location_lat = location.locationLat;
    patch.location_lng = location.locationLng;
    patch.map_pin_x = location.mapPinX;
    patch.map_pin_y = location.mapPinY;
    patch.location_id = resolveRealmLocationIdFromFields({
      locationKey: location.locationKey,
      locationId: (p as { locationId?: string }).locationId,
    });
  } else {
    if (p.mapPinX !== undefined) patch.map_pin_x = p.mapPinX ?? null;
    if (p.mapPinY !== undefined) patch.map_pin_y = p.mapPinY ?? null;
  }
  if (p.requiresQr != null) patch.requires_qr = p.requiresQr;
  if (p.completionMethod != null) patch.completion_method = p.completionMethod;
  if (p.visibilityStatus != null) patch.visibility_status = p.visibilityStatus;
  if (p.startsAt !== undefined) patch.starts_at = p.startsAt ?? null;
  if (p.endsAt !== undefined) patch.ends_at = p.endsAt ?? null;
  if (p.activeDurationMinutes !== undefined) patch.active_duration_minutes = p.activeDurationMinutes ?? null;
  if (p.repeatType != null) patch.repeat_type = p.repeatType;
  if (p.repeatLimit != null) patch.repeat_limit = p.repeatLimit;
  if (p.isRepeatable != null) patch.is_repeatable = p.isRepeatable;
  if (p.expiresAutomatically != null) patch.expires_automatically = p.expiresAutomatically;
  if (p.icon !== undefined) patch.icon = p.icon ?? null;
  if (p.imageUrl !== undefined) patch.image_url = p.imageUrl ?? null;
  if (p.organizationId !== undefined) patch.organization_id = p.organizationId ?? null;
  if (p.eventId !== undefined) patch.event_id = p.eventId ?? null;

  const { data, error } = await admin
    .from("admin_quests")
    .update(patch)
    .eq("id", args.questId)
    .is("deleted_at", null)
    .select("*")
    .single();
  if (error || !data) throw new ApiError(404, "Quest not found.", "ADMIN_QUEST_NOT_FOUND");

  if (data.qr_code_id) {
    await admin
      .from("qr_codes")
      .update({
        title: data.name,
        description: data.description,
        xp_reward: data.xp_reward,
        is_active: data.visibility_status === "active",
        expires_at: data.ends_at,
        location_key: data.location_key,
        location_name: data.location_name,
        location_address: data.location_address,
        location_lat: data.location_lat,
        location_lng: data.location_lng,
      })
      .eq("id", data.qr_code_id);
  }

  let quest = data as AdminQuestRow;
  const ensured = await ensureQuestLinkedQr({ admin, quest, createdBy: args.adminUserId });
  quest = ensured.quest;

  await logAdminAuditAction({
    actionType: "admin_quest_updated",
    adminUserId: args.adminUserId,
    adminEmail: args.adminEmail ?? null,
    metadata: { questId: args.questId, qrError: ensured.qrError },
  });

  return { quest, qr: ensured.qr, qrError: ensured.qrError, linkedQr: await fetchLinkedQrRow(admin, quest.qr_code_id) };
}

export async function generateQuestQrAdmin(args: {
  questId: string;
  createdBy: string;
  origin?: string;
}): Promise<UpdateAdminQuestResult> {
  const admin = createAdminClient();
  const { data: questRow, error } = await admin
    .from("admin_quests")
    .select("*")
    .eq("id", args.questId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !questRow) throw new ApiError(404, "Quest not found.", "ADMIN_QUEST_NOT_FOUND");

  const quest = questRow as AdminQuestRow;
  const requiresQr =
    quest.requires_qr || quest.completion_method === "qr_scan" || quest.quest_type === "qr";
  if (!requiresQr) {
    throw new ApiError(400, "This quest does not require a QR code.", "QUEST_QR_NOT_REQUIRED");
  }

  const ensured = await ensureQuestLinkedQr({ admin, quest, createdBy: args.createdBy });
  const linkedQuest = ensured.quest;
  const linkedQr = await fetchLinkedQrRow(admin, linkedQuest.qr_code_id);

  await logAdminAuditAction({
    actionType: "admin_quest_qr_generated",
    adminUserId: args.createdBy,
    adminEmail: null,
    metadata: { questId: args.questId, qrCodeId: linkedQuest.qr_code_id, qrError: ensured.qrError },
  });

  return {
    quest: linkedQuest,
    qr: ensured.qr,
    qrError: ensured.qrError,
    linkedQr,
  };
}

export async function setAdminQuestVisibility(args: {
  questId: string;
  visibilityStatus: AdminQuestVisibility;
  adminUserId: string;
  adminEmail?: string;
}) {
  const { quest } = await updateAdminQuest({
    questId: args.questId,
    patch: { visibilityStatus: args.visibilityStatus },
    adminUserId: args.adminUserId,
    adminEmail: args.adminEmail,
  });
  if (quest.qr_code_id) {
    const admin = createAdminClient();
    await admin
      .from("qr_codes")
      .update({ is_active: args.visibilityStatus === "active" })
      .eq("id", quest.qr_code_id);
  }
  return quest;
}

export async function softDeleteAdminQuest(args: {
  questId: string;
  hardDelete?: boolean;
  adminUserId: string;
  adminEmail?: string;
}) {
  const admin = createAdminClient();
  if (args.hardDelete) {
    const { error } = await admin.from("admin_quests").delete().eq("id", args.questId);
    if (error) throw new ApiError(400, error.message, "ADMIN_QUEST_DELETE_FAILED");
  } else {
    const { error } = await admin
      .from("admin_quests")
      .update({ visibility_status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", args.questId);
    if (error) throw new ApiError(400, error.message, "ADMIN_QUEST_DELETE_FAILED");
    const { data: quest } = await admin.from("admin_quests").select("qr_code_id").eq("id", args.questId).maybeSingle();
    if (quest?.qr_code_id) {
      await admin.from("qr_codes").update({ is_active: false }).eq("id", quest.qr_code_id);
    }
  }
  await logAdminAuditAction({
    actionType: "admin_quest_deleted",
    adminUserId: args.adminUserId,
    adminEmail: args.adminEmail ?? null,
    metadata: { questId: args.questId, hardDelete: Boolean(args.hardDelete) },
  });
  return { deleted: true as const };
}

export async function duplicateAdminQuest(args: {
  questId: string;
  adminUserId: string;
  adminEmail?: string;
}) {
  const admin = createAdminClient();
  const { data: source, error } = await admin.from("admin_quests").select("*").eq("id", args.questId).maybeSingle();
  if (error || !source) throw new ApiError(404, "Quest not found.", "ADMIN_QUEST_NOT_FOUND");

  const result = await createAdminQuest({
    input: {
      name: `${source.name} (Copy)`,
      description: source.description,
      xpReward: source.xp_reward,
      difficulty: source.difficulty,
      questType: source.quest_type,
      locationKey: source.location_key ?? undefined,
      locationName: source.location_name ?? undefined,
      locationAddress: source.location_address ?? undefined,
      locationLat: source.location_lat ?? undefined,
      locationLng: source.location_lng ?? undefined,
      mapPinX: source.map_pin_x ?? undefined,
      mapPinY: source.map_pin_y ?? undefined,
      requiresQr: source.requires_qr,
      completionMethod: source.completion_method,
      visibilityStatus: "draft",
      startsAt: source.starts_at ?? undefined,
      endsAt: source.ends_at ?? undefined,
      activeDurationMinutes: source.active_duration_minutes ?? undefined,
      repeatType: source.repeat_type,
      repeatLimit: source.repeat_limit,
      isRepeatable: source.is_repeatable,
      expiresAutomatically: source.expires_automatically,
      icon: source.icon ?? undefined,
      imageUrl: source.image_url ?? undefined,
      organizationId: source.organization_id ?? undefined,
      eventId: source.event_id ?? undefined,
    },
    createdBy: args.adminUserId,
    createdByEmail: args.adminEmail,
  });
  return result;
}

export async function listAdminQuestsAdmin(includeDeleted = false) {
  const admin = createAdminClient();
  let query = admin.from("admin_quests").select("*").order("updated_at", { ascending: false });
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query;
  if (error) {
    throwIfAdminQuestsSchemaError(error);
    throw new ApiError(400, error.message, "ADMIN_QUESTS_LIST_FAILED");
  }
  return (data ?? []) as AdminQuestRow[];
}

export async function enrichAdminQuestsWithLinkedQr(
  quests: AdminQuestRow[],
): Promise<Array<{ quest: AdminQuestRow; linkedQr: AdminQuestLinkedQr | null }>> {
  const admin = createAdminClient();
  const qrIds = Array.from(new Set(quests.map((q) => q.qr_code_id).filter((id): id is string => Boolean(id))));
  if (!qrIds.length) {
    return quests.map((quest) => ({ quest, linkedQr: null }));
  }

  const { data: qrRows, error } = await admin
    .from("qr_codes")
    .select("id, code, image_url, qr_png_url, metadata")
    .in("id", qrIds);
  if (error) {
    console.warn("[cq][admin-quests] linked QR lookup failed", error.message);
    return quests.map((quest) => ({ quest, linkedQr: null }));
  }

  const byId = new Map((qrRows ?? []).map((row) => [String(row.id), row as AdminQuestLinkedQr]));
  return quests.map((quest) => ({
    quest,
    linkedQr: quest.qr_code_id ? byId.get(quest.qr_code_id) ?? null : null,
  }));
}

export async function getAdminQuestAnalytics(questId: string): Promise<AdminQuestAnalytics> {
  const admin = createAdminClient();
  const { data: completions, error } = await admin
    .from("admin_quest_completions")
    .select("user_id, xp_awarded, status, completion_method")
    .eq("quest_id", questId);
  if (error) {
    if (isAdminQuestsSchemaError(error)) {
      console.warn("[cq][admin-quests] admin_quest_completions table missing; returning empty analytics");
      return { ...EMPTY_ADMIN_QUEST_ANALYTICS };
    }
    throw new ApiError(400, error.message, "ADMIN_QUEST_ANALYTICS_FAILED");
  }

  const rows = completions ?? [];
  const completed = rows.filter((r) => r.status === "completed");
  const uniqueUsers = new Set(completed.map((r) => r.user_id)).size;
  const totalXp = completed.reduce((sum, r) => sum + (r.xp_awarded ?? 0), 0);
  const qrScans = completed.filter((r) => r.completion_method === "qr_scan").length;

  return {
    totalCompletions: completed.length,
    uniqueUsers,
    totalXpAwarded: totalXp,
    completionRate: rows.length > 0 ? Math.round((completed.length / rows.length) * 100) : 0,
    activeProgressCount: rows.filter((r) => r.status === "pending").length,
    qrScans,
  };
}

export async function completeAdminQuestForUser(args: {
  userClient: SupabaseClientLike;
  userId: string;
  questId: string;
  completionMethod?: AdminQuestCompletionMethod;
  proofUrl?: string;
  qrCodeId?: string;
}) {
  const admin = createAdminClient();
  const { data: quest, error: questError } = await admin
    .from("admin_quests")
    .select("*")
    .eq("id", args.questId)
    .maybeSingle();
  if (questError || !quest) throw new ApiError(404, "Quest not found.", "ADMIN_QUEST_NOT_FOUND");
  const q = quest as AdminQuestRow;
  if (!isAdminQuestCurrentlyActive(q)) {
    throw new ApiError(400, "This quest is not currently active.", "ADMIN_QUEST_INACTIVE");
  }

  const completionMap = await fetchUserAdminQuestCompletions(args.userId, [args.questId]);
  const status = deriveAdminQuestStatus(q, completionMap.get(args.questId) ?? []);
  if (status === "completed") {
    throw new ApiError(409, "You already completed this quest.", "ADMIN_QUEST_ALREADY_COMPLETED");
  }

  const method = args.completionMethod ?? q.completion_method;
  if (adminQuestRequiresQrScan(q) && method !== "qr_scan") {
    throw new ApiError(400, "This quest requires a QR scan to complete.", "ADMIN_QUEST_QR_REQUIRED");
  }
  if (method === "qr_scan") {
    if (!args.qrCodeId) {
      throw new ApiError(400, "A linked QR scan is required to complete this quest.", "ADMIN_QUEST_QR_REQUIRED");
    }
    if (q.qr_code_id && q.qr_code_id !== args.qrCodeId) {
      throw new ApiError(409, "This QR code is not linked to this quest.", "QR_QUEST_MISMATCH");
    }
  }

  const completionStatus = method === "admin_approval" ? "pending" : "completed";
  const completionDay = utcDayString();

  const { data: completion, error: insertError } = await admin
    .from("admin_quest_completions")
    .insert({
      quest_id: args.questId,
      user_id: args.userId,
      xp_awarded: completionStatus === "completed" ? q.xp_reward : 0,
      completion_method: method,
      proof_url: args.proofUrl ?? null,
      status: completionStatus,
      completion_day: q.repeat_limit === "once_per_user" ? null : completionDay,
    })
    .select("*")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      throw new ApiError(409, "You already completed this quest.", "ADMIN_QUEST_ALREADY_COMPLETED");
    }
    throw new ApiError(400, insertError.message, "ADMIN_QUEST_COMPLETE_FAILED");
  }

  let xpResult: Awaited<ReturnType<typeof addXpInternal>> | null = null;
  if (completionStatus === "completed") {
    xpResult = await addXpInternal({
      userClient: args.userClient,
      userId: args.userId,
      amount: q.xp_reward,
      sourceType: "quest",
      sourceId: args.questId,
      note: `Quest: ${q.name}`,
      applyStreakUpdate: true,
    });
  }

  return { quest: q, completion, xpResult };
}

export async function completeAdminQuestFromQr(args: {
  userClient: SupabaseClientLike;
  userId: string;
  adminQuestId: string;
  qrCodeId: string;
}) {
  return completeAdminQuestForUser({
    userClient: args.userClient,
    userId: args.userId,
    questId: args.adminQuestId,
    completionMethod: "qr_scan",
    qrCodeId: args.qrCodeId,
  });
}

export async function listAdminQuestMapPins(): Promise<CampusMapPin[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_quests")
    .select(
      "id, name, description, xp_reward, difficulty, completion_method, requires_qr, location_key, location_name, location_address, location_lat, location_lng, map_pin_x, map_pin_y, icon, starts_at, ends_at, visibility_status",
    )
    .eq("visibility_status", "active")
    .is("deleted_at", null)
    .not("location_lat", "is", null)
    .not("location_lng", "is", null);
  if (error) {
    if (isAdminQuestsSchemaError(error)) {
      console.warn("[cq][admin-quests] admin_quests table missing; returning empty map pins");
      return [];
    }
    throw new ApiError(400, error.message, "ADMIN_QUEST_MAP_PINS_FAILED");
  }
  const now = new Date();
  return (data ?? [])
    .filter((row) => isAdminQuestCurrentlyActive(row as AdminQuestRow, now))
    .filter((row) => !isExpiredAt((row.ends_at as string | null) ?? null, now))
    .flatMap((row) => {
      const coords = mapPercentForCoordinates({
        lat: row.location_lat as number,
        lng: row.location_lng as number,
        mapPinX: row.map_pin_x as number | null,
        mapPinY: row.map_pin_y as number | null,
      });
      if (!coords) return [];
      const pin: CampusMapPin = {
        id: row.id as string,
        pinType: "quest",
        name: row.name as string,
        description: (row.description as string) ?? "",
        xpReward: row.xp_reward as number,
        difficulty: row.difficulty as string,
        completionMethod: row.completion_method as string,
        requiresQr: Boolean(row.requires_qr),
        locationName: (row.location_name as string | null) ?? null,
        locationAddress: (row.location_address as string | null) ?? null,
        icon: (row.icon as string | null) ?? "🎯",
        x: coords.x,
        y: coords.y,
        isActive: true,
        expiresAt: (row.ends_at as string | null) ?? null,
        qrCode: null,
        scanPath: null,
      };
      return [pin];
    });
}
