import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const createProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "Username must be 3-24 chars (a-z, 0-9, _)."),
  displayName: z.string().trim().min(1).max(50),
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z.string().url().optional(),
  campus: z.string().trim().min(1).max(100).optional(),
  classYear: z.number().int().min(1900).max(3000).optional(),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z.string().url().optional(),
  campus: z.string().trim().min(1).max(100).optional(),
  classYear: z.number().int().min(1900).max(3000).optional(),
});

export const logActivitySchema = z.object({
  activityId: uuidSchema,
  minutes: z.number().int().min(1).max(720).optional(),
  proofSubmissionId: uuidSchema.optional(),
});

export const addXpSchema = z.object({
  amount: z.number().int().min(1).max(100000),
  sourceType: z.enum(["activity", "quest", "boss", "guild", "manual", "streak_bonus"]),
  sourceId: uuidSchema.optional(),
  activityId: uuidSchema.optional(),
  note: z.string().trim().max(200).optional(),
});

export const completeQuestSchema = z.object({
  userQuestId: uuidSchema,
});

export const proofUploadSchema = z.object({
  extension: z.enum(["jpg", "jpeg", "png", "webp"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const joinGuildSchema = z.object({
  guildId: uuidSchema,
});

export const createPostSchema = z.object({
  body: z.string().trim().min(1).max(500),
  imageUrl: z.string().url().optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(300),
});

export const likeSchema = z.object({
  liked: z.boolean(),
});

export const startBossSchema = z.object({
  bossId: uuidSchema,
});

export const attemptBossSchema = z.object({
  bossId: uuidSchema,
  activityId: uuidSchema.optional(),
});

export const addInventoryItemSchema = z.object({
  itemId: uuidSchema,
  quantity: z.number().int().min(1).max(9999).default(1),
});

export async function readJson<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const json = await request.json();
  return schema.parse(json);
}

