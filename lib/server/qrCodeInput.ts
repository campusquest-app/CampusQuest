import { z } from "zod";
import { CAMPUS_LOCATION_KEYS, isCampusLocationKey, resolveCampusLocation } from "@/lib/campusLocations";

const uuidField = z.string().uuid();

/** Semantic QR categories used by admin quest builder and QR admin panel. */
export const adminQrTypeSchema = z.enum([
  "quest_completion",
  "event_check_in",
  "location_check_in",
  "reward",
  "general",
]);

/** Legacy scanner `qr_codes.type` values (gym QR uses permanent_location). */
export const legacyQrCodeTypeSchema = z.enum([
  "event",
  "quest",
  "permanent_location",
  "tutoring",
  "advising",
  "reward",
  "general",
]);

export type AdminQrType = z.infer<typeof adminQrTypeSchema>;
export type LegacyQrCodeType = z.infer<typeof legacyQrCodeTypeSchema>;

export type NormalizedCreateQrCodeInput = {
  code?: string;
  title: string;
  description: string;
  type: LegacyQrCodeType;
  qrType: AdminQrType;
  eventId?: string;
  questId?: string;
  adminQuestId?: string;
  locationName?: string;
  locationKey?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  mapPinX?: number | null;
  mapPinY?: number | null;
  activityName?: string;
  xpReward: number;
  isActive: boolean;
  isPermanent: boolean;
  cooldownHours: number;
  maxScansPerDay: number;
  requiresStaffApproval: boolean;
  expiresAt: string | null;
  startsAt: string | null;
  metadata: Record<string, unknown>;
  imageUrl?: string | null;
  qrPngUrl?: string | null;
};

type RawQrBody = {
  code?: unknown;
  title?: unknown;
  name?: unknown;
  description?: unknown;
  type?: unknown;
  qrType?: unknown;
  qr_type?: unknown;
  eventId?: unknown;
  event_id?: unknown;
  questId?: unknown;
  quest_id?: unknown;
  adminQuestId?: unknown;
  admin_quest_id?: unknown;
  locationName?: unknown;
  location_name?: unknown;
  locationKey?: unknown;
  location_key?: unknown;
  locationAddress?: unknown;
  location_address?: unknown;
  locationLat?: unknown;
  location_lat?: unknown;
  locationLng?: unknown;
  location_lng?: unknown;
  activityName?: unknown;
  activity_name?: unknown;
  xpReward?: unknown;
  xp_reward?: unknown;
  isActive?: unknown;
  is_active?: unknown;
  isPermanent?: unknown;
  is_permanent?: unknown;
  cooldownHours?: unknown;
  cooldown_hours?: unknown;
  maxScansPerDay?: unknown;
  max_scans_per_day?: unknown;
  maxUses?: unknown;
  max_uses?: unknown;
  requiresStaffApproval?: unknown;
  requires_staff_approval?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
  startsAt?: unknown;
  starts_at?: unknown;
  metadata?: unknown;
  imageUrl?: unknown;
  image_url?: unknown;
  qrPngUrl?: unknown;
  qr_png_url?: unknown;
  clearAdminQuest?: unknown;
  clear_admin_quest?: unknown;
};

function optionalString(value: unknown, maxLen: number): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function optionalInt(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function optionalBool(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return undefined;
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Invalid or partial codes are dropped so the backend auto-generates one. */
export function normalizeOptionalCode(raw: unknown): string | undefined {
  const candidate = optionalString(raw, 32);
  if (!candidate || candidate.length < 2) return undefined;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(candidate)) return undefined;
  return candidate;
}

function parseNullableUuid(raw: unknown): string | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;
  return uuidField.safeParse(value).success ? value : undefined;
}

export function mapAdminQrTypeToLegacyType(
  qrType: AdminQrType | null | undefined,
  legacyType?: LegacyQrCodeType | null,
): LegacyQrCodeType {
  if (legacyType) return legacyType;
  switch (qrType) {
    case "quest_completion":
      return "quest";
    case "event_check_in":
      return "event";
    case "location_check_in":
      return "permanent_location";
    case "reward":
      return "reward";
    case "general":
      return "general";
    default:
      return "general";
  }
}

export function resolveAdminQrType(args: {
  qrType?: string | null;
  legacyType?: string | null;
}): AdminQrType {
  const candidate = args.qrType ?? null;
  if (candidate && adminQrTypeSchema.safeParse(candidate).success) {
    return candidate as AdminQrType;
  }
  switch (args.legacyType) {
    case "quest":
      return "quest_completion";
    case "event":
      return "event_check_in";
    case "permanent_location":
      return "location_check_in";
    case "reward":
      return "reward";
    case "general":
      return "general";
    default:
      return "general";
  }
}

