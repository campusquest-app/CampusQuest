import { z } from "zod";
import { ORGANIZATION_REQUEST_CATEGORIES } from "@/lib/organizationRequestCategories";

export const uuidSchema = z.string().uuid();

export const authSignupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(50).optional(),
});

export const authLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export const authResendConfirmationSchema = z.object({
  email: z.string().trim().email(),
});

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

export const beginnerQuestClaimSchema = z.object({
  questId: z.enum(["profile", "activity", "boss", "leaderboard", "guild"]),
});

export const legalConsentAcceptSchema = z.object({
  acceptedTerms: z.literal(true),
  acceptedPrivacy: z.literal(true),
  acceptedGuidelines: z.literal(true),
});

export const legalPolicyVersionSchema = z.object({
  version: z.string().trim().min(1).max(64),
});

export const connectionRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "Username must be 3-24 chars (a-z, 0-9, _)."),
});

export const connectionRespondSchema = z.object({
  requestId: uuidSchema,
  action: z.enum(["accept", "decline"]),
});

export const directConversationSchema = z.object({
  otherUserId: uuidSchema,
});

export const sendDirectMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const blockUserSchema = z.object({
  userId: uuidSchema,
  reason: z.string().trim().max(200).optional(),
});

export const reportMessageSchema = z.object({
  reason: z.enum(["harassment", "threat", "scam", "impersonation", "discrimination", "unsafe", "other"]),
  details: z.string().trim().max(1000).optional(),
});

/** Favorite / unfavorite inbox items (notifications & DMs); not moderation report. */
export const toggleFavoritedSchema = z.object({
  favorited: z.boolean(),
});

export const reportCampusContentSchema = z.object({
  reason: z.enum(["unsafe", "harassment", "scam", "inappropriate", "spam", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const resolveCampusContentReportSchema = z.object({
  reportId: uuidSchema,
  status: z.enum(["resolved", "dismissed"]),
  moderatorNote: z.string().trim().max(1000).optional(),
  reviewerUserId: uuidSchema.optional(),
  reviewerEmail: z.string().trim().email().optional(),
});

export const moderateCampusContentSchema = z.object({
  entityType: z.enum(["event", "organization"]),
  entityId: uuidSchema,
  action: z.enum(["remove", "restore"]),
  moderatorNote: z.string().trim().max(1000).optional(),
  reviewerUserId: uuidSchema.optional(),
  reviewerEmail: z.string().trim().email().optional(),
});

export const resolveMessageReportSchema = z.object({
  reportId: uuidSchema,
  status: z.enum(["resolved", "dismissed"]),
  moderatorNote: z.string().trim().max(1000).optional(),
  reviewerUserId: uuidSchema.optional(),
  reviewerEmail: z.string().trim().email().optional(),
});

export const setUserSafetyStatusSchema = z.object({
  userId: uuidSchema,
  status: z.enum(["active", "suspended", "banned"]),
  reason: z.string().trim().max(500).optional(),
  suspendedUntil: z.string().datetime().optional(),
  updatedBy: uuidSchema.optional(),
  adminEmail: z.string().trim().email().optional(),
});

export const safetyAppealSchema = z.object({
  message: z.string().trim().min(10).max(2000),
});

export const reviewSafetyAppealSchema = z.object({
  appealId: uuidSchema,
  status: z.enum(["approved", "denied", "reviewed"]),
  moderatorNote: z.string().trim().max(1000).optional(),
  reviewerUserId: uuidSchema.optional(),
  reviewerEmail: z.string().trim().email().optional(),
});

export const qrScanSchema = z.object({
  qrCode: z.string().trim().min(6).max(512),
});

export const proofUploadSchema = z.object({
  extension: z.enum(["jpg", "jpeg", "png", "webp"]),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileSizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  questId: uuidSchema,
  userQuestId: uuidSchema,
});

export const proofReviewSchema = z.object({
  submissionId: uuidSchema,
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(500).optional(),
  reviewerUserId: uuidSchema.optional(),
});

export const joinGuildSchema = z.object({
  guildId: uuidSchema,
});

export const createGuildSchema = z.object({
  name: z.string().trim().min(3).max(48),
  description: z.string().trim().max(400).optional(),
  isPublic: z.boolean().optional().default(true),
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
  questCompletionId: uuidSchema.optional(),
});

export const addInventoryItemSchema = z.object({
  itemId: uuidSchema,
  quantity: z.number().int().min(1).max(9999).default(1),
});

export const eventRsvpSchema = z.object({
  status: z.enum(["going", "interested", "not_going"]),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(1).max(3000),
  category: z.string().trim().min(2).max(80),
  locationName: z.string().trim().min(2).max(180),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  isPaid: z.boolean().optional().default(false),
  ticketLink: z.string().trim().url().optional(),
  hostOrganizationId: uuidSchema.optional(),
});

export const updateEventSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(1).max(3000).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  locationName: z.string().trim().min(2).max(180).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isPaid: z.boolean().optional(),
  ticketLink: z.string().trim().url().nullable().optional(),
  hostOrganizationId: uuidSchema.nullable().optional(),
  isCancelled: z.boolean().optional(),
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(2000),
  category: z.string().trim().min(2).max(80),
  logoUrl: z.string().trim().url().optional(),
  schoolName: z.string().trim().min(2).max(120).optional(),
  contactLink: z.string().trim().url().optional(),
});

export const organizationCreationRequestSchema = z.object({
  requestedName: z.string().trim().min(2).max(120),
  requestedCategory: z.string().refine(
    (val) => (ORGANIZATION_REQUEST_CATEGORIES as readonly string[]).includes(val),
    "Choose a category from the list.",
  ),
  description: z.string().trim().min(1).max(2000),
  contactLink: z.union([z.literal(""), z.undefined(), z.null(), z.string().trim().url()]).optional(),
  logoUrl: z.union([z.literal(""), z.undefined(), z.null(), z.string().trim().url()]).optional(),
});

export const organizationCreationRequestDenySchema = z.object({
  adminReason: z.string().trim().max(1000).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  logoUrl: z.string().trim().url().nullable().optional(),
  schoolName: z.string().trim().min(2).max(120).optional(),
  contactLink: z.string().trim().url().nullable().optional(),
  isApproved: z.boolean().optional(),
});

export const followOrganizationSchema = z.object({
  role: z.enum(["follower", "member"]).optional().default("follower"),
});

export const organizationDashboardSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  logoUrl: z.string().trim().url().nullable().optional(),
  contactLink: z.string().trim().url().nullable().optional(),
  requireJoinApproval: z.boolean().optional(),
});

