import { ApiError } from "@/lib/server/http";
import { logNotificationError, logNotificationInfo } from "@/lib/server/notificationDebug";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  actor_id?: string | null;
  friend_request_id?: string | null;
  read_at: string | null;
  created_at: string;
  is_favorited?: boolean | null;
  favorited_at?: string | null;
};

export type CampusNotificationType =
  | "direct_message"
  | "connection_accepted"
  | "friend_request"
  | "quad_post_like"
  | "quad_post_comment"
  | "quad_post_tag"
  | "quad_post_mention"
  | "quad_post_tag_approval"
  | "event_rsvp_reminder"
  | "organization_event_announcement"
  | "moderation_safety_update"
  | "organization_request_submitted"
  | "organization_request_approved"
  | "organization_request_denied";

const NOTIFICATION_INSERT_SELECT = "id, user_id, type, title, body, created_at";

function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  column: string,
) {
  const message = error?.message ?? "";
  return (
    (error?.code === "42703" || error?.code === "PGRST204") &&
    message.includes(column)
  );
}

function isNotificationTypeConstraintError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "23514" && (message.includes("notifications_type_check") || message.includes("type"));
}

function isRetryableNotificationInsertError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (isNotificationTypeConstraintError(error)) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  if (error.code === "23514") return false;
  return false;
}

function buildNotificationInsertAttempts(args: {
  userId: string;
  type: CampusNotificationType;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  actorId?: string | null;
  friendRequestId?: string | null;
}) {
  const {
    userId,
    type,
    title,
    body,
    relatedEntityType,
    relatedEntityId,
    actorId,
    friendRequestId,
  } = args;
  const core = {
    user_id: userId,
    type,
    title: title.trim().slice(0, 180),
    body: body.trim().slice(0, 1000),
  };
  const withRelated = {
    ...core,
    related_entity_type: relatedEntityType ?? null,
    related_entity_id: relatedEntityId ?? null,
  };
  const withActor = {
    ...withRelated,
    actor_id: actorId ?? null,
  };
  const withFriendRequest = {
    ...withActor,
    friend_request_id: friendRequestId ?? null,
  };

  const attempts: Record<string, unknown>[] = [
    { ...withFriendRequest, read: false },
    withFriendRequest,
    withActor,
    withRelated,
    { ...core, is_read: false },
    core,
  ];

  const seen = new Set<string>();
  return attempts.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapNotificationRow(
  row: NotificationRow,
  actorMap: Map<
    string,
    { username: string; displayName: string; avatarUrl: string | null; avatarCustomJson: string | null }
  >,
) {
  const actor = row.actor_id ? actorMap.get(row.actor_id) : undefined;
  const friendRequestId = row.friend_request_id ?? row.related_entity_id;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    friendRequestId,
    actorId: row.actor_id ?? null,
    actorUsername: actor?.username ?? null,
    actorDisplayName: actor?.displayName ?? null,
    actorAvatarUrl: actor?.avatarUrl ?? null,
    actorAvatarCustomJson: actor?.avatarCustomJson ?? null,
    readAt: row.read_at,
    createdAt: row.created_at,
    isFavorited: Boolean(row.is_favorited),
    favoritedAt: row.favorited_at ?? null,
  };
}