export function normalizeCreateQrCodeInput(raw: RawQrBody): NormalizedCreateQrCodeInput {
  const title = optionalString(raw.title, 120) ?? optionalString(raw.name, 120) ?? "QR Code";
  const description = optionalString(raw.description, 500) ?? "";
  const legacyTypeRaw = optionalString(raw.type, 40);
  const legacyTypeParsed = legacyTypeRaw ? legacyQrCodeTypeSchema.safeParse(legacyTypeRaw) : null;
  const qrType = resolveAdminQrType({
    qrType: optionalString(raw.qrType ?? raw.qr_type, 40),
    legacyType: legacyTypeParsed?.success ? legacyTypeParsed.data : null,
  });
  const type = mapAdminQrTypeToLegacyType(qrType, legacyTypeParsed?.success ? legacyTypeParsed.data : null);

  const maxUses = raw.maxUses ?? raw.max_uses;
  const maxUsesNum = maxUses == null ? null : optionalInt(maxUses);
  const maxScansPerDay =
    optionalInt(raw.maxScansPerDay ?? raw.max_scans_per_day) ??
    (maxUsesNum == null ? (type === "permanent_location" ? 1 : 0) : maxUsesNum);

  const xpReward = optionalInt(raw.xpReward ?? raw.xp_reward) ?? 0;
  const isActive = optionalBool(raw.isActive ?? raw.is_active) ?? true;
  const isPermanent =
    optionalBool(raw.isPermanent ?? raw.is_permanent) ??
    (type === "permanent_location" || qrType === "location_check_in");

  const resolvedLocation = resolveCampusLocation(raw as Parameters<typeof resolveCampusLocation>[0]);
  const legacyLocationName = optionalString(raw.locationName ?? raw.location_name, 120);

  return {
    code: normalizeOptionalCode(raw.code),
    title,
    description,
    type,
    qrType,
    eventId: parseNullableUuid(raw.eventId ?? raw.event_id),
    questId: parseNullableUuid(raw.questId ?? raw.quest_id),
    adminQuestId: parseNullableUuid(raw.adminQuestId ?? raw.admin_quest_id),
    locationKey: resolvedLocation.locationKey,
    locationName: resolvedLocation.locationName ?? legacyLocationName,
    locationAddress: resolvedLocation.locationAddress,
    locationLat: resolvedLocation.locationLat,
    locationLng: resolvedLocation.locationLng,
    mapPinX: resolvedLocation.mapPinX,
    mapPinY: resolvedLocation.mapPinY,
    activityName: optionalString(raw.activityName ?? raw.activity_name, 120),
    xpReward,
    isActive,
    isPermanent,
    cooldownHours:
      optionalInt(raw.cooldownHours ?? raw.cooldown_hours) ??
      (type === "permanent_location" ? 24 : 0),
    maxScansPerDay,
    requiresStaffApproval: optionalBool(raw.requiresStaffApproval ?? raw.requires_staff_approval) ?? false,
    expiresAt:
      raw.expiresAt === null || raw.expires_at === null
        ? null
        : optionalString(raw.expiresAt ?? raw.expires_at, 40) ?? null,
    startsAt:
      raw.startsAt === null || raw.starts_at === null
        ? null
        : optionalString(raw.startsAt ?? raw.starts_at, 40) ?? null,
    metadata: parseMetadata(raw.metadata),
  };
}

function hasField(raw: RawQrBody, ...keys: (keyof RawQrBody)[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined);
}