export const organizationAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(180),
  message: z.string().trim().min(1).max(2000),
});

export const organizationMemberModerationSchema = z.object({
  action: z.enum(["approve_join", "deny_join", "set_role", "remove_member"]),
  requestId: uuidSchema.optional(),
  memberUserId: uuidSchema.optional(),
  role: z.enum(["owner", "admin", "member"]).optional(),
});

export const organizationEventCreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(1).max(3000),
  category: z.string().trim().min(2).max(80),
  locationName: z.string().trim().min(2).max(180),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  isPaid: z.boolean().optional().default(false),
  ticketLink: z.string().trim().url().optional(),
});

export const organizationEventUpdateSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().min(1).max(3000).optional(),
  category: z.string().trim().min(2).max(80).optional(),
  locationName: z.string().trim().min(2).max(180).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isPaid: z.boolean().optional(),
  ticketLink: z.string().trim().url().nullable().optional(),
  isCancelled: z.boolean().optional(),
});

export const organizationAdminModerationSchema = z.object({
  action: z.enum(["freeze", "unfreeze", "transfer_owner", "remove", "restore"]),
  organizationId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
  newOwnerUserId: uuidSchema.optional(),
});

export const onboardingPreferencesSchema = z.object({
  schoolName: z.string().trim().min(2).max(120),
  interests: z.array(z.string().trim().min(2).max(40)).min(1).max(8),
  discoveryFocus: z
    .array(z.enum(["events", "organizations", "meet_students"]))
    .min(1)
    .max(3),
  major: z.union([z.literal(""), z.string().trim().min(2).max(120)]).optional(),
});

