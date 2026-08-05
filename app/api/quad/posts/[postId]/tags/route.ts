import { ZodError, z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { formatZodError } from "@/lib/server/zodErrors";
import { readJson, uuidSchema } from "@/lib/server/validation";
import { persistPostTagsAndMentions } from "@/lib/server/postTagService";

const postSchema = z.object({
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
});

/** Author can add tags/mentions after publish. Only newly added entities notify. */
export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:tags:post", limit: 30, windowMs: 60_000 });
    const { postId } = await context.params;
    const parsed = uuidSchema.safeParse(postId);
    if (!parsed.success) throw new ApiError(400, "Invalid post id.", "INVALID_POST_ID");
    const input = await readJson(request, postSchema);

    const { data: post, error } = await auth.userClient
      .from("quad_posts")
      .select("id, user_id")
      .eq("id", parsed.data)
      .maybeSingle();
    if (error || !post) throw new ApiError(404, "Post not found.", "POST_NOT_FOUND");
    if (post.user_id !== auth.user.id) {
      throw new ApiError(403, "Only the author can add tags.", "TAG_FORBIDDEN");
    }

    const { data: profile } = await auth.userClient
      .from("profiles")
      .select("username")
      .eq("id", auth.user.id)
      .maybeSingle();

    await persistPostTagsAndMentions({
      postId: parsed.data,
      authorId: auth.user.id,
      authorUsername: profile?.username?.trim() || "Someone",
      composerTags: (input.tags ?? []).map((t) => ({
        entityType: t.entityType,
        entityId: t.entityId,
        displayLabel: t.displayLabel ?? t.entityType,
        subtitle: t.subtitle ?? null,
        mentionSlug: t.mentionSlug ?? null,
      })),
      photoTags: (input.photoTags ?? []).map((t) => ({
        entityType: t.entityType,
        entityId: t.entityId,
        mediaKey: t.mediaKey || "primary",
        positionX: t.positionX,
        positionY: t.positionY,
        displayLabel: t.displayLabel ?? t.entityType,
      })),
      mentions: (input.mentions ?? []).map((m) => ({
        entityType: m.entityType,
        entityId: m.entityId,
        displayText: m.displayText,
        startIndex: m.startIndex,
        endIndex: m.endIndex,
      })),
    });

    return ok({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}
