import { ApiRequestError } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";
import type { AdminQuestLinkedQr } from "@/lib/adminQuestTypes";
import { campusLocationFormToPayload, EMPTY_CAMPUS_LOCATION_FORM, type CampusLocationFormState, type CampusLocationKey } from "@/lib/campusLocations";
import type { AdminQrType } from "@/lib/server/qrCodeInput";

export type AdminQuestOption = {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  visibility_status: string;
  location_key: string | null;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  ends_at: string | null;
  starts_at: string | null;
};

export type QrCodeAdminRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: string;
  qr_type?: string | null;
  xp_reward: number;
  is_active: boolean;
  is_permanent: boolean;
  cooldown_hours: number;
  max_scans_per_day: number;
  expires_at: string | null;
  starts_at?: string | null;
  location_name: string | null;
  location_key?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  activity_name: string | null;
  admin_quest_id?: string | null;
  image_url?: string | null;
  qr_png_url?: string | null;
  metadata?: { scan_url?: string } | null;
};

export const QR_TYPE_OPTIONS: { value: AdminQrType; label: string }[] = [
  { value: "quest_completion", label: "Quest Completion" },
  { value: "event_check_in", label: "Event Check-In" },
  { value: "location_check_in", label: "Location Check-In" },
  { value: "reward", label: "Reward" },
  { value: "general", label: "General" },
];

export function formatQrApiErrorDetails(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const record = details as {
    issues?: Array<{ path?: string; message?: string }>;
    fieldErrors?: Record<string, string[] | undefined>;
  };

  if (Array.isArray(record.issues) && record.issues.length > 0) {
    return record.issues
      .map((issue) => {
        const path = issue.path?.trim() || "body";
        return `${path}: ${issue.message ?? "invalid"}`;
      })
      .join("; ");
  }

  if (record.fieldErrors) {
    return Object.entries(record.fieldErrors)
      .flatMap(([field, messages]) => (messages ?? []).map((message) => `${field}: ${message}`))
      .join("; ");
  }

  return "";
}

export function formatQrCreationError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const detailText = formatQrApiErrorDetails(error.details);
    if (detailText) return `${error.message} — ${detailText}`;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "QR code could not be saved.";
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type QrAdminFormState = {
  code: string;
  title: string;
  description: string;
  qrType: AdminQrType;
  adminQuestId: string;
  campusLocation: CampusLocationFormState;
  activityName: string;
  xpReward: number;
  isActive: boolean;
  startsAt: string;
  expiresAt: string;
  maxUses: number;
  cooldownHours: number;
};

export const EMPTY_QR_ADMIN_FORM: QrAdminFormState = {
  code: "",
  title: "",
  description: "",
  qrType: "general",
  adminQuestId: "",
  campusLocation: { ...EMPTY_CAMPUS_LOCATION_FORM },
  activityName: "",
  xpReward: 10,
  isActive: true,
  startsAt: "",
  expiresAt: "",
  maxUses: 1,
  cooldownHours: 0,
};

export function qrRowToFormState(row: QrCodeAdminRow): QrAdminFormState {
  return {
    code: row.code ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    qrType: (row.qr_type as AdminQrType) ?? "general",
    adminQuestId: row.admin_quest_id ?? "",
    campusLocation: {
      locationKey: (row.location_key ?? "") as CampusLocationKey | "",
      locationName: row.location_name ?? "",
      locationAddress: row.location_address ?? "",
      locationLat: row.location_lat != null ? String(row.location_lat) : "",
      locationLng: row.location_lng != null ? String(row.location_lng) : "",
    },
    activityName: row.activity_name ?? "",
    xpReward: row.xp_reward ?? 0,
    isActive: row.is_active ?? true,
    startsAt: toDatetimeLocalValue(row.starts_at),
    expiresAt: toDatetimeLocalValue(row.expires_at),
    maxUses: row.max_scans_per_day ?? 1,
    cooldownHours: row.cooldown_hours ?? 0,
  };
}

export function buildQrAdminPayload(form: QrAdminFormState, options?: { isUpdate?: boolean }): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    description: form.description.trim(),
    qrType: form.qrType,
    xpReward: form.xpReward,
    isActive: form.isActive,
    isPermanent: form.qrType === "location_check_in",
    cooldownHours: form.cooldownHours,
    maxScansPerDay: form.maxUses,
    startsAt: fromDatetimeLocalValue(form.startsAt),
    expiresAt: fromDatetimeLocalValue(form.expiresAt),
    ...campusLocationFormToPayload(form.campusLocation),
  };

  const trimmedCode = form.code.trim().toUpperCase();
  if (/^[A-Z][A-Z0-9_]{1,31}$/.test(trimmedCode)) {
    payload.code = trimmedCode;
  }

  if (form.activityName.trim()) payload.activityName = form.activityName.trim();

  if (form.adminQuestId) {
    payload.adminQuestId = form.adminQuestId;
  } else if (options?.isUpdate) {
    payload.adminQuestId = null;
    payload.clearAdminQuest = true;
  }

  return payload;
}

