import { ApiError } from "@/lib/server/http";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
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
