import { ApiError } from "@/lib/server/http";
import { logAdminAuditAction } from "@/lib/server/audit";
import type { QuadPostReportReason } from "@/lib/quadPostReportReasons";
import { createAdminClient } from "@/lib/server/supabase";
import { deleteQuadPost } from "@/lib/server/quadPostMutations";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export async function reportQuadPost(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  reason: QuadPostReportReason;
  details?: string;
}) {
  const { userClient, userId, postId, reason, details } = args;

  const { data: post, error: postError } = await userClient
    .from("quad_posts")
    .select("id, user_id")
    .eq("id", postId)
    .maybeSingle();
  if (postError) throw new ApiError(400, postError.message, "QUAD_POST_LOOKUP_FAILED");
  if (!post) throw new ApiError(404, "Post not found.", "QUAD_POST_NOT_FOUND");
  if (post.user_id === userId) {
    throw new ApiError(403, "You cannot report your own post.", "QUAD_POST_SELF_REPORT");
  }

  const { data: existing, error: existingError } = await userClient
    .from("quad_post_reports")
    .select("id")
    .eq("post_id", postId)
    .eq("reporter_id", userId)
    .maybeSingle();
  if (existingError) throw new ApiError(400, existingError.message, "QUAD_POST_REPORT_LOOKUP_FAILED");
  if (existing) {
    throw new ApiError(409, "You already reported this post.", "QUAD_POST_ALREADY_REPORTED");
  }

  const { data, error } = await userClient
    .from("quad_post_reports")
    .insert({
      post_id: postId,
      reporter_id: userId,
      post_owner_id: post.user_id,
      reason,
      details: details?.trim() ? details.trim().slice(0, 1000) : null,
      status: "open",
    })
    .select("id, status, reason, created_at")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not submit report.", "QUAD_POST_REPORT_FAILED");
  }
  return data;
}

export async function listQuadPostReportsForModeration(limit = 100) {
  const admin = createAdminClient();
  const capped = Math.max(1, Math.min(200, limit));
  const { data: rows, error } = await admin
    .from("quad_post_reports")
    .select(
      "id, post_id, reporter_id, post_owner_id, reason, details, status, moderator_note, reviewed_by, reviewed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new ApiError(400, error.message, "QUAD_POST_REPORTS_FETCH_FAILED");

  const reports = rows ?? [];
  const profileIds = Array.from(
    new Set(
      reports.flatMap((row) => [row.reporter_id, row.post_owner_id, row.reviewed_by].filter(Boolean)),
    ),
  ) as string[];
  const postIds = reports.map((row) => row.post_id);

  const [profilesRes, postsRes] = await Promise.all([
    profileIds.length
      ? admin.from("profiles").select("id, username, display_name").in("id", profileIds)
      : Promise.resolve({ data: [], error: null } as any),
    postIds.length
      ? admin.from("quad_posts").select("id, body, proof_url, user_id, created_at").in("id", postIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (profilesRes.error) throw new ApiError(400, profilesRes.error.message, "REPORT_PROFILES_FETCH_FAILED");
  if (postsRes.error) throw new ApiError(400, postsRes.error.message, "REPORT_POSTS_FETCH_FAILED");

  const profileMap = new Map((profilesRes.data ?? []).map((row: any) => [row.id, row]));
  const postMap = new Map((postsRes.data ?? []).map((row: any) => [row.id, row]));

  return reports.map((row) => ({
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    moderatorNote: row.moderator_note,
    reporter: profileMap.get(row.reporter_id) ?? null,
    postOwner: profileMap.get(row.post_owner_id) ?? null,
    post: postMap.get(row.post_id) ?? null,
  }));
}

export async function resolveQuadPostReport(args: {
  reportId: string;
  status: "resolved" | "dismissed" | "reviewing";
  moderatorNote?: string;
  reviewerUserId?: string;
  reviewerEmail?: string;
}) {
  const { reportId, status, moderatorNote, reviewerUserId, reviewerEmail } = args;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quad_post_reports")
    .update({
      status,
      moderator_note: moderatorNote?.trim() ? moderatorNote.trim().slice(0, 1000) : null,
      reviewed_by: reviewerUserId ?? null,
      reviewed_at: status === "reviewing" ? null : new Date().toISOString(),
    })
    .eq("id", reportId)
    .select("id, status, post_id")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not update report.", "QUAD_POST_REPORT_RESOLVE_FAILED");
  }

  await logAdminAuditAction({
    actionType: status === "resolved" ? "report_resolved" : status === "dismissed" ? "report_dismissed" : "report_reviewing",
    adminUserId: reviewerUserId ?? null,
    adminEmail: reviewerEmail ?? null,
    reason: moderatorNote ?? null,
    metadata: { entityType: "quad_post", reportId: data.id, status: data.status, postId: data.post_id },
  });

  return data;
}

export async function deleteReportedQuadPost(args: {
  postId: string;
  reviewerUserId: string;
  reviewerEmail?: string;
  moderatorNote?: string;
}) {
  const admin = createAdminClient();
  await deleteQuadPost({
    userClient: admin,
    adminClient: admin,
    postId: args.postId,
    userId: args.reviewerUserId,
    isAdmin: true,
  });

  await logAdminAuditAction({
    actionType: "quad_post_removed",
    adminUserId: args.reviewerUserId,
    adminEmail: args.reviewerEmail ?? null,
    reason: args.moderatorNote ?? null,
    metadata: { postId: args.postId },
  });

  return { postId: args.postId, deleted: true as const };
}
