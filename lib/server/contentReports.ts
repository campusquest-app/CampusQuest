import { ApiError } from "@/lib/server/http";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { logAdminAuditAction } from "@/lib/server/audit";
import type { ContentReportReason, ContentReportTargetType } from "@/lib/contentReportReasons";
import { createAdminClient } from "@/lib/server/supabase";

type UserClient = {
  from: (table: string) => any;
};

const ABUSE_RATE_LIMIT_MESSAGE = "You're doing that too often. Please try again later.";

export async function createContentReport(args: {
  userClient: UserClient;
  reporterId: string;
  targetType: ContentReportTargetType;
  targetId?: string | null;
  reportedUserId?: string | null;
  reason: ContentReportReason;
  details?: string | null;
}) {
  const {
    userClient,
    reporterId,
    targetType,
    targetId = null,
    reportedUserId = null,
    reason,
    details,
  } = args;

  await assertAccountCanSocialize(userClient as never, reporterId);

  if (reportedUserId && reportedUserId === reporterId) {
    throw new ApiError(400, "You cannot report yourself.", "REPORT_SELF_FORBIDDEN");
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: recentCount, error: recentError } = await userClient
    .from("content_reports")
    .select("*", { count: "exact", head: true })
    .eq("reporter_id", reporterId)
    .gte("created_at", tenMinutesAgo);
  if (recentError) throw new ApiError(400, recentError.message, "REPORT_SPAM_CHECK_FAILED");
  if ((recentCount ?? 0) >= 10) {
    throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
  }

  if (targetId) {
    const { data: existing } = await userClient
      .from("content_reports")
      .select("id")
      .eq("reporter_id", reporterId)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();
    if (existing) {
      throw new ApiError(409, "You already reported this.", "CONTENT_ALREADY_REPORTED");
    }
  }

  const { data, error } = await userClient
    .from("content_reports")
    .insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reported_user_id: reportedUserId,
      reason,
      details: details?.trim() ? details.trim().slice(0, 2000) : null,
      status: "open",
    })
    .select("id, target_type, reason, status, created_at")
    .single();

  if (error || !data) {
    if (typeof error?.message === "string" && /duplicate|unique/i.test(error.message)) {
      throw new ApiError(409, "You already reported this.", "CONTENT_ALREADY_REPORTED");
    }
    throw new ApiError(400, error?.message ?? "Could not submit report.", "CONTENT_REPORT_FAILED");
  }

  return data as {
    id: string;
    target_type: string;
    reason: string;
    status: string;
    created_at: string;
  };
}

export type ContentReportModerationStatus = "open" | "reviewing" | "resolved" | "dismissed";

type ProfileSummary = { id: string; username: string; display_name: string };

/**
 * Admin moderation queue for user, comment, infringement, marketplace and
 * other `content_reports` rows (message, post, event and organization reports
 * have their own queues). Service role; callers must already be admin-authorized.
 */
export async function listContentReportsForModeration(limit = 100) {
  const admin = createAdminClient();
  const capped = Math.max(1, Math.min(200, limit));
  const { data: rows, error } = await admin
    .from("content_reports")
    .select(
      "id, reporter_id, target_type, target_id, reported_user_id, reason, details, status, moderator_note, reviewed_by, reviewed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new ApiError(400, error.message, "CONTENT_REPORTS_LIST_FAILED");

  const reports = (rows ?? []) as Array<{
    id: string;
    reporter_id: string;
    target_type: string;
    target_id: string | null;
    reported_user_id: string | null;
    reason: string;
    details: string | null;
    status: ContentReportModerationStatus;
    moderator_note: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;

  const profileIds = Array.from(
    new Set(reports.flatMap((row) => [row.reporter_id, row.reported_user_id, row.reviewed_by].filter(Boolean))),
  ) as string[];
  const commentIds = reports.filter((row) => row.target_type === "comment" && row.target_id).map((row) => row.target_id as string);

  const [profilesRes, commentsRes] = await Promise.all([
    profileIds.length
      ? admin.from("profiles").select("id, username, display_name").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileSummary[], error: null }),
    commentIds.length
      ? admin.from("quad_post_comments").select("id, body, user_id, post_id").in("id", commentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; body: string; user_id: string; post_id: string }>, error: null }),
  ]);
  if (profilesRes.error) throw new ApiError(400, profilesRes.error.message, "REPORT_PROFILES_FETCH_FAILED");

  const profileMap = new Map<string, ProfileSummary>(((profilesRes.data ?? []) as ProfileSummary[]).map((row) => [row.id, row]));
  const commentMap = new Map(
    (((commentsRes.error ? [] : commentsRes.data) ?? []) as Array<{ id: string; body: string; user_id: string; post_id: string }>).map(
      (row) => [row.id, row],
    ),
  );

  return reports.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    moderatorNote: row.moderator_note,
    reporter: profileMap.get(row.reporter_id) ?? null,
    reportedUser: row.reported_user_id ? (profileMap.get(row.reported_user_id) ?? null) : null,
    comment: row.target_type === "comment" && row.target_id ? (commentMap.get(row.target_id) ?? null) : null,
  }));
}

export async function resolveContentReport(args: {
  reportId: string;
  status: Exclude<ContentReportModerationStatus, "open">;
  moderatorNote?: string;
  reviewerUserId?: string;
  reviewerEmail?: string;
}) {
  const { reportId, status, moderatorNote, reviewerUserId, reviewerEmail } = args;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_reports")
    .update({
      status,
      moderator_note: moderatorNote?.trim() ? moderatorNote.trim().slice(0, 1000) : null,
      reviewed_by: reviewerUserId ?? null,
      reviewed_at: status === "reviewing" ? null : new Date().toISOString(),
    })
    .eq("id", reportId)
    .select("id, status, target_type, target_id, reported_user_id")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not update report.", "CONTENT_REPORT_RESOLVE_FAILED");
  }

  await logAdminAuditAction({
    actionType: status === "resolved" ? "report_resolved" : status === "dismissed" ? "report_dismissed" : "report_reviewing",
    adminUserId: reviewerUserId ?? null,
    adminEmail: reviewerEmail ?? null,
    targetUserId: (data as { reported_user_id?: string | null }).reported_user_id ?? null,
    reason: moderatorNote ?? null,
    metadata: {
      entityType: "content_report",
      reportId: data.id,
      status: data.status,
      targetType: (data as { target_type?: string }).target_type ?? null,
      targetId: (data as { target_id?: string | null }).target_id ?? null,
    },
  });

  return data as { id: string; status: ContentReportModerationStatus };
}

/** Admin list of open content reports (service role). */
export async function listOpenContentReports(limit = 50) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_reports")
    .select(
      "id, reporter_id, target_type, target_id, reported_user_id, reason, details, status, created_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) throw new ApiError(400, error.message, "CONTENT_REPORTS_LIST_FAILED");
  return data ?? [];
}
