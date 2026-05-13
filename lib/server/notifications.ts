import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type CampusNotificationType =
  | "direct_message"
  | "connection_accepted"
  | "event_rsvp_reminder"
  | "organization_event_announcement"
  | "moderation_safety_update"
  | "organization_request_submitted"
  | "organization_request_approved"
  | "organization_request_denied";

export async function createNotification(args: {
  userId: string;
  type: CampusNotificationType;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}) {
  const admin = createAdminClient();
  const { userId, type, title, body, relatedEntityType, relatedEntityId } = args;
  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: userId,
      type,
      title: title.trim().slice(0, 180),
      body: body.trim().slice(0, 1000),
      related_entity_type: relatedEntityType ?? null,
      related_entity_id: relatedEntityId ?? null,
    })
    .select("id, user_id, type, title, body, related_entity_type, related_entity_id, read_at, created_at")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not create notification.", "NOTIFICATION_CREATE_FAILED");
  }
  return data;
}

export async function createNotificationsBulk(args: {
  userIds: string[];
  type: CampusNotificationType;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}) {
  const admin = createAdminClient();
  const ids = Array.from(new Set(args.userIds.filter(Boolean)));
  if (ids.length === 0) return { created: 0 };
  const rows = ids.map((userId) => ({
    user_id: userId,
    type: args.type,
    title: args.title.trim().slice(0, 180),
    body: args.body.trim().slice(0, 1000),
    related_entity_type: args.relatedEntityType ?? null,
    related_entity_id: args.relatedEntityId ?? null,
  }));
  const { error } = await admin.from("notifications").insert(rows);
  if (error) throw new ApiError(400, error.message, "NOTIFICATION_BULK_CREATE_FAILED");
  return { created: rows.length };
}

export async function listMyNotifications(args: {
  userClient: SupabaseClientLike;
  userId: string;
  limit?: number;
  offset?: number;
}) {
  const { userClient, userId, limit = 50, offset = 0 } = args;
  const safeLimit = Math.max(1, Math.min(100, limit));
  const safeOffset = Math.max(0, offset);
  const { data, error } = await userClient
    .from("notifications")
    .select(
      "id, type, title, body, related_entity_type, related_entity_id, read_at, created_at, is_favorited, favorited_at",
    )
    .eq("user_id", userId)
    .order("is_favorited", { ascending: false })
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (error) throw new ApiError(400, error.message, "NOTIFICATIONS_FETCH_FAILED");

  const { count, error: countError } = await userClient
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (countError) throw new ApiError(400, countError.message, "NOTIFICATIONS_COUNT_FAILED");

  return {
    notifications: (data ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      relatedEntityType: row.related_entity_type,
      relatedEntityId: row.related_entity_id,
      readAt: row.read_at,
      createdAt: row.created_at,
      isFavorited: Boolean(row.is_favorited),
      favoritedAt: row.favorited_at ?? null,
    })),
    unreadCount: count ?? 0,
  };
}

export async function markNotificationRead(args: {
  userClient: SupabaseClientLike;
  userId: string;
  notificationId: string;
}) {
  const { userClient, userId, notificationId } = args;
  const nowIso = new Date().toISOString();
  const { data, error } = await userClient
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select("id, read_at")
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "NOTIFICATION_READ_FAILED");
  if (!data) throw new ApiError(404, "Notification not found.", "NOTIFICATION_NOT_FOUND");
  return { id: data.id, readAt: data.read_at };
}

export async function setNotificationFavorite(args: {
  userClient: SupabaseClientLike;
  userId: string;
  notificationId: string;
  favorited: boolean;
}) {
  const { userClient, userId, notificationId, favorited } = args;
  const nowIso = new Date().toISOString();
  const patch = favorited
    ? ({ is_favorited: true, favorited_at: nowIso } as const)
    : ({ is_favorited: false, favorited_at: null } as const);

  const { data, error } = await userClient
    .from("notifications")
    .update(patch)
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select(
      "id, type, title, body, related_entity_type, related_entity_id, read_at, created_at, is_favorited, favorited_at",
    )
    .maybeSingle();

  if (error) throw new ApiError(400, error.message, "NOTIFICATION_FAVORITE_FAILED");
  if (!data) throw new ApiError(404, "Notification not found.", "NOTIFICATION_NOT_FOUND");

  return {
    id: data.id,
    type: data.type,
    title: data.title,
    body: data.body,
    relatedEntityType: data.related_entity_type,
    relatedEntityId: data.related_entity_id,
    readAt: data.read_at,
    createdAt: data.created_at,
    isFavorited: Boolean(data.is_favorited),
    favoritedAt: data.favorited_at ?? null,
  };
}

export async function markAllNotificationsRead(args: {
  userClient: SupabaseClientLike;
  userId: string;
}) {
  const { userClient, userId } = args;
  const nowIso = new Date().toISOString();
  const { error } = await userClient
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw new ApiError(400, error.message, "NOTIFICATIONS_READ_ALL_FAILED");
  return { readAt: nowIso };
}
