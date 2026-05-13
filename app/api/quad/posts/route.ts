import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { postQuadPostSchema, readJson, uuidSchema } from "@/lib/server/validation";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

function normalizeRamMarks(input: { id?: string; tag: string }[] | undefined): { id: string; tag: string }[] {
  if (!input?.length) return [];
  return input
    .map((r, i) => ({
      id: r.id && r.id.length > 0 ? r.id : `rm-${i}-${r.tag}`,
      tag: r.tag.trim().toLowerCase().slice(0, 15),
    }))
    .filter((r) => r.tag.length > 0)
    .slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:posts:get", limit: 120, windowMs: 60_000 });
    const { searchParams } = new URL(request.url);
    const limit = Math.min(120, Math.max(1, Math.floor(Number(searchParams.get("limit") || "60"))));
    const authorIdParam = searchParams.get("authorId")?.trim();

    let query = auth.userClient.from("quad_posts").select(
      `
        *,
        profiles (
          display_name,
          username,
          avatar_custom_json
        )
      `,
    );

    if (authorIdParam) {
      const parsed = uuidSchema.safeParse(authorIdParam);
      if (!parsed.success) {
        throw new ApiError(400, "Invalid author id.", "INVALID_AUTHOR");
      }
      query = query.eq("user_id", authorIdParam);
      if (authorIdParam !== auth.user.id) {
        query = query.eq("visibility", "public");
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

    if (error) {
      throw new ApiError(400, error.message ?? "Could not load Quad posts.", "QUAD_POSTS_LIST_FAILED");
    }

    return ok({ posts: (data ?? []) as unknown as QuadPostApiRow[] });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:posts:post", limit: 30, windowMs: 60_000 });
    const input = await readJson(request, postQuadPostSchema);

    const proof = input.proofUrl?.trim();
    if (proof && proof.length > 120_000) {
      throw new ApiError(400, "Proof image is too large.", "PROOF_TOO_LARGE");
    }

    const ramMarks = normalizeRamMarks(input.ramMarks);

    const insert = {
      user_id: auth.user.id,
      body: input.body.trim().slice(0, 300),
      proof_url: proof && proof.length > 0 ? proof : null,
      visibility: input.visibility ?? "public",
      ram_marks: ramMarks,
      related_activity_id: input.relatedActivityId ?? null,
      related_quest_slug: input.relatedQuestSlug ?? null,
      author_streak_days: input.authorStreakDays ?? null,
    };

    const { data: created, error: insErr } = await auth.userClient
      .from("quad_posts")
      .insert(insert)
      .select(
        `
        *,
        profiles (
          display_name,
          username,
          avatar_custom_json
        )
      `,
      )
      .single();

    if (insErr || !created) {
      throw new ApiError(400, insErr?.message ?? "Could not create post.", "QUAD_POST_CREATE_FAILED");
    }

    return ok({ post: created as unknown as QuadPostApiRow });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