export const patchMeProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60).optional(),
    display_name: z.string().trim().min(1).max(60).optional(),
    username: z.string().trim().min(3).max(24).regex(/^[a-z0-9_]+$/).optional(),
    avatarCustomJson: z.string().trim().min(1).max(120_000).optional(),
    avatar_url: z.string().trim().url().max(120_000).optional(),
    characterClassId: z.string().trim().max(64).nullable().optional(),
    starterWeapon: z.string().trim().max(64).nullable().optional(),
    scholarGuildId: z.string().trim().max(64).nullable().optional(),
    bio: z.string().trim().max(280).optional(),
    major: z.union([z.literal(""), z.string().trim().min(2).max(120)]).optional(),
    year: z.number().int().min(1900).max(3000).nullable().optional(),
    classYear: z.number().int().min(1900).max(3000).nullable().optional(),
    /** Serialized gameplay snapshot (equipment, extra counters); merged server-side. */
    gameStateJson: z.record(z.string(), z.unknown()).optional(),
    /** When true, server marks character onboarding saved (requires identity + avatar payload). */
    characterOnboardingComplete: z.literal(true).optional(),
    /** One-time acknowledgment: hides beginner-chain celebration on future loads/login. */
    beginnerChainCelebrationSeen: z.literal(true).optional(),
    /** Dev-only (ignored in production): clear celebration ack for retesting. */
    beginnerChainCelebrationSeenReset: z.literal(true).optional(),
    /** Persist first-time beginner intro overlay dismissal (cross-device). */
    starterIntroSeen: z.literal(true).optional(),
    /** Dev-only: clear persisted intro dismissal for onboarding QA. */
    starterIntroSeenReset: z.literal(true).optional(),
    /** When true and caller is moderation-admin, skips cooldown enforcement and does not bump name-change timestamps (repairs/migrations via API only). Ignored for other users. */
    preserveIdentityCooldownTimestamps: z.literal(true).optional(),
  })
  .superRefine((val, ctx) => {
    const displayNameValue = val.displayName ?? val.display_name;
    if (val.characterOnboardingComplete) {
      if (!displayNameValue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "displayName is required to finish character setup." });
      }
      if (!val.username) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "username is required to finish character setup." });
      }
      if (!val.avatarCustomJson) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "avatarCustomJson is required to finish character setup." });
      }
    }

    if (displayNameValue && (/<script\b|javascript:|[<>]/i.test(displayNameValue) || /[\u0000-\u001F\u007F]/.test(displayNameValue))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "displayName contains unsafe characters." });
    }
    if (val.bio && (/<script\b|javascript:|[<>]/i.test(val.bio) || /[\u0000-\u001F\u007F]/.test(val.bio))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "bio contains unsafe characters." });
    }
  });

export const patchMeStatsSchema = z
  .object({
    totalXp: z.number().int().min(0).max(9_007_199_254_740_991).optional(),
    strength: z.number().int().min(0).max(1_000_000).optional(),
    stamina: z.number().int().min(0).max(1_000_000).optional(),
    knowledge: z.number().int().min(0).max(1_000_000).optional(),
    social: z.number().int().min(0).max(1_000_000).optional(),
    focus: z.number().int().min(0).max(1_000_000).optional(),
    bossesDefeated: z.number().int().min(0).max(1_000_000).optional(),
    finalBossesDefeated: z.number().int().min(0).max(1_000_000).optional(),
  })
  .superRefine((val, ctx) => {
    const keys = [
      "totalXp",
      "strength",
      "stamina",
      "knowledge",
      "social",
      "focus",
      "bossesDefeated",
      "finalBossesDefeated",
    ] as const;
    if (!keys.some((k) => val[k] !== undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide at least one stat field to update." });
    }
  });

export const verifySchoolEmailSchema = z.object({
  acknowledge: z.literal(true).optional(),
});

const cosmeticIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(90)
  .regex(/^[\w:-]+$/);

/** Equip / unequip cosmetic slots (Loot Codex). Empty string clears a slot. */
export const patchMeEquipmentSchema = z.object({
  hat: z.union([cosmeticIdSchema, z.literal(""), z.null()]).optional(),
  glasses: z.union([cosmeticIdSchema, z.literal(""), z.null()]).optional(),
  backpack: z.union([cosmeticIdSchema, z.literal(""), z.null()]).optional(),
  extraSlots: z.record(z.string().min(1).max(40), z.union([cosmeticIdSchema, z.literal(""), z.null()])).optional(),
});

export const postQuadPostSchema = z.object({
  body: z.string().trim().min(1).max(300),
  proofUrl: z.string().max(120_000).nullable().optional(),
  visibility: z.enum(["public", "friends"]).optional(),
  ramMarks: z
    .array(
      z.object({
        id: z.string().optional(),
        tag: z.string().trim().min(1).max(15),
      }),
    )
    .max(10)
    .optional(),
  relatedActivityId: z.string().trim().max(120).nullable().optional(),
  relatedQuestSlug: z.string().trim().max(120).nullable().optional(),
  authorStreakDays: z.number().int().min(0).max(10_000).optional(),
});

export async function readJson<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const json = await request.json();
  return schema.parse(json);
}