async function fetchActorProfiles(
  userClient: SupabaseClientLike,
  actorIds: string[],
) {
  const actorMap = new Map<
    string,
    { username: string; displayName: string; avatarUrl: string | null; avatarCustomJson: string | null }
  >();
  if (actorIds.length === 0) return actorMap;

  const { data: actors, error: actorsError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .in("id", actorIds);
  if (actorsError) throw new ApiError(400, actorsError.message, "NOTIFICATION_ACTORS_FETCH_FAILED");
  for (const actor of actors ?? []) {
    actorMap.set(actor.id, {
      username: actor.username,
      displayName: actor.display_name,
      avatarUrl: actor.avatar_url,
      avatarCustomJson: actor.avatar_custom_json,
    });
  }
  return actorMap;
}

/** Friend-request inbox row — always delivered to the recipient (addressee), never the sender. */
export async function createFriendRequestNotification(args: {
  recipientUserId: string;
  senderUserId: string;
  senderUsername: string;
  friendRequestId: string;
}) {
  const { recipientUserId, senderUserId, senderUsername, friendRequestId } = args;
  if (recipientUserId === senderUserId) {
    throw new ApiError(400, "Friend request notification recipient cannot be the sender.", "VALIDATION_ERROR");
  }

  logNotificationInfo("friend-request:notify-start", {
    senderUserId,
    recipientUserId,
    friendRequestId,
  });

  const notification = await createNotification({
    userId: recipientUserId,
    type: "friend_request",
    title: "New follow request",
    body: `${senderUsername} sent you a follow request`,
    relatedEntityType: "connection_request",
    relatedEntityId: friendRequestId,
    actorId: senderUserId,
    friendRequestId,
  });

  logNotificationInfo("friend-request:notify-created", {
    senderUserId,
    recipientUserId,
    friendRequestId,
    notificationId: notification.id,
    notificationUserId: recipientUserId,
  });

  return notification;
}

export async function createNotification(args: {
  userId: string;
  type: CampusNotificationType;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  actorId?: string | null;
  friendRequestId?: string | null;
}) {
  const admin = createAdminClient();
  const resolvedFriendRequestId =
    args.friendRequestId ??
    (args.type === "friend_request" ? args.relatedEntityId ?? null : null);
  const attempts = buildNotificationInsertAttempts({
    ...args,
    friendRequestId: resolvedFriendRequestId,
  });

  let lastError: { code?: string; message?: string } | null = null;

  for (const row of attempts) {
    const { data, error } = await admin
      .from("notifications")
      .insert(row)
      .select(NOTIFICATION_INSERT_SELECT)
      .single();

    if (!error && data) {
      logNotificationInfo("create", {
        notificationId: data.id,
        userId: args.userId,
        type: args.type,
        attemptColumns: Object.keys(row),
      });
      return data;
    }

    lastError = error;
    if (!isRetryableNotificationInsertError(error)) break;
  }

  if (isNotificationTypeConstraintError(lastError)) {
    logNotificationError("create:type-constraint", {
      userId: args.userId,
      type: args.type,
      message: lastError?.message,
      hint: "Run supabase migrations so notifications_type_check includes friend_request.",
    });
    throw new ApiError(
      500,
      `Notification type "${args.type}" is not allowed by the database schema. Apply pending Supabase migrations.`,
      "NOTIFICATION_TYPE_NOT_ALLOWED",
    );
  }

  logNotificationError("create", {
    userId: args.userId,
    type: args.type,
    message: lastError?.message,
    code: lastError?.code,
  });
  throw new ApiError(400, lastError?.message ?? "Could not create notification.", "NOTIFICATION_CREATE_FAILED");
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
    actor_id: null,
  }));
  const { error } = await admin.from("notifications").insert(rows);
  if (error) throw new ApiError(400, error.message, "NOTIFICATION_BULK_CREATE_FAILED");
  return { created: rows.length };
}

async function fetchNotificationsForUser(args: {
  userClient: SupabaseClientLike;
  userId: string;
  safeLimit: number;
  safeOffset: number;
}) {
  const { userClient, userId, safeLimit, safeOffset } = args;
  const extendedSelect =
    "id, type, title, body, related_entity_type, related_entity_id, actor_id, friend_request_id, read_at, created_at, is_favorited, favorited_at";
  const withoutActorSelect =
    "id, type, title, body, related_entity_type, related_entity_id, read_at, created_at, is_favorited, favorited_at";
  const legacySelect =
    "id, type, title, body, related_entity_type, related_entity_id, read_at, created_at";

  const runQuery = (select: string, orderFavorites: boolean) => {
    let query = userClient
      .from("notifications")
      .select(select)
      .eq("user_id", userId);
    if (orderFavorites) {
      query = query.order("is_favorited", { ascending: false });
    }
    return query.order("created_at", { ascending: false }).range(safeOffset, safeOffset + safeLimit - 1);
  };

  let { data, error } = await runQuery(extendedSelect, true);

  if (isMissingColumnError(error, "actor_id") || isMissingColumnError(error, "friend_request_id")) {
    ({ data, error } = await runQuery(withoutActorSelect, true));
  }

  if (isMissingColumnError(error, "is_favorited") || isMissingColumnError(error, "favorited_at")) {
    ({ data, error } = await runQuery(withoutActorSelect.replace(", is_favorited, favorited_at", ""), false));
  }

  if (error) {
    logNotificationError("list", { userId, message: error.message, code: error.code });
    throw new ApiError(400, error.message, "NOTIFICATIONS_FETCH_FAILED");
  }

  logNotificationInfo("list", { userId, count: data?.length ?? 0 });
  return (data ?? []) as unknown as NotificationRow[];
}

