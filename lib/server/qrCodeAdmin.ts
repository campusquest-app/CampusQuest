import { randomBytes } from "crypto";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import type { z } from "zod";
import type { createQrCodeSchema, updateQrCodeSchema } from "@/lib/server/validation";

type CreateInput = z.infer<typeof createQrCodeSchema>;
type UpdateInput = z.infer<typeof updateQrCodeSchema>;

function generateQrToken() {
  return `cq_${randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18)}`;
}

function normalizeAdminCode(raw: string) {
  const trimmed = raw.trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return trimmed;
  return trimmed;
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
  const code = args.input.code ? normalizeAdminCode(args.input.code) : generateQrToken();

  const { data, error } = await admin
    .from("qr_codes")
    .insert({
      code,
      title: args.input.title,
      description: args.input.description ?? null,
      type: args.input.type,
      event_id: args.input.eventId ?? null,
      quest_id: args.input.questId ?? null,
      location_name: args.input.locationName ?? null,
      activity_name: args.input.activityName ?? null,
      xp_reward: args.input.xpReward,
      is_active: args.input.isActive ?? true,
      is_permanent: args.input.isPermanent ?? args.input.type === "permanent_location",
      cooldown_hours: args.input.cooldownHours ?? (args.input.type === "permanent_location" ? 24 : 0),
      max_scans_per_day: args.input.maxScansPerDay ?? 1,
      requires_staff_approval: args.input.requiresStaffApproval ?? false,
      expires_at: args.input.expiresAt ?? null,
      created_by: args.createdBy,
    })
    .select("*")
    .single();

  if (error) throw new ApiError(400, error.message, "QR_CODE_CREATE_FAILED");
  return { row: data, scanUrl: buildCampusQuestScanUrl(code) };
}

export async function updateQrCodeAdmin(id: string, input: UpdateInput) {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.title != null) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.type != null) patch.type = input.type;
  if (input.eventId !== undefined) patch.event_id = input.eventId ?? null;
  if (input.questId !== undefined) patch.quest_id = input.questId ?? null;
  if (input.locationName !== undefined) patch.location_name = input.locationName ?? null;
  if (input.activityName !== undefined) patch.activity_name = input.activityName ?? null;
  if (input.xpReward != null) patch.xp_reward = input.xpReward;
  if (input.isActive != null) patch.is_active = input.isActive;
  if (input.isPermanent != null) patch.is_permanent = input.isPermanent;
  if (input.cooldownHours != null) patch.cooldown_hours = input.cooldownHours;
  if (input.maxScansPerDay != null) patch.max_scans_per_day = input.maxScansPerDay;
  if (input.requiresStaffApproval != null) patch.requires_staff_approval = input.requiresStaffApproval;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;

  const { data, error } = await admin.from("qr_codes").update(patch).eq("id", id).select("*").single();
  if (error) throw new ApiError(400, error.message, "QR_CODE_UPDATE_FAILED");
  if (!data) throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");
  return {
    row: data,
    scanUrl: buildCampusQuestScanUrl(data.code as string),
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
