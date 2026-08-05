import { ZodError, z } from "zod";
import { ApiError, fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { formatZodError } from "@/lib/server/zodErrors";
import { readJson } from "@/lib/server/validation";

const prefSchema = z.object({
  allowTagsFrom: z.enum(["everyone", "following", "nobody"]).optional(),
  allowMentionsFrom: z.enum(["everyone", "following", "nobody"]).optional(),
  manuallyApproveTags: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:tag-prefs:get", limit: 30, windowMs: 60_000 });
    const admin = createAdminClient();
    const { data } = await admin
      .from("tag_preferences")
      .select("allow_tags_from, allow_mentions_from, manually_approve_tags, updated_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    return ok({
      allowTagsFrom: data?.allow_tags_from ?? "everyone",
      allowMentionsFrom: data?.allow_mentions_from ?? "everyone",
      manuallyApproveTags: data?.manually_approve_tags === true,
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:tag-prefs:patch", limit: 20, windowMs: 60_000 });
    const input = await readJson(request, prefSchema);
    const admin = createAdminClient();
    const patch = {
      user_id: auth.user.id,
      allow_tags_from: input.allowTagsFrom,
      allow_mentions_from: input.allowMentionsFrom,
      manually_approve_tags: input.manuallyApproveTags,
      updated_at: new Date().toISOString(),
    };
    // Only include defined fields for upsert
    const row: Record<string, unknown> = {
      user_id: auth.user.id,
      updated_at: patch.updated_at,
    };
    if (input.allowTagsFrom !== undefined) row.allow_tags_from = input.allowTagsFrom;
    if (input.allowMentionsFrom !== undefined) row.allow_mentions_from = input.allowMentionsFrom;
    if (input.manuallyApproveTags !== undefined) row.manually_approve_tags = input.manuallyApproveTags;

    const { data, error } = await admin
      .from("tag_preferences")
      .upsert(row, { onConflict: "user_id" })
      .select("allow_tags_from, allow_mentions_from, manually_approve_tags, updated_at")
      .single();
    if (error) throw new ApiError(400, error.message, "TAG_PREFS_SAVE_FAILED");
    return ok({
      allowTagsFrom: data.allow_tags_from,
      allowMentionsFrom: data.allow_mentions_from,
      manuallyApproveTags: data.manually_approve_tags === true,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    if (error instanceof ZodError) return fail(new ApiError(400, formatZodError(error), "VALIDATION_ERROR"));
    return fail(error);
  }
}