async function countUnreadNotifications(userClient: SupabaseClientLike, userId: string) {
  let { count, error } = await userClient
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (isMissingColumnError(error, "read_at")) {
    ({ count, error } = await userClient
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false));
  }

  if (error) throw new ApiError(400, error.message, "NOTIFICATIONS_COUNT_FAILED");
  return count ?? 0;
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

  const rows = await fetchNotificationsForUser({ userClient, userId, safeLimit, safeOffset });
  const unreadCount = await countUnreadNotifications(userClient, userId);

  const actorIds = Array.from(
    new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id))),
  );
  const actorMap = await fetchActorProfiles(userClient, actorIds);

  return {
    notifications: rows.map((row) => mapNotificationRow(row, actorMap)),
    unreadCount,
  };
}

export async function removeFriendRequestNotifications(args: {
  friendRequestId: string;
  receiverUserId?: string;
}) {
  const admin = createAdminClient();
  const filterByReceiver = (query: ReturnType<typeof admin.from>) => {
    let next = query
      .delete()
      .eq("type", "friend_request")
      .or(`friend_request_id.eq.${args.friendRequestId},related_entity_id.eq.${args.friendRequestId}`);
    if (args.receiverUserId) {
      next = next.eq("user_id", args.receiverUserId);
    }
    return next;
  };

  let { error } = await filterByReceiver(admin.from("notifications"));
  if (isMissingColumnError(error, "friend_request_id")) {
    let fallback = admin
      .from("notifications")
      .delete()
      .eq("type", "friend_request")
      .eq("related_entity_id", args.friendRequestId);
    if (args.receiverUserId) {
      fallback = fallback.eq("user_id", args.receiverUserId);
    }
    ({ error } = await fallback);
  }

  if (error) {
    logNotificationError("remove-friend-request", {
      friendRequestId: args.friendRequestId,
      receiverUserId: args.receiverUserId,
      message: error.message,
      code: error.code,
    });
    throw new ApiError(400, error.message, "FRIEND_REQUEST_NOTIFICATION_REMOVE_FAILED");
  }
  return { removed: true };
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

/** Mark unread direct-message notifications tied to a conversation (inbox badge source). */
export async function markConversationNotificationsRead(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  readAt?: string;
}): Promise<{ markedCount: number }> {
  const { userClient, userId, conversationId } = args;
  const nowIso = args.readAt ?? new Date().toISOString();

  let countQuery = userClient
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "direct_message")
    .eq("related_entity_id", conversationId)
    .is("read_at", null);

  let { count, error: countError } = await countQuery;
  if (isMissingColumnError(countError, "read_at")) {
    ({ count, error: countError } = await userClient
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "direct_message")
      .eq("related_entity_id", conversationId)
      .eq("is_read", false));
  }
  if (countError) throw new ApiError(400, countError.message, "NOTIFICATIONS_COUNT_FAILED");

  const markedCount = count ?? 0;
  if (markedCount === 0) return { markedCount: 0 };

  let updateQuery = userClient
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("user_id", userId)
    .eq("type", "direct_message")
    .eq("related_entity_id", conversationId)
    .is("read_at", null);

  let { error: updateError } = await updateQuery;
  if (isMissingColumnError(updateError, "read_at")) {
    ({ error: updateError } = await userClient
      .from("notifications")
      .update({ is_read: true, read_at: nowIso })
      .eq("user_id", userId)
      .eq("type", "direct_message")
      .eq("related_entity_id", conversationId)
      .eq("is_read", false));
  }
  if (updateError) throw new ApiError(400, updateError.message, "NOTIFICATIONS_READ_FAILED");

  return { markedCount };
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
    .is("read_at", null)
    .neq("type", "friend_request");
  if (error) throw new ApiError(400, error.message, "NOTIFICATIONS_READ_ALL_FAILED");
  return { readAt: nowIso };
}