export function applyQuestAutofill(
  form: QrAdminFormState,
  quest: AdminQuestOption,
  options?: { onlyIfEmpty?: boolean },
): QrAdminFormState {
  const onlyIfEmpty = options?.onlyIfEmpty ?? true;
  const next = { ...form, adminQuestId: quest.id, qrType: "quest_completion" as AdminQrType };

  if (!onlyIfEmpty || !next.title.trim()) next.title = quest.name;
  if (!onlyIfEmpty || !next.description.trim()) next.description = quest.description ?? "";
  if (!onlyIfEmpty || next.xpReward <= 0) next.xpReward = quest.xp_reward;
  if (!onlyIfEmpty || !next.expiresAt) next.expiresAt = toDatetimeLocalValue(quest.ends_at);
  if (!onlyIfEmpty || !next.startsAt) next.startsAt = toDatetimeLocalValue(quest.starts_at);

  if (quest.location_key || quest.location_name) {
    next.campusLocation = {
      locationKey: (quest.location_key ?? "") as CampusLocationKey | "",
      locationName: quest.location_name ?? "",
      locationAddress: quest.location_address ?? "",
      locationLat: quest.location_lat != null ? String(quest.location_lat) : "",
      locationLng: quest.location_lng != null ? String(quest.location_lng) : "",
    };
  }

  return next;
}

export function resolveQrPreviewUrl(row: Pick<QrCodeAdminRow, "id" | "image_url" | "qr_png_url">): string {
  if (row.image_url?.trim()) return row.image_url.trim();
  if (row.qr_png_url?.trim()) return row.qr_png_url.trim();
  return `/api/internal/admin/qr-codes/${row.id}/image`;
}

export async function uploadQrCodeImage(qrId: string, file: File): Promise<string> {
  const token = getAccessToken();
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`/api/internal/admin/qr-codes/${qrId}/image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { imageUrl?: string; error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "Image upload failed.");
  }
  if (!json.imageUrl) throw new Error("Image upload did not return a URL.");
  return json.imageUrl;
}

export async function regenerateQrCodePng(qrId: string): Promise<{ qrPngUrl: string; scanUrl: string }> {
  const token = getAccessToken();
  const res = await fetch(`/api/internal/admin/qr-codes/${qrId}/regenerate-png`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    qrPngUrl?: string;
    scanUrl?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "Could not regenerate QR PNG.");
  return { qrPngUrl: json.qrPngUrl ?? "", scanUrl: json.scanUrl ?? "" };
}

export async function regenerateQrToken(qrId: string): Promise<{
  row: QrCodeAdminRow;
  scanUrl: string;
  oldCode: string;
  newCode: string;
}> {
  const token = getAccessToken();
  const res = await fetch(`/api/internal/admin/qr-codes/${qrId}/regenerate-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    row?: QrCodeAdminRow;
    scanUrl?: string;
    oldCode?: string;
    newCode?: string;
    error?: string;
  };
  if (!res.ok || !json.row || !json.scanUrl || !json.newCode) {
    throw new Error(json.error ?? "Could not regenerate QR token.");
  }
  return {
    row: json.row,
    scanUrl: json.scanUrl,
    oldCode: json.oldCode ?? "",
    newCode: json.newCode,
  };
}

export function resolveQuestQrScanUrl(linkedQr: Pick<AdminQuestLinkedQr, "code" | "metadata"> | null): string | null {
  if (!linkedQr) return null;
  const fromMeta = linkedQr.metadata?.scan_url?.trim();
  if (fromMeta) return fromMeta;
  if (linkedQr.code?.trim()) {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/scan?code=${encodeURIComponent(linkedQr.code.trim())}`;
    }
  }
  return null;
}

// Back-compat for any legacy imports
export function buildStandaloneQrCreatePayload(form: {
  code: string;
  title: string;
  description: string;
  type: string;
  campusLocation: CampusLocationFormState;
  activityName: string;
  xpReward: number;
  isPermanent: boolean;
  cooldownHours: number;
  maxScansPerDay: number;
  expiresAt: string;
}): Record<string, unknown> {
  return buildQrAdminPayload({
    ...EMPTY_QR_ADMIN_FORM,
    code: form.code,
    title: form.title,
    description: form.description,
    qrType: form.type === "quest" ? "quest_completion" : form.type === "event" ? "event_check_in" : "location_check_in",
    campusLocation: form.campusLocation,
    activityName: form.activityName,
    xpReward: form.xpReward,
    isActive: true,
    expiresAt: form.expiresAt,
    maxUses: form.maxScansPerDay,
    cooldownHours: form.cooldownHours,
  });
}