export function normalizePartialQrCodeInput(raw: RawQrBody): Partial<NormalizedCreateQrCodeInput> {
  const full = normalizeCreateQrCodeInput(raw);
  const patch: Partial<NormalizedCreateQrCodeInput> = {};

  if (hasField(raw, "code")) patch.code = full.code;
  if (hasField(raw, "title", "name")) patch.title = full.title;
  if (hasField(raw, "description")) patch.description = full.description;
  if (hasField(raw, "type", "qrType", "qr_type")) {
    patch.type = full.type;
    patch.qrType = full.qrType;
  }
  if (hasField(raw, "eventId", "event_id")) patch.eventId = full.eventId;
  if (hasField(raw, "adminQuestId", "admin_quest_id", "questId", "quest_id", "clearAdminQuest", "clear_admin_quest")) {
    const clearQuest =
      raw.adminQuestId === null ||
      raw.admin_quest_id === null ||
      raw.questId === null ||
      raw.quest_id === null ||
      raw.clearAdminQuest === true ||
      raw.clear_admin_quest === true;
    if (clearQuest) {
      patch.questId = undefined;
      patch.adminQuestId = undefined;
      (patch as Partial<NormalizedCreateQrCodeInput> & { clearLinkedQuest?: boolean }).clearLinkedQuest = true;
    } else {
      patch.questId = full.questId;
      patch.adminQuestId = full.adminQuestId;
    }
  }
  if (hasField(raw, "locationName", "location_name", "locationKey", "location_key", "locationAddress", "location_address", "locationLat", "location_lat", "locationLng", "location_lng")) {
    patch.locationKey = full.locationKey;
    patch.locationName = full.locationName;
    patch.locationAddress = full.locationAddress;
    patch.locationLat = full.locationLat;
    patch.locationLng = full.locationLng;
    patch.mapPinX = full.mapPinX;
    patch.mapPinY = full.mapPinY;
  }
  if (hasField(raw, "activityName", "activity_name")) patch.activityName = full.activityName;
  if (hasField(raw, "xpReward", "xp_reward")) patch.xpReward = full.xpReward;
  if (hasField(raw, "isActive", "is_active")) patch.isActive = full.isActive;
  if (hasField(raw, "isPermanent", "is_permanent")) patch.isPermanent = full.isPermanent;
  if (hasField(raw, "cooldownHours", "cooldown_hours")) patch.cooldownHours = full.cooldownHours;
  if (hasField(raw, "maxScansPerDay", "max_scans_per_day", "maxUses", "max_uses")) {
    patch.maxScansPerDay = full.maxScansPerDay;
  }
  if (hasField(raw, "requiresStaffApproval", "requires_staff_approval")) {
    patch.requiresStaffApproval = full.requiresStaffApproval;
  }
  if (hasField(raw, "expiresAt", "expires_at")) patch.expiresAt = full.expiresAt;
  if (hasField(raw, "startsAt", "starts_at")) patch.startsAt = full.startsAt;
  if (hasField(raw, "metadata")) patch.metadata = full.metadata;
  if (hasField(raw, "imageUrl", "image_url")) patch.imageUrl = optionalString(raw.imageUrl ?? raw.image_url, 500) ?? null;
  if (hasField(raw, "qrPngUrl", "qr_png_url")) patch.qrPngUrl = optionalString(raw.qrPngUrl ?? raw.qr_png_url, 500) ?? null;

  return patch;
}

const rawCreateQrCodeBodySchema = z.record(z.string(), z.unknown());

const normalizedCreateQrCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
    .optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  type: legacyQrCodeTypeSchema,
  qrType: adminQrTypeSchema,
  eventId: uuidField.optional(),
  questId: uuidField.optional(),
  adminQuestId: uuidField.optional(),
  locationName: z.string().trim().max(120).optional(),
  locationKey: z.enum(CAMPUS_LOCATION_KEYS).nullable().optional(),
  locationAddress: z.string().trim().max(300).nullable().optional(),
  locationLat: z.number().min(-90).max(90).nullable().optional(),
  locationLng: z.number().min(-180).max(180).nullable().optional(),
  mapPinX: z.number().min(0).max(100).nullable().optional(),
  mapPinY: z.number().min(0).max(100).nullable().optional(),
  activityName: z.string().trim().max(120).optional(),
  xpReward: z.number().int().min(0).max(10000),
  isActive: z.boolean(),
  isPermanent: z.boolean(),
  cooldownHours: z.number().int().min(0).max(24 * 30),
  maxScansPerDay: z.number().int().min(0).max(999),
  requiresStaffApproval: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  startsAt: z.string().datetime().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  imageUrl: z.string().url().nullable().optional(),
  qrPngUrl: z.string().url().nullable().optional(),
});

export const createQrCodeSchema = rawCreateQrCodeBodySchema
  .transform((body) => normalizeCreateQrCodeInput(body as RawQrBody))
  .pipe(
    normalizedCreateQrCodeSchema.superRefine((value, ctx) => {
      const rawKey = value.locationKey;
      if (rawKey != null && !isCampusLocationKey(rawKey)) {
        ctx.addIssue({ code: "custom", path: ["locationKey"], message: "Invalid location_key." });
      }
      if (rawKey === "other" && !value.locationName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["locationName"],
          message: "Location name is required when location_key is other.",
        });
      }
    }),
  );

export const updateQrCodeSchema = rawCreateQrCodeBodySchema
  .transform((body) => {
    const patch = normalizePartialQrCodeInput(body as RawQrBody) as Partial<NormalizedCreateQrCodeInput> & {
      clearLinkedQuest?: boolean;
    };
    if (Object.keys(patch).length === 0) {
      throw new z.ZodError([
        {
          code: "custom",
          path: [],
          message: "At least one field is required to update a QR code.",
        },
      ]);
    }
    return patch;
  })
  .pipe(
    normalizedCreateQrCodeSchema
      .partial()
      .extend({ clearLinkedQuest: z.boolean().optional() }),
  );
