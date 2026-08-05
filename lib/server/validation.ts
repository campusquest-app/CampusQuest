import { z } from "zod";
import { CAMPUS_LOCATION_KEYS } from "@/lib/campusLocations";
import { CAMPUS_LOCATION_IDS } from "@/lib/locations/registry";
import { REALM_LOCATION_IDS } from "@/lib/realm/locationGeo";
import { ORGANIZATION_REQUEST_CATEGORIES } from "@/lib/organizationRequestCategories";
import { passwordMeetsRequirements } from "@/lib/passwordRequirements";

export const uuidSchema = z.string().uuid();

export const campusLocationSlugSchema = z.string().trim().regex(/^[a-z0-9-]{2,64}$/);

const passwordFieldSchema = z
  .string()
  .min(8, "PASSWORD_REQUIREMENTS")
  .max(128)
  .refine(passwordMeetsRequirements, { message: "PASSWORD_REQUIREMENTS" });

export const authSignupSchema = z.object({
  email: z.string().trim().email(),
  password: passwordFieldSchema,
  displayName: z.string().trim().min(1).max(50).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "Username must be 3-24 characters (a-z, 0-9, _).")
    .optional(),
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

export const connectionCancelSchema = z.object({
  requestId: uuidSchema,
});

export const createGroupConversationSchema = z.object({
  memberIds: z.array(uuidSchema).min(2).max(30),
  title: z.string().trim().max(80).optional(),
});

export const updateGroupConversationSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

export const addGroupMembersSchema = z.object({
  memberIds: z.array(uuidSchema).min(1).max(20),
});

export const removeGroupMemberSchema = z.object({
  memberId: uuidSchema,
});

export const directConversationSchema = z.object({
  otherUserId: uuidSchema,
});

export const sendDirectMessageSchema = z.object({
  content: z.string().trim().max(2000).optional(),
  type: z.enum(["text", "image", "shared_post", "audio"]).optional(),
  imageUrl: z.string().trim().url().max(2048).optional(),
  sharedPostId: uuidSchema.optional(),
  sharedPostType: z.enum(["quad", "memory"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const dmImageUploadSchema = z.object({
  conversationId: uuidSchema,
  imageDataUrl: z.string().trim().min(32).max(8_000_000),
});

export const dmAudioUploadSchema = z.object({
  conversationId: uuidSchema,
  audioDataUrl: z.string().trim().min(32).max(12_000_000),
});

export const sharePostToDmSchema = z.object({
  postId: uuidSchema,
  postType: z.enum(["quad", "memory"]),
  conversationIds: z.array(uuidSchema).min(1).max(20),
  optionalText: z.string().trim().max(2000).optional(),
  locationName: z.string().trim().max(120).optional(),
});

export const blockUserSchema = z.object({
  userId: uuidSchema,
  reason: z.string().trim().max(200).optional(),
});

export const reportMessageSchema = z.object({
  reason: z.enum(["harassment", "threat", "scam", "impersonation", "discrimination", "unsafe", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const pinDmUserSchema = z.object({
  pinnedUserId: uuidSchema,
});

/** Favorite / unfavorite inbox items (notifications & DMs); not moderation report. */
export const toggleFavoritedSchema = z.object({
  favorited: z.boolean(),
});

export const reportCampusContentSchema = z.object({
  reason: z.enum(["unsafe", "harassment", "scam", "inappropriate", "spam", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const reportQuadPostSchema = z.object({
  reason: z.enum(["harassment", "hate_speech", "nudity", "violence", "spam", "misinformation", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const contentReportReasonSchema = z.enum([
  "harassment",
  "hate_speech",
  "nudity",
  "violence",
  "spam",
  "misinformation",
  "copyright_infringement",
  "restricted_content",
  "impersonation",
  "other",
]);

export const reportUserSchema = z.object({
  reason: contentReportReasonSchema,
  details: z.string().trim().max(2000).optional(),
});

export const reportCommentSchema = z.object({
  reason: contentReportReasonSchema,
  details: z.string().trim().max(2000).optional(),
  reportedUserId: uuidSchema.optional(),
});

export const reportInfringementSchema = z.object({
  reason: z.enum(["copyright_infringement", "other"]).default("copyright_infringement"),
  details: z.string().trim().min(20).max(2000),
  contentUrl: z.string().trim().url().max(2000).optional(),
  targetId: uuidSchema.optional(),
});

/** Self-serve account deletion — must type DELETE to confirm. */
export const deleteOwnAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export const resolveQuadPostReportSchema = z.object({
  reportId: uuidSchema,
  status: z.enum(["resolved", "dismissed", "reviewing"]),
  moderatorNote: z.string().trim().max(1000).optional(),
  reviewerUserId: uuidSchema.optional(),
  reviewerEmail: z.string().trim().email().optional(),
});

export const deleteReportedQuadPostSchema = z.object({
  postId: uuidSchema,
  moderatorNote: z.string().trim().max(1000).optional(),
  reviewerUserId: uuidSchema.optional(),
  reviewerEmail: z.string().trim().email().optional(),
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
  parentCommentId: uuidSchema.nullable().optional(),
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

export const createEventSchema = z
  .object({
    title: z.string().trim().min(3, "Title is required.").max(180),
    description: z.string().trim().min(1, "Description is required.").max(3000),
    category: z.string().trim().min(2, "Category is required.").max(80),
    locationName: z.string().trim().min(2, "Location is required.").max(180),
    startsAt: z
      .string()
      .trim()
      .min(1, "Start time is required.")
      .refine((value) => !Number.isNaN(Date.parse(value)), "Start time is invalid."),
    endsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), "End time is invalid.")
      .optional(),
    isPaid: z.boolean().optional().default(false),
    ticketPriceCents: z.number().int().min(1).max(10_000_000).optional(),
    ticketLink: z.string().trim().url().optional(),
    hostOrganizationId: uuidSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.endsAt && new Date(val.endsAt).getTime() <= new Date(val.startsAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "End time must be after start time.",
      });
    }
    if (val.isPaid && !val.ticketPriceCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ticketPriceCents"],
        message: "Price is required for paid events.",
      });
    }
  });

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().min(1).max(3000).optional(),
    category: z.string().trim().min(2).max(80).optional(),
    locationName: z.string().trim().min(2).max(180).optional(),
    startsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Start time is invalid.")
      .optional(),
    endsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), "End time is invalid.")
      .nullable()
      .optional(),
    isPaid: z.boolean().optional(),
    ticketPriceCents: z.number().int().min(1).max(10_000_000).nullable().optional(),
    ticketLink: z.string().trim().url().nullable().optional(),
    hostOrganizationId: uuidSchema.nullable().optional(),
    isCancelled: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.startsAt && val.endsAt && new Date(val.endsAt).getTime() <= new Date(val.startsAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "End time must be after start time.",
      });
    }
    if (val.isPaid === true && !val.ticketPriceCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ticketPriceCents"],
        message: "Price is required for paid events.",
      });
    }
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
    /** Display preference: Level/XP/Streak top nav bar. */
    showXpProgressBar: z.boolean().optional(),
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

/** Large data URLs accepted only on /api/quad/posts/proof (upload before create). */
export const quadPostProofUploadSchema = z.object({
  proofDataUrl: z
    .string()
    .min(30, "proofDataUrl is required.")
    .max(6_000_000, "Proof image payload is too large.")
    .refine((s) => s.trim().startsWith("data:image/"), "proofDataUrl must be a data:image/ URL."),
});

export const postQuadPostSchema = z
  .object({
    // Caption may be empty when an image is attached (image-only photo post).
    body: z.string().trim().max(300),
    proofUrl: z.preprocess(
      (val) => {
        if (val === null || val === undefined) return undefined;
        if (typeof val === "string" && val.trim() === "") return undefined;
        return typeof val === "string" ? val.trim() : val;
      },
      z
        .string()
        .max(2048, "proofUrl must be a storage URL (upload the image first).")
        .refine((s) => !s.startsWith("data:"), "Upload the image before posting; raw image data is not accepted.")
        .refine((s) => /^https?:\/\//i.test(s), "proofUrl must be an http(s) URL.")
        .optional(),
    ),
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
    locationId: campusLocationSlugSchema.optional(),
    locationName: z.string().trim().max(80).optional(),
    tags: z
      .array(
        z.object({
          entityType: z.enum(["user", "organization", "event", "external_event"]),
          entityId: uuidSchema,
          displayLabel: z.string().trim().min(1).max(120).optional(),
          subtitle: z.string().trim().max(200).nullable().optional(),
          mentionSlug: z.string().trim().max(64).nullable().optional(),
        }),
      )
      .max(20)
      .optional(),
    photoTags: z
      .array(
        z.object({
          entityType: z.enum(["user", "organization", "event", "external_event"]),
          entityId: uuidSchema,
          mediaKey: z.string().trim().max(64).default("primary"),
          positionX: z.number().min(0).max(1),
          positionY: z.number().min(0).max(1),
          displayLabel: z.string().trim().min(1).max(120).optional(),
        }),
      )
      .max(40)
      .optional(),
    mentions: z
      .array(
        z.object({
          entityType: z.enum(["user", "organization", "event", "external_event"]),
          entityId: uuidSchema,
          displayText: z.string().trim().min(1).max(80),
          startIndex: z.number().int().min(0).max(300),
          endIndex: z.number().int().min(0).max(300),
        }),
      )
      .max(20)
      .optional(),
  })
  .refine((data) => data.body.length > 0 || (typeof data.proofUrl === "string" && data.proofUrl.length > 0), {
    message: "Add a caption or a photo to post.",
    path: ["body"],
  });

export const patchQuadPostSchema = z
  .object({
    body: z.string().trim().min(1).max(300).optional(),
    visibility: z.enum(["public", "friends"]).optional(),
    locationId: campusLocationSlugSchema.nullable().optional(),
    locationName: z.string().trim().max(80).nullable().optional(),
  })
  .refine(
    (data) =>
      data.body !== undefined
      || data.visibility !== undefined
      || data.locationId !== undefined
      || data.locationName !== undefined,
    { message: "At least one field is required to update a post." },
  );

export const campusQrScanSchema = z.object({
  /** Short codes like GYM (3 chars) must be accepted. */
  code: z.string().trim().min(1).max(128),
  deviceHint: z.string().trim().max(120).optional(),
  /** Client-generated key; duplicate POSTs must not award XP twice. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const qrCodeTypeSchema = z.enum([
  "event",
  "quest",
  "permanent_location",
  "tutoring",
  "advising",
  "reward",
  "general",
]);

export { createQrCodeSchema, updateQrCodeSchema } from "@/lib/server/qrCodeInput";

export const adminQrScansQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const adminQuestDifficultySchema = z.enum(["easy", "medium", "hard", "legendary"]);
const adminQuestTypeSchema = z.enum(["daily", "one_time", "event", "location", "qr"]);
const adminQuestCompletionMethodSchema = z.enum(["manual_log", "qr_scan", "location_checkin", "admin_approval"]);
const adminQuestVisibilitySchema = z.enum(["active", "hidden", "draft", "deleted"]);
const adminQuestRepeatTypeSchema = z.enum(["one_time", "daily", "weekly", "monthly", "custom"]);
const adminQuestRepeatLimitSchema = z.enum(["once_per_user", "once_per_day", "once_per_week", "unlimited"]);

const adminQuestCampusLocationKeySchema = z.enum([
  "quad",
  "library",
  "memorial_union",
  "mackal_rec_center",
  "ryan_center",
  "dining_hall",
  "dorm_residence",
  "academic_building",
  "other",
]);

export const createAdminQuestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(2000),
  xpReward: z.number().int().min(1).max(10000),
  difficulty: adminQuestDifficultySchema,
  questType: adminQuestTypeSchema,
  locationName: z.string().trim().max(200).optional(),
  locationKey: adminQuestCampusLocationKeySchema.optional(),
  locationAddress: z.string().trim().max(300).optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  mapPinX: z.number().min(0).max(100).optional(),
  mapPinY: z.number().min(0).max(100).optional(),
  requiresQr: z.boolean().optional(),
  completionMethod: adminQuestCompletionMethodSchema,
  visibilityStatus: adminQuestVisibilitySchema.optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  activeDurationMinutes: z.number().int().min(1).max(60 * 24 * 90).optional(),
  repeatType: adminQuestRepeatTypeSchema.optional(),
  repeatLimit: adminQuestRepeatLimitSchema.optional(),
  isRepeatable: z.boolean().optional(),
  expiresAutomatically: z.boolean().optional(),
  icon: z.string().trim().max(16).optional(),
  imageUrl: z.string().url().optional(),
  organizationId: uuidSchema.optional(),
  eventId: uuidSchema.optional(),
});

export const updateAdminQuestSchema = createAdminQuestSchema.partial().extend({
  locationKey: adminQuestCampusLocationKeySchema.nullable().optional(),
  locationName: z.string().trim().max(200).nullable().optional(),
  locationAddress: z.string().trim().max(300).nullable().optional(),
  locationLat: z.number().min(-90).max(90).nullable().optional(),
  locationLng: z.number().min(-180).max(180).nullable().optional(),
  mapPinX: z.number().min(0).max(100).nullable().optional(),
  mapPinY: z.number().min(0).max(100).nullable().optional(),
});

export const adminQuestVisibilitySchema2 = z.object({
  visibilityStatus: adminQuestVisibilitySchema,
});

export const adminQuestDeleteSchema = z.object({
  hardDelete: z.boolean().optional(),
});

export const completeAdminQuestSchema = z.object({
  proofUrl: z.string().trim().max(2000).optional(),
});

export const questBoardQuerySchema = z.object({
  filter: z.enum(["all", "daily", "nearby", "qr", "active", "completed"]).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  locationId: z.string().trim().min(1).max(80).optional(),
});

export const createQuestTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
  defaultXp: z.number().int().min(1).max(10000),
  defaultDifficulty: adminQuestDifficultySchema,
  defaultCompletionMethod: adminQuestCompletionMethodSchema,
  defaultQuestType: adminQuestTypeSchema,
  defaultRepeatType: adminQuestRepeatTypeSchema.optional(),
  defaultRepeatLimit: adminQuestRepeatLimitSchema.optional(),
  defaultDurationMinutes: z.number().int().min(1).optional(),
  defaultRequiresQr: z.boolean().optional(),
  defaultMapEnabled: z.boolean().optional(),
  defaultImage: z.string().trim().max(500).optional(),
});

export const realmMarkerPositionSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const realmMarkerPositionsPatchSchema = z.object({
  positions: z.record(z.string().regex(/^[a-z0-9-]{2,64}$/), realmMarkerPositionSchema),
});

export const createCampusLocationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(["building", "landmark", "dining", "recreation", "academic", "other"]).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  mapX: z.number().min(0).max(100).nullable().optional(),
  mapY: z.number().min(0).max(100).nullable().optional(),
  markerEmoji: z.string().trim().max(8).optional(),
  shortLabel: z.string().trim().max(40).optional(),
  fantasyName: z.string().trim().max(120).optional(),
  flavorText: z.string().trim().max(500).optional(),
  major: z.boolean().optional(),
  slug: campusLocationSlugSchema.optional(),
  fromMarker: z
    .object({
      mapX: z.number().min(0).max(100),
      mapY: z.number().min(0).max(100),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
    })
    .optional(),
});

export const updateCampusLocationSchema = z.object({
  slug: campusLocationSlugSchema,
  patch: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    mapX: z.number().min(0).max(100).nullable().optional(),
    mapY: z.number().min(0).max(100).nullable().optional(),
    markerEmoji: z.string().trim().max(8).optional(),
    shortLabel: z.string().trim().max(40).optional(),
    isActive: z.boolean().optional(),
  }),
});

const campusMemoryMediaUrlSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === "string" && val.trim() === "") return undefined;
    return typeof val === "string" ? val.trim() : val;
  },
  z
    .string()
    .max(2048)
    .refine((s) => !s.startsWith("data:"), "Upload media before creating a Memory.")
    .refine((s) => /^https?:\/\//i.test(s), "mediaUrl must be an http(s) URL.")
    .optional(),
);

export const campusMemoryMediaUploadSchema = z.object({
  // Legacy small data-URL path. The client now compresses + uploads a Blob via
  // multipart, so this cap only guards the rare fallback; keep it generous and
  // never surface a scary "too large" error to users.
  mediaDataUrl: z
    .string()
    .min(30, "mediaDataUrl is required.")
    .max(12_000_000, "Couldn't upload your photo. Please try again.")
    .refine((s) => s.trim().startsWith("data:image/"), "mediaDataUrl must be a data:image/ URL."),
});

export const createCampusMemorySchema = z
  .object({
    locationId: campusLocationSlugSchema.optional(),
    locationKey: z.enum(CAMPUS_LOCATION_KEYS).optional(),
    locationName: z.string().trim().max(200).optional(),
    eventId: uuidSchema.nullable().optional(),
    mediaUrl: campusMemoryMediaUrlSchema,
    mediaType: z.enum(["text", "image", "video"]).default("text"),
    body: z.preprocess(
      (val) => {
        if (val === null || val === undefined) return undefined;
        if (typeof val === "string" && val.trim() === "") return undefined;
        return val;
      },
      z.string().trim().max(500).optional(),
    ),
    visibility: z.enum(["public", "friends", "campus"]).optional(),
  })
  .refine((data) => Boolean(data.locationId || data.locationKey), {
    message: "Pick a campus location.",
    path: ["locationId"],
  })
  .refine(
    (data) =>
      (data.mediaType === "text" && (data.body?.length ?? 0) > 0)
      || ((data.mediaType === "image" || data.mediaType === "video") && typeof data.mediaUrl === "string"),
    { message: "Add text or upload media for this Memory.", path: ["body"] },
  );

export const patchCampusMemorySchema = z
  .object({
    savedToProfile: z.boolean().optional(),
  })
  .refine((data) => data.savedToProfile !== undefined, {
    message: "At least one field is required.",
  });

export const adminXpAdjustSchema = z.object({
  amount: z.number().int().min(1).max(1_000_000),
  action: z.enum(["add", "subtract"]),
  reason: z.string().trim().min(3).max(500),
});

export const updateExternalEventPlacementSchema = z.object({
  externalEventId: uuidSchema,
  realmLocationId: campusLocationSlugSchema.nullable().optional(),
  customLat: z.number().min(-90).max(90).nullable().optional(),
  customLng: z.number().min(-180).max(180).nullable().optional(),
  customLabel: z.string().trim().max(120).nullable().optional(),
  normalizedLocationText: z.string().trim().max(300).nullable().optional(),
  matchStatus: z.enum(["manually_adjusted", "hidden", "ignored", "verified"]).optional(),
});

export const verifyExternalEventPlacementSchema = z.object({
  externalEventId: uuidSchema,
  registrySlug: campusLocationSlugSchema.optional(),
});

export async function readJson<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const json = await request.json();
  return schema.parse(json);
}

