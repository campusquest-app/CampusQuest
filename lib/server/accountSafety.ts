import { ApiError } from "@/lib/server/http";
import { logAdminAuditAction } from "@/lib/server/audit";
import { createNotification } from "@/lib/server/notifications";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type AccountStatus = "active" | "suspended" | "banned";

export async function getAccountSafetyStatus(userClient: SupabaseClientLike, userId: string) {
  const { data, error } = await userClient
    .from("user_account_safety")
    .select("status, reason, suspended_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new ApiError(400, error.message, "ACCOUNT_SAFETY_FETCH_FAILED");
  }
  const status = (data?.status as AccountStatus | undefined) ?? "active";
  const suspendedUntil = data?.suspended_until ? new Date(data.suspended_until as string).getTime() : null;
  const now = Date.now();
  if (status === "suspended" && suspendedUntil && suspendedUntil <= now) {
    await userClient
      .from("user_account_safety")
      .upsert(
        {
          user_id: userId,
          status: "active",
          reason: null,
          suspended_until: null,
        },
        { onConflict: "user_id" },
      );
    return {
      status: "active" as const,
      reason: null,
      suspendedUntil: null,
    };
  }
  return {
    status,
    reason: (data?.reason as string | null | undefined) ?? null,
    suspendedUntil: (data?.suspended_until as string | null | undefined) ?? null,
  };
}

export async function assertAccountCanSocialize(userClient: SupabaseClientLike, userId: string) {
  const state = await getAccountSafetyStatus(userClient, userId);
  if (state.status === "banned") {
    throw new ApiError(403, "Your account is banned from social features.", "ACCOUNT_BANNED");
  }
  if (state.status === "suspended") {
    throw new ApiError(403, "Your account is suspended from social features.", "ACCOUNT_SUSPENDED");
  }
}

/** Eligible for public leaderboard rows (excluding active suspension and bans). Mirrors expired-suspension uplift in {@link getAccountSafetyStatus}. */
export function accountSafetyAllowsPublicLeaderboardExposure(
  row: { status?: string | null; suspended_until?: string | null } | null | undefined,
  nowMs = Date.now(),
): boolean {
  const status = (row?.status as string | null | undefined) ?? "active";
  if (status === "banned") return false;
  if (status === "suspended") {
    const untilMs = row?.suspended_until ? new Date(row.suspended_until as string).getTime() : NaN;
    return Number.isFinite(untilMs) && untilMs <= nowMs;
  }
  return status === "active";
}

export async function setAccountSafetyStatus(args: {
  userId: string;
  status: AccountStatus;
  reason?: string;
  suspendedUntil?: string | null;
  updatedBy?: string | null;
  adminEmail?: string | null;
}) {
  const admin = createAdminClient();
  const { userId, status, reason, suspendedUntil, updatedBy, adminEmail } = args;
  const payload = {
    user_id: userId,
    status,
    reason: reason?.trim() ? reason.trim().slice(0, 500) : null,
    suspended_until: status === "suspended" ? suspendedUntil ?? null : null,
    updated_by: updatedBy ?? null,
  };
  const { data, error } = await admin
    .from("user_account_safety")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, status, reason, suspended_until, updated_by, updated_at")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not update account safety status.", "ACCOUNT_SAFETY_UPDATE_FAILED");
  }
  const actionType =
    status === "banned"
      ? "user_banned"
      : status === "suspended"
        ? "user_suspended"
        : "user_reactivated";
  await logAdminAuditAction({
    actionType,
    targetUserId: userId,
    adminUserId: updatedBy ?? null,
    adminEmail: adminEmail ?? null,
    reason: reason ?? null,
    metadata: {
      suspendedUntil: payload.suspended_until,
      status,
    },
  });
  try {
    await createNotification({
      userId,
      type: "moderation_safety_update",
      title: "Account safety status updated",
      body:
        status === "active"
          ? "Your account has been reactivated."
          : status === "suspended"
            ? "Your account is currently suspended from social features."
            : "Your account is currently banned from social features.",
      relatedEntityType: "account_safety",
      relatedEntityId: userId,
    });
  } catch {}
  return data;
}

