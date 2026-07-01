import { randomBytes } from "crypto";
import { ApiError } from "@/lib/server/http";
import { isExpiredAt, mapPercentForCoordinates, type CampusMapPin } from "@/lib/server/campusMapPins";
import type { NormalizedCreateQrCodeInput } from "@/lib/server/qrCodeInput";
import { regenerateAndStoreQrPng } from "@/lib/server/qrCodeImages";
import { createAdminClient } from "@/lib/server/supabase";

type CreateInput = NormalizedCreateQrCodeInput;
type UpdateInput = Partial<NormalizedCreateQrCodeInput> & { clearLinkedQuest?: boolean };

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

function generateQrToken() {
  return `CQ_${randomBytes(8).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase()}`;
}

async function generateUniqueQrToken(admin: SupabaseAdminClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateQrToken();
    const { data } = await admin.from("qr_codes").select("id").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  throw new ApiError(500, "Could not generate a unique QR token.", "QR_TOKEN_GENERATE_FAILED");
}

function normalizeAdminCode(raw: string) {
  return raw.trim().toUpperCase();
}

export function buildCampusQuestScanUrl(code: string, origin?: string) {
  let base = origin?.replace(/\/$/, "") ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!base && process.env.VERCEL_URL) {
    base = process.env.VERCEL_URL.startsWith("http")
      ? process.env.VERCEL_URL.replace(/\/$/, "")
      : `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  if (!base) base = "http://localhost:3000";
  return `${base}/scan?code=${encodeURIComponent(code)}`;
}

function isMissingAdminQuestsTable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "PGRST205" || (msg.includes("admin_quests") && msg.includes("schema cache"));
}

async function resolveQuestLinks(
  admin: SupabaseAdminClient,
  input: Pick<CreateInput, "questId" | "adminQuestId" | "qrType">,
): Promise<{ quest_id: string | null; admin_quest_id: string | null }> {
  if (input.adminQuestId) {
    const { data, error } = await admin.from("admin_quests").select("id").eq("id", input.adminQuestId).maybeSingle();
    if (error && !isMissingAdminQuestsTable(error)) {
      throw new ApiError(400, error.message, "ADMIN_QUEST_LOOKUP_FAILED");
    }
    if (!data && !isMissingAdminQuestsTable(error)) {
      throw new ApiError(404, "Admin quest not found.", "ADMIN_QUEST_NOT_FOUND");
    }
    return { quest_id: null, admin_quest_id: input.adminQuestId };
  }

  if (!input.questId) {
    return { quest_id: null, admin_quest_id: null };
  }

  const { data: adminQuest, error: adminQuestError } = await admin
    .from("admin_quests")
    .select("id")
    .eq("id", input.questId)
    .maybeSingle();
  if (adminQuestError && !isMissingAdminQuestsTable(adminQuestError)) {
    throw new ApiError(400, adminQuestError.message, "ADMIN_QUEST_LOOKUP_FAILED");
  }
  if (adminQuest || (adminQuestError && isMissingAdminQuestsTable(adminQuestError) && input.qrType === "quest_completion")) {
    return { quest_id: null, admin_quest_id: input.questId };
  }

  const { data: legacyQuest, error: legacyQuestError } = await admin
    .from("quests")
    .select("id")
    .eq("id", input.questId)
    .maybeSingle();
  if (legacyQuestError) {
    throw new ApiError(400, legacyQuestError.message, "QUEST_LOOKUP_FAILED");
  }
  if (!legacyQuest) {
    throw new ApiError(404, "Quest not found.", "QUEST_NOT_FOUND");
  }

  return { quest_id: input.questId, admin_quest_id: null };
}

async function linkAdminQuestQrCode(admin: SupabaseAdminClient, adminQuestId: string, qrCodeId: string) {
  const { error } = await admin.from("admin_quests").update({ qr_code_id: qrCodeId }).eq("id", adminQuestId);
  if (error && !isMissingAdminQuestsTable(error)) {
    console.warn("[cq][qr-codes] failed to link admin quest qr_code_id", {
      adminQuestId,
      qrCodeId,
      message: error.message,
    });
  }
}

async function unlinkAdminQuestQrCode(admin: SupabaseAdminClient, adminQuestId: string, qrCodeId: string) {
  const { error } = await admin
    .from("admin_quests")
    .update({ qr_code_id: null })
    .eq("id", adminQuestId)
    .eq("qr_code_id", qrCodeId);
  if (error && !isMissingAdminQuestsTable(error)) {
    console.warn("[cq][qr-codes] failed to unlink admin quest qr_code_id", {
      adminQuestId,
      qrCodeId,
      message: error.message,
    });
  }
}

async function insertQrCodeRow(admin: SupabaseAdminClient, insertRow: Record<string, unknown>) {
  const row = { ...insertRow };
  const optionalKeys = [
    "metadata",
    "qr_type",
    "admin_quest_id",
    "location_key",
    "location_address",
    "location_lat",
    "location_lng",
    "starts_at",
    "image_url",
    "qr_png_url",
    "updated_at",
  ] as const;

  for (let attempt = 0; attempt <= optionalKeys.length + 1; attempt++) {
    const { data, error } = await admin.from("qr_codes").insert(row).select("*").single();
    if (!error) return data;

    const message = error.message ?? "";
    if (/qr_codes_type_check|type check constraint/i.test(message) && (row.type === "reward" || row.type === "general")) {
      row.type = "quest";
      continue;
    }

    const dropKey = optionalKeys.find((key) => key in row && new RegExp(key, "i").test(message));
    if (dropKey) {
      delete row[dropKey];
      continue;
    }

    throw new ApiError(400, message, "QR_CODE_CREATE_FAILED");
  }

  throw new ApiError(400, "QR code insert failed after retries.", "QR_CODE_CREATE_FAILED");
}

export async function listQrCodesAdmin() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("qr_codes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(400, error.message, "QR_CODES_LIST_FAILED");
  return data ?? [];
}

export async function createQrCodeAdmin(args: { input: CreateInput; createdBy: string }) {
  const admin = createAdminClient();
  const code = args.input.code ? normalizeAdminCode(args.input.code) : await generateUniqueQrToken(admin);
  const questLinks = await resolveQuestLinks(admin, args.input);

  const insertRow: Record<string, unknown> = {
    code,
    title: args.input.title,
    description: args.input.description || null,
    type: args.input.type,
    qr_type: args.input.qrType,
    event_id: args.input.eventId ?? null,
    quest_id: questLinks.quest_id,
    admin_quest_id: questLinks.admin_quest_id,
    location_name: args.input.locationName ?? null,
    location_key: args.input.locationKey ?? null,
    location_address: args.input.locationAddress ?? null,
    location_lat: args.input.locationLat ?? null,
    location_lng: args.input.locationLng ?? null,
    activity_name: args.input.activityName ?? null,
    xp_reward: args.input.xpReward,
    is_active: args.input.isActive,
    is_permanent: args.input.isPermanent,
    cooldown_hours: args.input.cooldownHours,
    max_scans_per_day: args.input.maxScansPerDay,
    requires_staff_approval: args.input.requiresStaffApproval,
    starts_at: args.input.startsAt,
    expires_at: args.input.expiresAt,
    metadata: {
      ...args.input.metadata,
      scan_url: buildCampusQuestScanUrl(code),
    },
    created_by: args.createdBy,
  };

  const data = await insertQrCodeRow(admin, insertRow);

  if (questLinks.admin_quest_id && data?.id) {
    await linkAdminQuestQrCode(admin, questLinks.admin_quest_id, String(data.id));
  }

  if (data?.id && data?.code) {
    try {
      await regenerateAndStoreQrPng({ qrId: String(data.id), code: String(data.code) });
    } catch (err) {
      console.warn("[cq][qr-codes] PNG generation after create failed", err);
    }
  }

  const { data: refreshed } = await admin.from("qr_codes").select("*").eq("id", data.id).maybeSingle();

  return { row: refreshed ?? data, scanUrl: buildCampusQuestScanUrl(code) };
}

export async function updateQrCodeAdmin(id: string, input: UpdateInput, options?: { origin?: string }) {
  const admin = createAdminClient();

  const { data: existingRow, error: existingError } = await admin
    .from("qr_codes")
    .select("admin_quest_id, code")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw new ApiError(400, existingError.message, "QR_CODE_LOOKUP_FAILED");
  if (!existingRow) throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");

  const patch: Record<string, unknown> = {};
  if (input.code != null) patch.code = input.code;
  if (input.title != null) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.type != null) patch.type = input.type;
  if (input.qrType != null) patch.qr_type = input.qrType;
  if (input.eventId !== undefined) patch.event_id = input.eventId ?? null;
  if (input.locationName !== undefined) patch.location_name = input.locationName ?? null;
  if (input.locationKey !== undefined) patch.location_key = input.locationKey ?? null;
  if (input.locationAddress !== undefined) patch.location_address = input.locationAddress ?? null;
  if (input.locationLat !== undefined) patch.location_lat = input.locationLat ?? null;
  if (input.locationLng !== undefined) patch.location_lng = input.locationLng ?? null;
  if (input.activityName !== undefined) patch.activity_name = input.activityName ?? null;
  if (input.xpReward != null) patch.xp_reward = input.xpReward;
  if (input.isActive != null) patch.is_active = input.isActive;
  if (input.isPermanent != null) patch.is_permanent = input.isPermanent;
  if (input.cooldownHours != null) patch.cooldown_hours = input.cooldownHours;
  if (input.maxScansPerDay != null) patch.max_scans_per_day = input.maxScansPerDay;
  if (input.requiresStaffApproval != null) patch.requires_staff_approval = input.requiresStaffApproval;
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.qrPngUrl !== undefined) patch.qr_png_url = input.qrPngUrl;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const oldAdminQuestId = (existingRow.admin_quest_id as string | null) ?? null;

  if (input.clearLinkedQuest) {
    patch.quest_id = null;
    patch.admin_quest_id = null;
    if (oldAdminQuestId) {
      await unlinkAdminQuestQrCode(admin, oldAdminQuestId, id);
    }
  } else if (input.questId !== undefined || input.adminQuestId !== undefined) {
    const questLinks = await resolveQuestLinks(admin, {
      questId: input.questId,
      adminQuestId: input.adminQuestId,
      qrType: input.qrType ?? "general",
    });
    patch.quest_id = questLinks.quest_id;
    patch.admin_quest_id = questLinks.admin_quest_id;

    if (oldAdminQuestId && oldAdminQuestId !== questLinks.admin_quest_id) {
      await unlinkAdminQuestQrCode(admin, oldAdminQuestId, id);
    }
  }

  const { data, error } = await admin.from("qr_codes").update(patch).eq("id", id).select("*").single();
  if (error) throw new ApiError(400, error.message, "QR_CODE_UPDATE_FAILED");
  if (!data) throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");

  const adminQuestId = (data.admin_quest_id as string | null) ?? null;
  if (adminQuestId) {
    await linkAdminQuestQrCode(admin, adminQuestId, id);
  }

  const code = String(data.code);
  const scanUrl = buildCampusQuestScanUrl(code, options?.origin);
  const metadata = {
    ...((data.metadata as Record<string, unknown> | null) ?? {}),
    scan_url: scanUrl,
  };
  await admin.from("qr_codes").update({ metadata }).eq("id", id);

  return {
    row: { ...data, metadata },
    scanUrl,
  };
}

export async function regenerateQrCodePngAdmin(id: string, origin?: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("qr_codes").select("code").eq("id", id).maybeSingle();
  if (error) throw new ApiError(400, error.message, "QR_CODE_LOOKUP_FAILED");
  if (!data?.code) throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");
  return regenerateAndStoreQrPng({ qrId: id, code: String(data.code), origin });
}

/** Issue a new secure scan token; the previous code stops working immediately. */
export async function regenerateQrTokenAdmin(id: string, origin?: string) {
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("qr_codes").select("*").eq("id", id).maybeSingle();
  if (error) throw new ApiError(400, error.message, "QR_CODE_LOOKUP_FAILED");
  if (!existing?.code) throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");

  const oldCode = String(existing.code);
  const newCode = await generateUniqueQrToken(admin);
  const scanUrl = buildCampusQuestScanUrl(newCode, origin);
  const priorMetadata = (existing.metadata as Record<string, unknown> | null) ?? {};
  const previousCodes = Array.isArray(priorMetadata.previous_codes)
    ? (priorMetadata.previous_codes as string[])
    : [];
  const metadata = {
    ...priorMetadata,
    scan_url: scanUrl,
    previous_codes: [...previousCodes, oldCode],
    regenerated_at: new Date().toISOString(),
    revoked_at: new Date().toISOString(),
  };

  const { data, error: updateError } = await admin
    .from("qr_codes")
    .update({
      code: newCode,
      image_url: null,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError || !data) {
    throw new ApiError(400, updateError?.message ?? "QR token regeneration failed.", "QR_TOKEN_REGENERATE_FAILED");
  }

  let qrPngUrl: string | null = null;
  try {
    const png = await regenerateAndStoreQrPng({ qrId: id, code: newCode, origin });
    qrPngUrl = png.qrPngUrl;
  } catch (err) {
    console.warn("[cq][qr-codes] PNG generation after token regenerate failed", err);
  }

  const { data: refreshed } = await admin.from("qr_codes").select("*").eq("id", id).maybeSingle();

  return {
    row: refreshed ?? { ...data, qr_png_url: qrPngUrl, metadata },
    scanUrl,
    oldCode,
    newCode,
    qrPngUrl,
  };
}

export async function listQrScansAdmin(limit = 80) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("qr_scans")
    .select(
      "id, user_id, qr_code_id, scanned_at, xp_awarded, status, failure_reason, device_hint, qr_codes(title, code, type)",
    )
    .order("scanned_at", { ascending: false })
    .limit(limit);

  if (error) throw new ApiError(400, error.message, "QR_SCANS_LIST_FAILED");
  return data ?? [];
}

export async function listQrCodeMapPins(): Promise<CampusMapPin[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("qr_codes")
    .select(
      "id, code, title, description, xp_reward, is_active, starts_at, expires_at, qr_type, location_key, location_name, location_address, location_lat, location_lng",
    )
    .eq("is_active", true)
    .not("location_lat", "is", null)
    .not("location_lng", "is", null);
  if (error) throw new ApiError(400, error.message, "QR_CODE_MAP_PINS_FAILED");

  const now = new Date();
  return (data ?? [])
    .filter((row) => !isExpiredAt((row.expires_at as string | null) ?? null, now))
    .filter((row) => {
      const startsAt = (row.starts_at as string | null) ?? null;
      return !startsAt || new Date(startsAt) <= now;
    })
    .flatMap((row) => {
      const coords = mapPercentForCoordinates({
        lat: row.location_lat as number,
        lng: row.location_lng as number,
      });
      if (!coords) return [];
      const code = String(row.code);
      const pin: CampusMapPin = {
        id: String(row.id),
        pinType: "qr",
        name: String(row.title),
        description: (row.description as string | null) ?? "",
        xpReward: Number(row.xp_reward ?? 0),
        locationName: (row.location_name as string | null) ?? null,
        locationAddress: (row.location_address as string | null) ?? null,
        icon: row.qr_type === "quest_completion" ? "📷" : "🔳",
        x: coords.x,
        y: coords.y,
        isActive: Boolean(row.is_active),
        expiresAt: (row.expires_at as string | null) ?? null,
        requiresQr: true,
        completionMethod: "qr_scan",
        qrCode: code,
        scanPath: `/scan?code=${encodeURIComponent(code)}`,
        difficulty: null,
      };
      return [pin];
    });
}

export function buildQuestCompletionQrInput(args: {
  quest: {
    id: string;
    name: string;
    description: string;
    xp_reward: number;
    location_key?: string | null;
    location_name: string | null;
    location_address?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    ends_at: string | null;
    visibility_status: string;
    completion_method: string;
    repeat_limit: string;
  };
}) {
  return {
    name: args.quest.name,
    description: args.quest.description ?? "",
    qr_type: "quest_completion" as const,
    quest_id: args.quest.id,
    xp_reward: args.quest.xp_reward,
    location_key: args.quest.location_key ?? undefined,
    location_name: args.quest.location_name ?? undefined,
    location_address: args.quest.location_address ?? undefined,
    location_lat: args.quest.location_lat ?? undefined,
    location_lng: args.quest.location_lng ?? undefined,
    expires_at: args.quest.ends_at,
    max_uses: args.quest.repeat_limit === "unlimited" ? null : 1,
    is_active: args.quest.visibility_status === "active",
    metadata: {
      source: "admin_quest_builder",
      completion_method: args.quest.completion_method,
    },
  };
}
