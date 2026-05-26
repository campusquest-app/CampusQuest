import { z } from "zod";
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@/lib/types";
import { todayString } from "@/lib/dateUtils";

const rawQrActivitySchema = z
  .object({
    type: z.literal("campusquest_activity"),
    activityId: z.string().trim().min(1).max(128),
    activityName: z.string().trim().min(1).max(120).optional(),
    xp: z.number().finite(),
    stat: z.string().trim().min(1).max(40),
    statIncrease: z.number().finite(),
    /** Milliseconds since Unix epoch — reject scan when `Date.now()` is past this. */
    expiresAt: z.number().finite().optional(),
    /** When set, this code can only be redeemed once per player (recommended for single-use event codes). */
    nonce: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type CampusQuestQrActivityPayloadParsed = {
  activityId: string;
  activityName: string;
  xp: number;
  stat: StatKey;
  statIncrease: number;
  expiresAt?: number;
  nonce?: string;
};

export type ParseQrActivityErrorCode =
  | "invalid_json"
  | "invalid_schema"
  | "invalid_stat"
  | "expired"
  | "network";

const MAX_QR_XP = 50_000;
const MAX_QR_STAT_GAIN = 250;

export function normalizeCampusQuestStatLabel(raw: string): StatKey | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (STAT_KEYS.includes(lower as StatKey)) return lower as StatKey;
  for (const key of STAT_KEYS) {
    if (STAT_LABELS[key].toLowerCase() === lower) return key;
  }
  return null;
}

/** Build a stable redemption key for duplicate prevention (per character, localStorage). */
export function qrRedemptionKeyFromPayload(payload: CampusQuestQrActivityPayloadParsed): string {
  if (payload.nonce && payload.nonce.length > 0) return `nonce:${payload.nonce}`;
  return `day:${payload.activityId}:${todayString()}`;
}

export type ParseQrActivityResult =
  | { ok: true; payload: CampusQuestQrActivityPayloadParsed }
  | { ok: false; code: ParseQrActivityErrorCode; message: string };

/**
 * Accepts raw QR text (typically JSON). Validates CampusQuest event payload.
 */
export function parseCampusQuestQrPayload(rawText: string): ParseQrActivityResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, code: "invalid_json", message: "Empty QR payload." };
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      ok: false,
      code: "invalid_json",
      message: "This isn’t a valid CampusQuest QR code (couldn’t read JSON).",
    };
  }

  const parsed = rawQrActivitySchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const suffix = issue?.message ? ` (${issue.message})` : "";
    return {
      ok: false,
      code: "invalid_schema",
      message: `Invalid CampusQuest activity code${suffix}`,
    };
  }

  const v = parsed.data;
  if (!Number.isInteger(v.xp) || v.xp < 1 || v.xp > MAX_QR_XP) {
    return {
      ok: false,
      code: "invalid_schema",
      message: `XP must be a whole number between 1 and ${MAX_QR_XP}.`,
    };
  }

  if (!Number.isInteger(v.statIncrease) || v.statIncrease < 1 || v.statIncrease > MAX_QR_STAT_GAIN) {
    return {
      ok: false,
      code: "invalid_schema",
      message: `Stat boost must be a whole number between 1 and ${MAX_QR_STAT_GAIN}.`,
    };
  }

  const stat = normalizeCampusQuestStatLabel(v.stat);
  if (!stat) {
    return {
      ok: false,
      code: "invalid_stat",
      message: "That code uses an unknown stat. Use Strength, Stamina, Knowledge, Focus, or Social.",
    };
  }

  if (v.expiresAt != null && Number.isFinite(v.expiresAt) && Date.now() > v.expiresAt) {
    return {
      ok: false,
      code: "expired",
      message: "This QR code has expired. Ask for a new code from the organizer.",
    };
  }

  const activityName = v.activityName?.trim() || v.activityId;

  return {
    ok: true,
    payload: {
      activityId: v.activityId,
      activityName,
      xp: v.xp,
      stat,
      statIncrease: v.statIncrease,
      expiresAt: v.expiresAt,
      nonce: v.nonce,
    },
  };
}
