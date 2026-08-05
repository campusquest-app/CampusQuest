import { fail, ok } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { createAdminClient, requireAuthUser } from "@/lib/server/supabase";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import type { QuadPostApiRow } from "@/lib/quadFieldNote";

export type PendingTagItem = {
  tagId: string;
  postId: string;
  createdAt: string;
  tagSource: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  postPreview: {
    body: string;
    proofUrl: string | null;
    createdAt: string;
  };
};

/** Pending photo/composer tags the current user must approve. */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:pending-tags:get", limit: 60, windowMs: 60_000 });
    const admin = createAdminClient();

    const { data: tags, error } = await admin
      .from("post_tags")
      .select("id, post_id, tag_source, created_at, created_by")
      .eq("entity_type", "user")
      .eq("entity_id", auth.user.id)
      .eq("status", "pending")
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) {
      return ok({ tags: [] as PendingTagItem[] });
    }
    if (!tags?.length) return ok({ tags: [] as PendingTagItem[] });

    const postIds = Array.from(new Set(tags.map((t) => t.post_id as string)));
    const { data: posts } = await admin
      .from("quad_posts")
      .select(QUAD_POSTS_WITH_PROFILE_SELECT)
      .in("id", postIds);

    const postById = new Map(
      ((posts ?? []) as unknown as QuadPostApiRow[]).map((p) => [p.id, p]),
    );

    const items: PendingTagItem[] = [];
    for (const tag of tags) {
      const post = postById.get(tag.post_id as string);
      if (!post) continue;
      const p = post.profiles;
      const prof = Array.isArray(p) ? p[0] : p;
      items.push({
        tagId: tag.id as string,
        postId: post.id,
        createdAt: tag.created_at as string,
        tagSource: tag.tag_source as string,
        author: {
          id: post.user_id,
          username: (prof?.username ?? "student").trim() || "student",
          displayName: (prof?.display_name ?? "Student").trim() || "Student",
          avatarUrl: prof?.avatar_url ?? null,
        },
        postPreview: {
          body: post.body,
          proofUrl: post.proof_url,
          createdAt: post.created_at,
        },
      });
    }

    return ok({ tags: items });
  } catch (error) {
    return fail(error);
  }
}