export async function createSafetyAppeal(args: {
  userClient: SupabaseClientLike;
  userId: string;
  message: string;
}) {
  const { userClient, userId, message } = args;
  const state = await getAccountSafetyStatus(userClient, userId);
  if (state.status === "active") {
    throw new ApiError(409, "Your account is currently active and does not require appeal.", "APPEAL_NOT_REQUIRED");
  }
  const trimmed = message.trim();
  if (trimmed.length < 10) {
    throw new ApiError(400, "Appeal message must be at least 10 characters.", "VALIDATION_ERROR");
  }
  const { data: recentPending, error: pendingError } = await userClient
    .from("user_safety_appeals")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingError) throw new ApiError(400, pendingError.message, "APPEAL_PENDING_CHECK_FAILED");
  if (recentPending) {
    throw new ApiError(409, "You already have a pending review request.", "APPEAL_ALREADY_PENDING");
  }

  const { data, error } = await userClient
    .from("user_safety_appeals")
    .insert({
      user_id: userId,
      message: trimmed.slice(0, 2000),
      status: "pending",
    })
    .select("id, user_id, message, status, created_at, reviewed_at, reviewed_by")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not submit appeal.", "APPEAL_SUBMIT_FAILED");
  return data;
}

export async function listOwnSafetyAppeals(args: {
  userClient: SupabaseClientLike;
  userId: string;
}) {
  const { userClient, userId } = args;
  const { data, error } = await userClient
    .from("user_safety_appeals")
    .select("id, message, status, moderator_note, created_at, reviewed_at, reviewed_by")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(400, error.message, "APPEALS_FETCH_FAILED");
  return data ?? [];
}

export async function listSafetyAppealsForModeration(limit = 100) {
  const admin = createAdminClient();
  const capped = Math.max(1, Math.min(200, limit));
  const { data, error } = await admin
    .from("user_safety_appeals")
    .select("id, user_id, message, status, moderator_note, created_at, reviewed_at, reviewed_by")
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new ApiError(400, error.message, "APPEALS_MODERATION_FETCH_FAILED");
  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((row: any) => row.user_id)));
  const { data: profiles, error: profilesError } = userIds.length
    ? await admin.from("profiles").select("id, username, display_name").in("id", userIds)
    : { data: [], error: null as any };
  if (profilesError) throw new ApiError(400, profilesError.message, "APPEALS_PROFILES_FETCH_FAILED");
  const map = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    message: row.message,
    status: row.status,
    moderatorNote: row.moderator_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    user: map.get(row.user_id)
      ? {
          id: map.get(row.user_id).id,
          username: map.get(row.user_id).username,
          displayName: map.get(row.user_id).display_name,
        }
      : null,
  }));
}

export async function reviewSafetyAppeal(args: {
  appealId: string;
  status: "approved" | "denied" | "reviewed";
  moderatorNote?: string;
  reviewerUserId?: string;
  reviewerEmail?: string;
}) {
  const admin = createAdminClient();
  const { appealId, status, moderatorNote, reviewerUserId, reviewerEmail } = args;
  const { data: appeal, error: appealError } = await admin
    .from("user_safety_appeals")
    .select("id, user_id, status")
    .eq("id", appealId)
    .single();
  if (appealError || !appeal) {
    throw new ApiError(404, "Appeal not found.", "APPEAL_NOT_FOUND");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("user_safety_appeals")
    .update({
      status,
      moderator_note: moderatorNote?.trim() ? moderatorNote.trim().slice(0, 1000) : null,
      reviewed_at: nowIso,
      reviewed_by: reviewerUserId ?? null,
    })
    .eq("id", appealId)
    .select("id, user_id, status, reviewed_at, reviewed_by")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not review appeal.", "APPEAL_REVIEW_FAILED");
  }

  if (status === "approved") {
    await setAccountSafetyStatus({
      userId: data.user_id,
      status: "active",
      reason: "Appeal approved",
      suspendedUntil: null,
      updatedBy: reviewerUserId ?? null,
      adminEmail: reviewerEmail ?? null,
    });
  }

  await logAdminAuditAction({
    actionType: status === "approved" ? "appeal_approved" : status === "denied" ? "appeal_denied" : "appeal_reviewed",
    targetUserId: data.user_id,
    adminUserId: reviewerUserId ?? null,
    adminEmail: reviewerEmail ?? null,
    reason: moderatorNote ?? null,
    metadata: {
      appealId: data.id,
      status,
    },
  });

  return data;
}
