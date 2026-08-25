import { resolveProfileAvatar } from "@/lib/avatarSource";
import { ApiError } from "@/lib/server/http";
import {
  buildSharedPostPreview,
  mapDirectMessageRow,
  MESSAGE_SELECT,
  type DirectMessageType,
  type SharedPostType,
} from "@/lib/server/dmRichMessages";
import { mapPlayerPublicStats } from "@/lib/server/playerPublicStats";
import { logNotificationError, logNotificationInfo } from "@/lib/server/notificationDebug";
import {
  createFriendRequestNotification,
  createNotification,
  markConversationNotificationsRead,
  removeFriendRequestNotifications,
} from "@/lib/server/notifications";
import { assertAccountCanSocialize, setAccountSafetyStatus } from "@/lib/server/accountSafety";
import { logAdminAuditAction } from "@/lib/server/audit";
import { requireMatchingVerifiedSchool } from "@/lib/server/schoolVerification";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type ReportReason = "harassment" | "threat" | "scam" | "impersonation" | "discrimination" | "unsafe" | "other";

function directKeyFor(userA: string, userB: string) {
  return [userA, userB].sort().join("|");
}

export type ConversationType = "direct" | "group";

export type GroupMemberSummary = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "owner" | "member";
};

export { buildGroupDisplayName } from "@/lib/groupDisplayName";
import { buildGroupDisplayName } from "@/lib/groupDisplayName";

async function getConversationType(
  admin: SupabaseClientLike,
  conversationId: string,
): Promise<ConversationType> {
  const { data, error } = await admin
    .from("direct_conversations")
    .select("type")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "CONVERSATION_LOOKUP_FAILED");
  if (!data) throw new ApiError(404, "Conversation not found.", "CONVERSATION_NOT_FOUND");
  return (data.type ?? "direct") as ConversationType;
}

const ABUSE_RATE_LIMIT_MESSAGE = "You're doing that too often. Please try again later.";

async function getConnectionBetween(userClient: SupabaseClientLike, userId: string, otherUserId: string) {
  const [forward, reverse] = await Promise.all([
    userClient
      .from("student_connections")
      .select("*")
      .eq("requester_id", userId)
      .eq("addressee_id", otherUserId)
      .maybeSingle(),
    userClient
      .from("student_connections")
      .select("*")
      .eq("requester_id", otherUserId)
      .eq("addressee_id", userId)
      .maybeSingle(),
  ]);

  if (forward.error) throw new ApiError(400, forward.error.message, "CONNECTION_FETCH_FAILED");
  if (reverse.error) throw new ApiError(400, reverse.error.message, "CONNECTION_FETCH_FAILED");
  return (forward.data ?? reverse.data) as
    | {
        id: string;
        requester_id: string;
        addressee_id: string;
        status: "pending" | "accepted" | "declined" | "cancelled";
        created_at: string;
        updated_at: string;
      }
    | undefined;
}

async function assertNotBlocked(userClient: SupabaseClientLike, userId: string, otherUserId: string) {
  const [byMe, byThem] = await Promise.all([
    userClient
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", userId)
      .eq("blocked_id", otherUserId)
      .maybeSingle(),
    userClient
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", otherUserId)
      .eq("blocked_id", userId)
      .maybeSingle(),
  ]);
  if (byMe.error || byThem.error) {
    throw new ApiError(400, byMe.error?.message ?? byThem.error?.message ?? "Block check failed.", "BLOCK_CHECK_FAILED");
  }
  if (byMe.data) {
    throw new ApiError(409, "You have blocked this user.", "USER_BLOCKED");
  }
  if (byThem.data) {
    throw new ApiError(403, "You cannot message this user.", "BLOCKED_BY_USER");
  }
}

/** Accepted friend user ids from `student_connections` (excludes the viewer). */
export async function listAcceptedFriendUserIds(args: {
  userClient: SupabaseClientLike;
  userId: string;
}): Promise<string[]> {
  const { userClient, userId } = args;
  const { data, error } = await userClient
    .from("student_connections")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) throw new ApiError(400, error.message, "CONNECTIONS_FETCH_FAILED");

  return Array.from(
    new Set(
      (data ?? []).map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id)),
    ),
  ).filter(Boolean);
}

export async function listConnections(args: { userClient: SupabaseClientLike; userId: string }) {
  const { userClient, userId } = args;
  const { data, error } = await userClient
    .from("student_connections")
    .select("id, requester_id, addressee_id, status, updated_at")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  if (error) throw new ApiError(400, error.message, "CONNECTIONS_FETCH_FAILED");

  const rows = data ?? [];
  const otherUserIds = rows.map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id));
  if (otherUserIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await userClient
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, avatar_custom_json, character_class_id, scholar_guild_id, streak_days, game_state_json, user_stats(level, total_xp, strength, stamina, knowledge, social, focus)",
    )
    .in("id", otherUserIds);
  if (profilesError) throw new ApiError(400, profilesError.message, "CONNECTION_PROFILES_FETCH_FAILED");

  const map = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return rows
    .map((row) => {
      const otherUserId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      const profile = map.get(otherUserId);
      if (!profile) return null;
      const player = mapPlayerPublicStats(profile);
      return {
        connectionId: row.id,
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        avatarCustomJson: profile.avatar_custom_json,
        relationshipStatus: "connected" as const,
        level: player.level,
        xp: player.xp,
        streakDays: player.streakDays,
        title: player.title,
        guild: player.guild,
        stats: player.stats,
        statsAvailable: player.statsAvailable,
      };
    })
    .filter(Boolean);
}

async function countMutualFriends(
  userClient: SupabaseClientLike,
  userId: string,
  otherUserId: string,
): Promise<number> {
  const [myRows, theirRows] = await Promise.all([
    userClient
      .from("student_connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    userClient
      .from("student_connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${otherUserId},addressee_id.eq.${otherUserId}`),
  ]);
  if (myRows.error) throw new ApiError(400, myRows.error.message, "MUTUAL_FRIENDS_FETCH_FAILED");
  if (theirRows.error) throw new ApiError(400, theirRows.error.message, "MUTUAL_FRIENDS_FETCH_FAILED");

  const myFriends = new Set(
    (myRows.data ?? []).map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id)),
  );
  let count = 0;
  for (const row of theirRows.data ?? []) {
    const friendId = row.requester_id === otherUserId ? row.addressee_id : row.requester_id;
    if (friendId !== userId && friendId !== otherUserId && myFriends.has(friendId)) count += 1;
  }
  return count;
}

async function assertConnectionRequestNotSpam(userClient: SupabaseClientLike, userId: string, targetUserId: string) {
  const sinceIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await userClient
    .from("student_connections")
    .select("*", { count: "exact", head: true })
    .eq("requester_id", userId)
    .eq("addressee_id", targetUserId)
    .gte("created_at", sinceIso);
  if (error) throw new ApiError(400, error.message, "CONNECTION_SPAM_CHECK_FAILED");
  if ((count ?? 0) >= 3) {
    throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
  }
}

export async function sendConnectionRequest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  targetUsername: string;
}) {
  const { userClient, userId, targetUsername } = args;
  await assertAccountCanSocialize(userClient, userId);
  const normalized = targetUsername.trim().toLowerCase();
  if (!normalized) throw new ApiError(400, "Username is required.", "VALIDATION_ERROR");

  const { data: target, error: targetError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", normalized)
    .maybeSingle();
  if (targetError) throw new ApiError(400, targetError.message, "CONNECTION_TARGET_LOOKUP_FAILED");
  if (!target) throw new ApiError(404, "User not found.", "USER_NOT_FOUND");
  if (target.id === userId) throw new ApiError(400, "You cannot connect with yourself.", "SELF_CONNECTION_FORBIDDEN");
  await requireMatchingVerifiedSchool({ userClient, userId, otherUserId: target.id });

  await assertNotBlocked(userClient, userId, target.id);
  await assertConnectionRequestNotSpam(userClient, userId, target.id);
  const existing = await getConnectionBetween(userClient, userId, target.id);

  if (existing?.status === "accepted") {
    return {
      id: existing.id,
      requester_id: existing.requester_id,
      addressee_id: existing.addressee_id,
      status: existing.status,
      created_at: existing.created_at,
      notificationId: null,
      outcome: "already_connected" as const,
      message: "You are already connected.",
    };
  }
  if (existing?.status === "pending") {
    if (existing.requester_id === userId) {
      return {
        id: existing.id,
        requester_id: existing.requester_id,
        addressee_id: existing.addressee_id,
        status: existing.status,
        created_at: existing.created_at,
        notificationId: null,
        outcome: "already_sent" as const,
        message: "Connection request already sent.",
      };
    }
    return {
      id: existing.id,
      requester_id: existing.requester_id,
      addressee_id: existing.addressee_id,
      status: existing.status,
      created_at: existing.created_at,
      notificationId: null,
      outcome: "already_received" as const,
      message: "This user already sent you a request.",
    };
  }

  const { data: requesterProfile, error: requesterProfileError } = await userClient
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();
  if (requesterProfileError || !requesterProfile) {
    throw new ApiError(400, requesterProfileError?.message ?? "Could not load your profile.", "REQUESTER_PROFILE_FAILED");
  }

  const senderUserId = userId;
  const recipientUserId = target.id;
  logNotificationInfo("friend-request:send-start", {
    senderUserId,
    recipientUserId,
    recipientUsername: target.username,
  });

  const admin = createAdminClient();
  let requestRow:
    | {
        id: string;
        requester_id: string;
        addressee_id: string;
        status: string;
        created_at: string;
      }
    | undefined;

  if (existing) {
    const { data, error } = await admin
      .from("student_connections")
      .update({
        requester_id: senderUserId,
        addressee_id: recipientUserId,
        status: "pending",
        responded_at: null,
      })
      .eq("id", existing.id)
      .select("id, requester_id, addressee_id, status, created_at")
      .single();
    if (error || !data) throw new ApiError(400, error?.message ?? "Could not update request.", "CONNECTION_REQUEST_FAILED");
    requestRow = data;
  } else {
    const { data: created, error: createdError } = await admin
      .from("student_connections")
      .insert({
        requester_id: senderUserId,
        addressee_id: recipientUserId,
        status: "pending",
      })
      .select("id, requester_id, addressee_id, status, created_at")
      .single();
    if (createdError || !created) {
      throw new ApiError(400, createdError?.message ?? "Could not create request.", "CONNECTION_REQUEST_FAILED");
    }
    requestRow = created;
  }

  if (requestRow.requester_id !== senderUserId || requestRow.addressee_id !== recipientUserId) {
    throw new ApiError(500, "Friend request was saved with unexpected participants.", "CONNECTION_REQUEST_PARTICIPANT_MISMATCH");
  }

  logNotificationInfo("friend-request:connection-saved", {
    senderUserId,
    recipientUserId,
    friendRequestId: requestRow.id,
  });

  try {
    await removeFriendRequestNotifications({
      friendRequestId: requestRow.id,
      receiverUserId: recipientUserId,
    });
  } catch (removeError) {
    logNotificationError("friend-request:remove-stale", {
      friendRequestId: requestRow.id,
      receiverUserId: recipientUserId,
      message: removeError instanceof Error ? removeError.message : String(removeError),
    });
  }

  const notification = await createFriendRequestNotification({
    recipientUserId,
    senderUserId,
    senderUsername: requesterProfile.username,
    friendRequestId: requestRow.id,
  });

  logNotificationInfo("friend-request:complete", {
    senderUserId,
    recipientUserId,
    friendRequestId: requestRow.id,
    notificationId: notification.id,
    notificationUserId: recipientUserId,
  });

  return {
    ...requestRow,
    notificationId: notification.id,
    outcome: "created" as const,
    message: "Connection request sent.",
  };
}

export async function listConnectionRequests(args: {
  userClient: SupabaseClientLike;
  userId: string;
  direction: "incoming" | "outgoing";
}) {
  const { userClient, userId, direction } = args;
  const query = userClient
    .from("student_connections")
    .select("id, requester_id, addressee_id, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (direction === "incoming") query.eq("addressee_id", userId);
  else query.eq("requester_id", userId);

  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message, "CONNECTION_REQUESTS_FETCH_FAILED");

  const rows = data ?? [];
  const ids = rows.map((row) => (direction === "incoming" ? row.requester_id : row.addressee_id));
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .in("id", ids);
  if (profilesError) throw new ApiError(400, profilesError.message, "CONNECTION_REQUEST_PROFILES_FAILED");

  const map = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const mapped = await Promise.all(
    rows.map(async (row) => {
      const personId = direction === "incoming" ? row.requester_id : row.addressee_id;
      const profile = map.get(personId);
      if (!profile) return null;
      const mutualFriendsCount =
        direction === "incoming" ? await countMutualFriends(userClient, userId, profile.id) : null;
      return {
        requestId: row.id,
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        avatarCustomJson: profile.avatar_custom_json,
        createdAt: row.created_at,
        mutualFriendsCount,
      };
    }),
  );
  return mapped.filter(Boolean);
}

export async function respondConnectionRequest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  requestId: string;
  action: "accept" | "decline";
}) {
  const { userClient, userId, requestId, action } = args;
  await assertAccountCanSocialize(userClient, userId);
  const { data: request, error: requestError } = await userClient
    .from("student_connections")
    .select("id, requester_id, addressee_id, status")
    .eq("id", requestId)
    .eq("addressee_id", userId)
    .single();
  if (requestError || !request) throw new ApiError(404, "Connection request not found.", "CONNECTION_REQUEST_NOT_FOUND");
  if (request.status !== "pending") throw new ApiError(409, "Request already resolved.", "CONNECTION_REQUEST_RESOLVED");

  const nextStatus = action === "accept" ? "accepted" : "declined";
  const { data, error } = await userClient
    .from("student_connections")
    .update({ status: nextStatus, responded_at: new Date().toISOString() })
    .eq("id", request.id)
    .select("id, status, requester_id, addressee_id, responded_at")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Request response failed.", "CONNECTION_RESPONSE_FAILED");

  try {
    await removeFriendRequestNotifications({
      friendRequestId: request.id,
      receiverUserId: userId,
    });
  } catch {}

  if (nextStatus === "accepted") {
    try {
      const { data: accepterProfile } = await userClient
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      await createNotification({
        userId: request.requester_id,
        type: "connection_accepted",
        title: "Follow request accepted",
        body: accepterProfile?.username
          ? `${accepterProfile.username} accepted your follow request`
          : "A student accepted your follow request",
        relatedEntityType: "connection_request",
        relatedEntityId: request.id,
        actorId: userId,
      });
    } catch {}
  }
  return data;
}

export async function cancelConnectionRequest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  requestId: string;
}) {
  const { userClient, userId, requestId } = args;
  await assertAccountCanSocialize(userClient, userId);
  const { data: request, error: requestError } = await userClient
    .from("student_connections")
    .select("id, requester_id, addressee_id, status")
    .eq("id", requestId)
    .eq("requester_id", userId)
    .single();
  if (requestError || !request) throw new ApiError(404, "Connection request not found.", "CONNECTION_REQUEST_NOT_FOUND");
  if (request.status !== "pending") throw new ApiError(409, "Request already resolved.", "CONNECTION_REQUEST_RESOLVED");

  // Hard-delete the pending row so the pair can immediately send a fresh
  // request. Status guards in the delete protect against a concurrent accept.
  const { data: deleted, error } = await userClient
    .from("student_connections")
    .delete()
    .eq("id", request.id)
    .eq("requester_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "CONNECTION_CANCEL_FAILED");
  if (!deleted) throw new ApiError(409, "Request already resolved.", "CONNECTION_REQUEST_RESOLVED");

  try {
    await removeFriendRequestNotifications({
      friendRequestId: request.id,
      receiverUserId: request.addressee_id,
    });
  } catch {}

  return {
    id: request.id,
    status: "cancelled" as const,
    requester_id: request.requester_id,
    addressee_id: request.addressee_id,
    responded_at: new Date().toISOString(),
  };
}

export async function removeConnection(args: {
  userClient: SupabaseClientLike;
  userId: string;
  connectionId: string;
}) {
  const { userClient, userId, connectionId } = args;
  await assertAccountCanSocialize(userClient, userId);

  const { data: row, error: rowError } = await userClient
    .from("student_connections")
    .select("id, requester_id, addressee_id, status")
    .eq("id", connectionId)
    .maybeSingle();
  if (rowError) throw new ApiError(400, rowError.message, "CONNECTION_LOOKUP_FAILED");
  if (!row) throw new ApiError(404, "Connection not found.", "CONNECTION_NOT_FOUND");
  if (row.status !== "accepted") {
    throw new ApiError(409, "Connection is not active.", "CONNECTION_NOT_ACTIVE");
  }
  if (row.requester_id !== userId && row.addressee_id !== userId) {
    throw new ApiError(403, "Not allowed to remove this connection.", "FORBIDDEN");
  }

  const { error: deleteError } = await userClient.from("student_connections").delete().eq("id", connectionId);
  if (deleteError) throw new ApiError(400, deleteError.message, "CONNECTION_REMOVE_FAILED");

  return { removed: true, connectionId };
}

export async function getRelationshipStatus(args: {
  userClient: SupabaseClientLike;
  userId: string;
  otherUserId: string;
}) {
  const { userClient, userId, otherUserId } = args;
  if (userId === otherUserId) throw new ApiError(400, "Cannot open relationship with self.", "VALIDATION_ERROR");
  const [connection, blockedByMe, blockedByOther] = await Promise.all([
    getConnectionBetween(userClient, userId, otherUserId),
    userClient.from("blocked_users").select("id").eq("blocker_id", userId).eq("blocked_id", otherUserId).maybeSingle(),
    userClient.from("blocked_users").select("id").eq("blocker_id", otherUserId).eq("blocked_id", userId).maybeSingle(),
  ]);
  if (blockedByMe.error || blockedByOther.error) {
    throw new ApiError(400, blockedByMe.error?.message ?? blockedByOther.error?.message ?? "Could not fetch relationship.", "RELATIONSHIP_FETCH_FAILED");
  }

  const connectionStatus = connection?.status ?? "none";
  const incomingPending = connectionStatus === "pending" && connection?.addressee_id === userId;
  const outgoingPending = connectionStatus === "pending" && connection?.requester_id === userId;
  const isFollowing = connectionStatus === "accepted";
  const isFollowedBy = connectionStatus === "accepted";
  const canMessage = connectionStatus === "accepted" && !blockedByMe.data && !blockedByOther.data;
  return {
    canMessage,
    connectionStatus,
    incomingPending,
    outgoingPending,
    isFollowing,
    isFollowedBy,
    followBackAvailable: incomingPending,
    blockedByMe: Boolean(blockedByMe.data),
    blockedByOther: Boolean(blockedByOther.data),
    requestId: connection?.id ?? null,
  };
}

export async function getOrCreateDirectConversation(args: {
  userClient: SupabaseClientLike;
  userId: string;
  otherUserId: string;
}) {
  const { userClient, userId, otherUserId } = args;
  const admin = createAdminClient();
  await assertAccountCanSocialize(userClient, userId);
  await assertNotBlocked(userClient, userId, otherUserId);

  const directKey = directKeyFor(userId, otherUserId);
  const { data: existing } = await admin
    .from("direct_conversations")
    .select("id, direct_key, updated_at, created_at")
    .eq("direct_key", directKey)
    .maybeSingle();
  if (existing) {
    await admin.from("direct_conversation_participants").upsert(
      [
        { conversation_id: existing.id, user_id: userId },
        { conversation_id: existing.id, user_id: otherUserId },
      ],
      { onConflict: "conversation_id,user_id" },
    );
    return existing;
  }

  const relationship = await getRelationshipStatus({ userClient, userId, otherUserId });
  if (!relationship.canMessage) {
    throw new ApiError(403, "You can only message accepted CampusQuest connections.", "MESSAGE_NOT_ALLOWED");
  }

  const { data: conversation, error: conversationError } = await admin
    .from("direct_conversations")
    .upsert({ direct_key: directKey, created_by: userId, type: "direct" }, { onConflict: "direct_key" })
    .select("id, direct_key, updated_at, created_at")
    .single();
  if (conversationError || !conversation) {
    throw new ApiError(400, conversationError?.message ?? "Could not create conversation.", "CONVERSATION_CREATE_FAILED");
  }

  const { error: participantError } = await admin.from("direct_conversation_participants").upsert(
    [
      { conversation_id: conversation.id, user_id: userId },
      { conversation_id: conversation.id, user_id: otherUserId },
    ],
    { onConflict: "conversation_id,user_id" },
  );
  if (participantError) {
    throw new ApiError(400, participantError.message, "CONVERSATION_PARTICIPANT_FAILED");
  }

  return conversation;
}

/** Marketplace Message Seller: same 1:1 thread as DMs, without requiring an accepted connection. */
export async function getOrCreateMarketplaceConversation(args: {
  userClient: SupabaseClientLike;
  userId: string;
  otherUserId: string;
}) {
  const { userClient, userId, otherUserId } = args;
  const admin = createAdminClient();
  await assertAccountCanSocialize(userClient, userId);
  if (userId === otherUserId) {
    throw new ApiError(400, "You cannot message yourself.", "MARKETPLACE_MESSAGE_SELF");
  }
  await assertNotBlocked(userClient, userId, otherUserId);

  const directKey = directKeyFor(userId, otherUserId);
  const { data: conversation, error: conversationError } = await admin
    .from("direct_conversations")
    .upsert({ direct_key: directKey, created_by: userId, type: "direct" }, { onConflict: "direct_key" })
    .select("id, direct_key, updated_at, created_at")
    .single();
  if (conversationError || !conversation) {
    throw new ApiError(400, conversationError?.message ?? "Could not create conversation.", "CONVERSATION_CREATE_FAILED");
  }

  const { error: participantError } = await admin.from("direct_conversation_participants").upsert(
    [
      { conversation_id: conversation.id, user_id: userId },
      { conversation_id: conversation.id, user_id: otherUserId },
    ],
    { onConflict: "conversation_id,user_id" },
  );
  if (participantError) {
    throw new ApiError(400, participantError.message, "CONVERSATION_PARTICIPANT_FAILED");
  }

  return conversation;
}

export async function createGroupConversation(args: {
  userClient: SupabaseClientLike;
  userId: string;
  memberIds: string[];
  title?: string;
}) {
  const { userClient, userId, memberIds, title } = args;
  const admin = createAdminClient();
  await assertAccountCanSocialize(userClient, userId);

  const uniqueMembers = Array.from(new Set(memberIds.filter((id) => id && id !== userId)));
  if (uniqueMembers.length < 2) {
    throw new ApiError(400, "Select at least two people for a group chat.", "VALIDATION_ERROR");
  }
  if (uniqueMembers.length > 30) {
    throw new ApiError(400, "Group chats support up to 30 members.", "VALIDATION_ERROR");
  }

  for (const memberId of uniqueMembers) {
    const relationship = await getRelationshipStatus({ userClient, userId, otherUserId: memberId });
    if (!relationship.canMessage) {
      throw new ApiError(
        403,
        "You can only add accepted CampusQuest connections to a group.",
        "GROUP_MEMBER_NOT_ALLOWED",
      );
    }
  }

  const trimmedTitle = title?.trim().slice(0, 80) || null;
  const { data: conversation, error: conversationError } = await admin
    .from("direct_conversations")
    .insert({
      type: "group",
      direct_key: null,
      created_by: userId,
      title: trimmedTitle,
    })
    .select("id, type, title, created_at, updated_at")
    .single();
  if (conversationError || !conversation) {
    throw new ApiError(400, conversationError?.message ?? "Could not create group.", "GROUP_CREATE_FAILED");
  }

  const participantRows = [
    { conversation_id: conversation.id, user_id: userId, role: "owner" },
    ...uniqueMembers.map((memberId) => ({
      conversation_id: conversation.id,
      user_id: memberId,
      role: "member",
    })),
  ];
  const { error: participantError } = await admin.from("direct_conversation_participants").insert(participantRows);
  if (participantError) {
    throw new ApiError(400, participantError.message, "GROUP_PARTICIPANT_FAILED");
  }

  const details = await getConversationDetails({
    userClient,
    userId,
    conversationId: conversation.id,
  });
  return details;
}

export async function getConversationDetails(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
}) {
  const { userClient, userId, conversationId } = args;
  const admin = createAdminClient();
  await assertConversationParticipant(userClient, userId, conversationId);

  const { data: conversation, error: convoError } = await admin
    .from("direct_conversations")
    .select("id, type, title, created_by, created_at, updated_at")
    .eq("id", conversationId)
    .single();
  if (convoError || !conversation) {
    throw new ApiError(404, "Conversation not found.", "CONVERSATION_NOT_FOUND");
  }

  const { data: participantRows, error: participantsError } = await admin
    .from("direct_conversation_participants")
    .select("user_id, role, joined_at")
    .eq("conversation_id", conversationId);
  if (participantsError) {
    throw new ApiError(400, participantsError.message, "CONVERSATION_PARTICIPANTS_FETCH_FAILED");
  }

  const memberIds = (participantRows ?? []).map((row) => row.user_id);
  const { data: profiles, error: profilesError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .in("id", memberIds);
  if (profilesError) throw new ApiError(400, profilesError.message, "CONVERSATION_PROFILES_FETCH_FAILED");

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const members: GroupMemberSummary[] = (participantRows ?? [])
    .map((row) => {
      const profile = profileMap.get(row.user_id);
      if (!profile) return null;
      return {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: resolveProfileAvatar(profile),
        role: (row.role === "owner" ? "owner" : "member") as "owner" | "member",
      };
    })
    .filter(Boolean) as GroupMemberSummary[];

  const convoType = (conversation.type ?? "direct") as ConversationType;
  if (convoType === "direct") {
    const other = members.find((m) => m.id !== userId);
    if (!other) throw new ApiError(404, "Conversation not found.", "CONVERSATION_NOT_FOUND");
    return {
      type: "direct" as const,
      conversationId: conversation.id,
      otherUser: {
        id: other.id,
        username: other.username,
        displayName: other.displayName,
        avatarUrl: other.avatarUrl,
      },
      members,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    };
  }

  const displayName = buildGroupDisplayName({
    title: conversation.title,
    members: members.map((m) => ({ id: m.id, displayName: m.displayName, username: m.username })),
    viewerId: userId,
  });

  const myRole = (participantRows ?? []).find((row) => row.user_id === userId)?.role ?? "member";

  return {
    type: "group" as const,
    conversationId: conversation.id,
    title: conversation.title,
    displayName,
    memberCount: members.length,
    members,
    myRole: myRole === "owner" ? ("owner" as const) : ("member" as const),
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  };
}

export async function updateGroupConversation(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  title: string;
}) {
  const { userClient, userId, conversationId, title } = args;
  const admin = createAdminClient();
  const convoType = await getConversationType(admin, conversationId);
  if (convoType !== "group") {
    throw new ApiError(400, "Only group conversations can be renamed.", "VALIDATION_ERROR");
  }

  const { data: participant, error: participantError } = await admin
    .from("direct_conversation_participants")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (participantError) throw new ApiError(400, participantError.message, "CONVERSATION_PARTICIPANT_CHECK_FAILED");
  if (!participant) throw new ApiError(403, "Conversation access denied.", "CONVERSATION_FORBIDDEN");
  if (participant.role !== "owner") {
    throw new ApiError(403, "Only the group owner can rename the chat.", "FORBIDDEN");
  }

  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) throw new ApiError(400, "Group name is required.", "VALIDATION_ERROR");

  const { data, error } = await admin
    .from("direct_conversations")
    .update({ title: trimmed })
    .eq("id", conversationId)
    .select("id, title, updated_at")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not rename group.", "GROUP_UPDATE_FAILED");

  return getConversationDetails({ userClient, userId, conversationId });
}

export async function leaveGroupConversation(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
}) {
  const { userClient, userId, conversationId } = args;
  const admin = createAdminClient();
  const convoType = await getConversationType(admin, conversationId);
  if (convoType !== "group") {
    throw new ApiError(400, "Only group conversations support leaving.", "VALIDATION_ERROR");
  }
  await assertConversationParticipant(userClient, userId, conversationId);

  const { error } = await admin
    .from("direct_conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new ApiError(400, error.message, "GROUP_LEAVE_FAILED");

  return { left: true };
}

export async function addGroupMembers(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  memberIds: string[];
}) {
  const { userClient, userId, conversationId, memberIds } = args;
  const admin = createAdminClient();
  const convoType = await getConversationType(admin, conversationId);
  if (convoType !== "group") {
    throw new ApiError(400, "Only group conversations support adding members.", "VALIDATION_ERROR");
  }
  await assertConversationParticipant(userClient, userId, conversationId);
  await assertAccountCanSocialize(userClient, userId);

  const uniqueMembers = Array.from(new Set(memberIds.filter((id) => id && id !== userId)));
  if (uniqueMembers.length === 0) {
    throw new ApiError(400, "Select at least one person to add.", "VALIDATION_ERROR");
  }
  if (uniqueMembers.length > 20) {
    throw new ApiError(400, "You can add up to 20 people at a time.", "VALIDATION_ERROR");
  }

  const { data: existingRows, error: existingError } = await admin
    .from("direct_conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  if (existingError) throw new ApiError(400, existingError.message, "CONVERSATION_PARTICIPANTS_FETCH_FAILED");

  const existingIds = new Set((existingRows ?? []).map((row) => row.user_id));
  if (existingIds.size + uniqueMembers.filter((id) => !existingIds.has(id)).length > 31) {
    throw new ApiError(400, "Group chats support up to 30 members.", "VALIDATION_ERROR");
  }

  const toAdd: string[] = [];
  for (const memberId of uniqueMembers) {
    if (existingIds.has(memberId)) continue;
    const relationship = await getRelationshipStatus({ userClient, userId, otherUserId: memberId });
    if (!relationship.canMessage) {
      throw new ApiError(
        403,
        "You can only add accepted CampusQuest connections to a group.",
        "GROUP_MEMBER_NOT_ALLOWED",
      );
    }
    toAdd.push(memberId);
  }

  if (toAdd.length === 0) {
    return getConversationDetails({ userClient, userId, conversationId });
  }

  const { error: insertError } = await admin.from("direct_conversation_participants").insert(
    toAdd.map((memberId) => ({
      conversation_id: conversationId,
      user_id: memberId,
      role: "member",
    })),
  );
  if (insertError) throw new ApiError(400, insertError.message, "GROUP_ADD_MEMBER_FAILED");

  await admin
    .from("direct_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return getConversationDetails({ userClient, userId, conversationId });
}

export async function removeGroupMember(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  memberId: string;
}) {
  const { userClient, userId, conversationId, memberId } = args;
  const admin = createAdminClient();
  const convoType = await getConversationType(admin, conversationId);
  if (convoType !== "group") {
    throw new ApiError(400, "Only group conversations support removing members.", "VALIDATION_ERROR");
  }

  const { data: actor, error: actorError } = await admin
    .from("direct_conversation_participants")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (actorError) throw new ApiError(400, actorError.message, "CONVERSATION_PARTICIPANT_CHECK_FAILED");
  if (!actor) throw new ApiError(403, "Conversation access denied.", "CONVERSATION_FORBIDDEN");
  if (actor.role !== "owner") {
    throw new ApiError(403, "Only the group owner can remove members.", "FORBIDDEN");
  }
  if (memberId === userId) {
    throw new ApiError(400, "Use leave to remove yourself from the group.", "VALIDATION_ERROR");
  }

  const { data: target, error: targetError } = await admin
    .from("direct_conversation_participants")
    .select("role")
    .eq("conversation_id", conversationId)
    .eq("user_id", memberId)
    .maybeSingle();
  if (targetError) throw new ApiError(400, targetError.message, "CONVERSATION_PARTICIPANT_CHECK_FAILED");
  if (!target) throw new ApiError(404, "Member not found in this group.", "GROUP_MEMBER_NOT_FOUND");
  if (target.role === "owner") {
    throw new ApiError(400, "The group owner cannot be removed.", "VALIDATION_ERROR");
  }

  const { error } = await admin
    .from("direct_conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", memberId);
  if (error) throw new ApiError(400, error.message, "GROUP_REMOVE_MEMBER_FAILED");

  await admin
    .from("direct_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return getConversationDetails({ userClient, userId, conversationId });
}

async function assertConversationParticipant(userClient: SupabaseClientLike, userId: string, conversationId: string) {
  const { data, error } = await userClient
    .from("direct_conversation_participants")
    .select("conversation_id, user_id, hidden_at, last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "CONVERSATION_PARTICIPANT_CHECK_FAILED");
  if (!data) throw new ApiError(403, "Conversation access denied.", "CONVERSATION_FORBIDDEN");
  return data;
}

export async function listConversations(args: { userClient: SupabaseClientLike; userId: string }) {
  const { userClient, userId } = args;
  const admin = createAdminClient();
  const { data: myParticipants, error: myParticipantsError } = await userClient
    .from("direct_conversation_participants")
    .select("conversation_id, last_read_at, hidden_at, updated_at")
    .eq("user_id", userId)
    .is("hidden_at", null)
    .order("updated_at", { ascending: false });
  if (myParticipantsError) throw new ApiError(400, myParticipantsError.message, "CONVERSATIONS_FETCH_FAILED");

  const conversationIds = (myParticipants ?? []).map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  const participantByConvo = new Map(
    (myParticipants ?? []).map((row) => [row.conversation_id, row]),
  );

  const [
    { data: convoMetaRows, error: convoMetaError },
    { data: participants, error: participantsError },
    { data: latestMessages, error: latestMessagesError },
  ] = await Promise.all([
    admin
      .from("direct_conversations")
      .select("id, type, title, updated_at")
      .in("id", conversationIds),
    admin
      .from("direct_conversation_participants")
      .select("conversation_id, user_id, role")
      .in("conversation_id", conversationIds),
    userClient
      .from("direct_messages")
      .select(MESSAGE_SELECT)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);
  if (convoMetaError) throw new ApiError(400, convoMetaError.message, "CONVERSATIONS_META_FETCH_FAILED");
  if (participantsError) throw new ApiError(400, participantsError.message, "CONVERSATION_PARTICIPANTS_FETCH_FAILED");
  if (latestMessagesError) throw new ApiError(400, latestMessagesError.message, "CONVERSATION_MESSAGES_FETCH_FAILED");

  const convoTypeById = new Map((convoMetaRows ?? []).map((row) => [row.id, (row.type ?? "direct") as ConversationType]));
  const convoTitleById = new Map((convoMetaRows ?? []).map((row) => [row.id, row.title as string | null]));

  const participantsByConvo = new Map<string, Array<{ user_id: string; role: string }>>();
  for (const row of participants ?? []) {
    const list = participantsByConvo.get(row.conversation_id) ?? [];
    list.push({ user_id: row.user_id, role: row.role ?? "member" });
    participantsByConvo.set(row.conversation_id, list);
  }

  const allUserIds = Array.from(new Set((participants ?? []).map((row) => row.user_id)));
  const { data: profiles, error: profilesError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .in("id", allUserIds);
  if (profilesError) throw new ApiError(400, profilesError.message, "CONVERSATION_PROFILES_FETCH_FAILED");
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const latestByConversation = new Map<string, (typeof latestMessages)[number]>();
  for (const message of latestMessages ?? []) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message);
    }
  }

  const results: Array<Record<string, unknown>> = [];

  for (const conversationId of conversationIds) {
    const convoType = convoTypeById.get(conversationId) ?? "direct";
    const participant = participantByConvo.get(conversationId);
    const memberRows = participantsByConvo.get(conversationId) ?? [];
    const latest = latestByConversation.get(conversationId);
    const latestMessage = latest ? mapDirectMessageRow(latest, false) : null;
    const lastReadAt = participant?.last_read_at ?? null;

    if (convoType === "group") {
      const members: GroupMemberSummary[] = memberRows
        .map((row) => {
          const profile = profileMap.get(row.user_id);
          if (!profile) return null;
          return {
            id: profile.id,
            username: profile.username,
            displayName: profile.display_name,
            avatarUrl: resolveProfileAvatar(profile),
            role: (row.role === "owner" ? "owner" : "member") as "owner" | "member",
          };
        })
        .filter(Boolean) as GroupMemberSummary[];

      const title = convoTitleById.get(conversationId) ?? null;
      const displayName = buildGroupDisplayName({
        title,
        members: members.map((m) => ({ id: m.id, displayName: m.displayName, username: m.username })),
        viewerId: userId,
      });

      results.push({
        type: "group",
        conversationId,
        title,
        displayName,
        memberCount: members.length,
        members,
        latestMessage,
        lastReadAt,
      });
      continue;
    }

    const otherUserId = memberRows.find((row) => row.user_id !== userId)?.user_id;
    if (!otherUserId) continue;
    const profile = profileMap.get(otherUserId);
    if (!profile) continue;

    results.push({
      type: "direct",
      conversationId,
      otherUser: {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: resolveProfileAvatar(profile),
      },
      latestMessage,
      lastReadAt,
    });
  }

  return results.sort((a, b) => {
    const aTime = new Date((a.latestMessage as { createdAt?: string } | null)?.createdAt ?? 0).getTime();
    const bTime = new Date((b.latestMessage as { createdAt?: string } | null)?.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
}

export type ConversationReadSyncResult = {
  messagesMarkedRead: number;
  notificationsMarkedRead: number;
  readAt: string;
};

export async function listConversationMessages(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  limit?: number;
}) {
  const { userClient, userId, conversationId, limit = 50 } = args;
  const admin = createAdminClient();
  const participant = await assertConversationParticipant(userClient, userId, conversationId);
  const convoType = await getConversationType(admin, conversationId);

  const capped = Math.max(1, Math.min(100, limit));
  const { data, error } = await userClient
    .from("direct_messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new ApiError(400, error.message, "MESSAGES_FETCH_FAILED");

  const nowIso = new Date().toISOString();
  if (participant.hidden_at) {
    await userClient
      .from("direct_conversation_participants")
      .update({ hidden_at: null })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
  }

  let messagesMarkedRead = 0;
  if (convoType === "group") {
    const lastReadAt = participant.last_read_at;
    if (lastReadAt) {
      const { count, error: unreadErr } = await userClient
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", userId)
        .gt("created_at", lastReadAt);
      if (unreadErr) throw new ApiError(400, unreadErr.message, "MESSAGES_UNREAD_COUNT_FAILED");
      messagesMarkedRead = count ?? 0;
    } else {
      const { count, error: unreadErr } = await userClient
        .from("direct_messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", userId);
      if (unreadErr) throw new ApiError(400, unreadErr.message, "MESSAGES_UNREAD_COUNT_FAILED");
      messagesMarkedRead = count ?? 0;
    }
    await userClient
      .from("direct_conversation_participants")
      .update({ last_read_at: nowIso })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
  } else {
    const { count, error: unreadErr } = await userClient
      .from("direct_messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (unreadErr) throw new ApiError(400, unreadErr.message, "MESSAGES_UNREAD_COUNT_FAILED");
    messagesMarkedRead = count ?? 0;

    await Promise.all([
      userClient
        .from("direct_messages")
        .update({ read_at: nowIso })
        .eq("conversation_id", conversationId)
        .eq("recipient_id", userId)
        .is("read_at", null),
      userClient
        .from("direct_conversation_participants")
        .update({ last_read_at: nowIso })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId),
    ]);
  }

  const { markedCount: notificationsMarkedRead } = await markConversationNotificationsRead({
    userClient,
    userId,
    conversationId,
    readAt: nowIso,
  });

  const readSync: ConversationReadSyncResult = {
    messagesMarkedRead,
    notificationsMarkedRead,
    readAt: nowIso,
  };

  const msgRows = data ?? [];
  const messageIds = msgRows.map((m) => m.id);
  const favSet = new Set<string>();
  if (messageIds.length > 0) {
    const { data: favRows, error: favErr } = await userClient
      .from("direct_message_favorites")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", messageIds);
    if (favErr) throw new ApiError(400, favErr.message, "MESSAGE_FAVORITES_FETCH_FAILED");
    for (const r of favRows ?? []) favSet.add((r as { message_id: string }).message_id);
  }

  const senderIds = Array.from(new Set(msgRows.map((m) => m.sender_id)));
  const senderMap = new Map<string, { id: string; username: string; displayName: string; avatarUrl: string | null }>();
  if (convoType === "group" && senderIds.length > 0) {
    const { data: senderProfiles, error: senderErr } = await userClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_custom_json")
      .in("id", senderIds);
    if (senderErr) throw new ApiError(400, senderErr.message, "MESSAGE_SENDERS_FETCH_FAILED");
    for (const profile of senderProfiles ?? []) {
      senderMap.set(profile.id, {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: resolveProfileAvatar(profile),
      });
    }
  }

  const mappedMessages = msgRows.reverse().map((message) => {
    const dto = mapDirectMessageRow(message, favSet.has(message.id));
    const sender = senderMap.get(message.sender_id);
    return sender ? { ...dto, sender } : dto;
  });

  // Re-resolve shared posts from the referenced post ID so edits/deletes
  // surface live ("This post is no longer available.") without storing a copy.
  const refreshed = await Promise.all(
    mappedMessages.map(async (dto) => {
      if (dto.type !== "shared_post" || !dto.sharedPostId) return dto;
      try {
        const fresh = await buildSharedPostPreview({
          userClient,
          viewerId: userId,
          postId: dto.sharedPostId,
          postType: dto.sharedPostType ?? "quad",
          locationName: dto.sharedPostPreview?.locationName ?? null,
        });
        return {
          ...dto,
          sharedPostPreview: fresh,
          metadata: {
            ...dto.metadata,
            sharedPostPreview: fresh,
          },
        };
      } catch {
        return {
          ...dto,
          sharedPostPreview: dto.sharedPostPreview
            ? { ...dto.sharedPostPreview, unavailable: true }
            : {
                postId: dto.sharedPostId,
                postType: (dto.sharedPostType ?? "quad") as "quad" | "memory",
                authorId: "",
                authorName: "Unknown",
                authorUsername: "unknown",
                authorAvatar: "🎓",
                caption: "",
                imageUrl: null,
                locationName: null,
                unavailable: true,
              },
        };
      }
    }),
  );

  return { messages: refreshed, readSync };
}

export async function setDirectMessageFavorite(args: {
  userClient: SupabaseClientLike;
  userId: string;
  messageId: string;
  favorited: boolean;
}) {
  const { userClient, userId, messageId, favorited } = args;

  const { data: msg, error: msgErr } = await userClient
    .from("direct_messages")
    .select("id, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr) throw new ApiError(400, msgErr.message, "MESSAGE_LOOKUP_FAILED");
  if (!msg) throw new ApiError(404, "Message not found.", "MESSAGE_NOT_FOUND");

  await assertConversationParticipant(userClient, userId, msg.conversation_id);

  const nowIso = new Date().toISOString();

  if (favorited) {
    const { error: upErr } = await userClient.from("direct_message_favorites").upsert(
      { user_id: userId, message_id: messageId, favorited_at: nowIso },
      { onConflict: "user_id,message_id" },
    );
    if (upErr) throw new ApiError(400, upErr.message, "MESSAGE_FAVORITE_FAILED");
  } else {
    const { error: delErr } = await userClient
      .from("direct_message_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("message_id", messageId);
    if (delErr) throw new ApiError(400, delErr.message, "MESSAGE_UNFAVORITE_FAILED");
  }

  return { messageId, favorited };
}

export async function hideConversation(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
}) {
  const { userClient, userId, conversationId } = args;
  await assertConversationParticipant(userClient, userId, conversationId);
  const nowIso = new Date().toISOString();
  const { error } = await userClient
    .from("direct_conversation_participants")
    .update({ hidden_at: nowIso, updated_at: nowIso })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new ApiError(400, error.message, "CONVERSATION_HIDE_FAILED");
  return { hidden: true, hiddenAt: nowIso };
}

export async function unhideConversation(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
}) {
  const { userClient, userId, conversationId } = args;
  await assertConversationParticipant(userClient, userId, conversationId);
  const nowIso = new Date().toISOString();
  const { error } = await userClient
    .from("direct_conversation_participants")
    .update({ hidden_at: null, updated_at: nowIso })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new ApiError(400, error.message, "CONVERSATION_UNHIDE_FAILED");
  return { hidden: false };
}

export async function sendConversationMessage(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  content?: string;
  type?: DirectMessageType;
  imageUrl?: string | null;
  sharedPostId?: string | null;
  sharedPostType?: SharedPostType | null;
  metadata?: Record<string, unknown>;
}) {
  const {
    userClient,
    userId,
    conversationId,
    type = "text",
    imageUrl = null,
    sharedPostId = null,
    sharedPostType = null,
    metadata = {},
  } = args;
  const admin = createAdminClient();
  await assertAccountCanSocialize(userClient, userId);
  await assertConversationParticipant(userClient, userId, conversationId);
  const convoType = await getConversationType(admin, conversationId);

  let trimmed = (args.content ?? "").trim();
  let messageMetadata = { ...metadata };

  if (type === "text") {
    if (!trimmed) throw new ApiError(400, "Message content is required.", "VALIDATION_ERROR");
  } else if (type === "image") {
    const url = imageUrl?.trim();
    if (!url) throw new ApiError(400, "Image URL is required.", "VALIDATION_ERROR");
    if (!/^https?:\/\//i.test(url)) {
      throw new ApiError(400, "Invalid image URL.", "VALIDATION_ERROR");
    }
    if (!trimmed) trimmed = "📷 Photo";
  } else if (type === "audio") {
    const url = imageUrl?.trim();
    if (!url) throw new ApiError(400, "Audio URL is required.", "VALIDATION_ERROR");
    if (!/^https?:\/\//i.test(url)) {
      throw new ApiError(400, "Invalid audio URL.", "VALIDATION_ERROR");
    }
    if (!trimmed) trimmed = "🎤 Voice message";
  } else if (type === "shared_post") {
    if (!sharedPostId) throw new ApiError(400, "sharedPostId is required.", "VALIDATION_ERROR");
    if (!sharedPostType) throw new ApiError(400, "sharedPostType is required.", "VALIDATION_ERROR");
    const preview = await buildSharedPostPreview({
      userClient,
      viewerId: userId,
      postId: sharedPostId,
      postType: sharedPostType,
      locationName:
        typeof metadata.locationName === "string" ? metadata.locationName : null,
    });
    if (preview.unavailable) {
      throw new ApiError(404, "Post not found.", "SHARED_POST_NOT_FOUND");
    }
    messageMetadata = { ...messageMetadata, sharedPostPreview: preview };
    if (!trimmed) trimmed = "Shared a post";
  } else {
    throw new ApiError(400, "Invalid message type.", "VALIDATION_ERROR");
  }

  if (trimmed.length > 2000) throw new ApiError(400, "Message is too long.", "VALIDATION_ERROR");

  const { data: participants, error: participantsError } = await admin
    .from("direct_conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  if (participantsError) throw new ApiError(400, participantsError.message, "MESSAGE_PARTICIPANTS_FETCH_FAILED");

  const participantIds = (participants ?? []).map((row) => row.user_id);
  if (participantIds.length === 0) {
    throw new ApiError(400, "Conversation has no participants.", "MESSAGE_PARTICIPANTS_EMPTY");
  }

  const recipientIds =
    convoType === "group"
      ? participantIds.filter((id) => id !== userId)
      : participantIds.filter((id) => id !== userId).slice(0, 1);

  if (recipientIds.length === 0) {
    throw new ApiError(400, "Recipient not found for conversation.", "MESSAGE_RECIPIENT_NOT_FOUND");
  }

  if (convoType === "direct") {
    await assertNotBlocked(userClient, userId, recipientIds[0]!);
  } else {
    for (const memberId of recipientIds) {
      await assertNotBlocked(userClient, userId, memberId);
    }
  }

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: minuteCount, error: minuteCountError } = await userClient
    .from("direct_messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", userId)
    .eq("conversation_id", conversationId)
    .gte("created_at", minuteAgo);
  if (minuteCountError) throw new ApiError(400, minuteCountError.message, "MESSAGE_SPAM_CHECK_FAILED");
  if ((minuteCount ?? 0) >= 12) {
    throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
  }

  const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
  if (type === "text") {
    const { data: duplicateRecent, error: duplicateError } = await userClient
      .from("direct_messages")
      .select("id")
      .eq("sender_id", userId)
      .eq("conversation_id", conversationId)
      .eq("content", trimmed)
      .gte("created_at", thirtySecondsAgo)
      .limit(1)
      .maybeSingle();
    if (duplicateError) throw new ApiError(400, duplicateError.message, "MESSAGE_SPAM_CHECK_FAILED");
    if (duplicateRecent) {
      throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
    }
  }

  const recipientId = convoType === "direct" ? recipientIds[0]! : null;

  const { data: inserted, error: insertedError } = await userClient
    .from("direct_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      recipient_id: recipientId,
      content: trimmed,
      type,
      image_url: type === "image" || type === "audio" ? imageUrl?.trim() ?? null : null,
      shared_post_id: type === "shared_post" ? sharedPostId : null,
      shared_post_type: type === "shared_post" ? sharedPostType : null,
      metadata: messageMetadata,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (insertedError || !inserted) {
    throw new ApiError(400, insertedError?.message ?? "Could not send message.", "MESSAGE_SEND_FAILED");
  }

  await Promise.all([
    userClient
      .from("direct_conversations")
      .update({ updated_at: inserted.created_at })
      .eq("id", conversationId),
    userClient
      .from("direct_conversation_participants")
      .update({ updated_at: inserted.created_at })
      .eq("conversation_id", conversationId),
  ]);

  try {
    const notifyBody =
      type === "image"
        ? trimmed !== "📷 Photo"
          ? `📷 ${trimmed.slice(0, 100)}`
          : "📷 Photo"
        : type === "audio"
          ? "🎤 Voice message"
        : type === "shared_post"
          ? trimmed !== "Shared a post"
            ? trimmed.slice(0, 120)
            : "Shared a post"
          : trimmed.slice(0, 120);
    for (const notifyUserId of recipientIds) {
      await createNotification({
        userId: notifyUserId,
        type: "direct_message",
        title: convoType === "group" ? "New group message" : "New direct message",
        body: notifyBody,
        relatedEntityType: "conversation",
        relatedEntityId: conversationId,
      });
    }
  } catch {}

  return mapDirectMessageRow(inserted, false);
}

export async function sharePostToConversations(args: {
  userClient: SupabaseClientLike;
  userId: string;
  postId: string;
  postType: SharedPostType;
  conversationIds: string[];
  optionalText?: string;
  locationName?: string | null;
}) {
  const uniqueIds = Array.from(new Set(args.conversationIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new ApiError(400, "Select at least one conversation.", "VALIDATION_ERROR");
  }

  const messages = [];
  for (const conversationId of uniqueIds) {
    const message = await sendConversationMessage({
      userClient: args.userClient,
      userId: args.userId,
      conversationId,
      type: "shared_post",
      sharedPostId: args.postId,
      sharedPostType: args.postType,
      content: args.optionalText?.trim() || undefined,
      metadata: args.locationName ? { locationName: args.locationName } : {},
    });
    messages.push(message);
  }
  return messages;
}

export async function blockUser(args: {
  userClient: SupabaseClientLike;
  userId: string;
  blockedUserId: string;
  reason?: string;
}) {
  const { userClient, userId, blockedUserId, reason } = args;
  await assertAccountCanSocialize(userClient, userId);
  if (userId === blockedUserId) throw new ApiError(400, "You cannot block yourself.", "VALIDATION_ERROR");
  const recentBlockCutoff = new Date(Date.now() - 30_000).toISOString();
  const { data: recentBlock, error: recentBlockError } = await userClient
    .from("blocked_users")
    .select("id")
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedUserId)
    .gte("updated_at", recentBlockCutoff)
    .maybeSingle();
  if (recentBlockError) throw new ApiError(400, recentBlockError.message, "BLOCK_SPAM_CHECK_FAILED");
  if (recentBlock) throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
  const { data, error } = await userClient
    .from("blocked_users")
    .upsert(
      {
        blocker_id: userId,
        blocked_id: blockedUserId,
        reason: reason?.trim() ? reason.trim().slice(0, 200) : null,
      },
      { onConflict: "blocker_id,blocked_id" },
    )
    .select("id, blocker_id, blocked_id, created_at")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not block user.", "BLOCK_FAILED");

  const existing = await getConnectionBetween(userClient, userId, blockedUserId);
  if (existing?.status === "accepted") {
    await userClient
      .from("student_connections")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  return data;
}

export async function unblockUser(args: { userClient: SupabaseClientLike; userId: string; blockedUserId: string }) {
  const { userClient, userId, blockedUserId } = args;
  await assertAccountCanSocialize(userClient, userId);
  // Do not rate-limit unblock against the just-created block row — users must be able
  // to reverse an accidental block immediately. Abuse controls remain on blockUser.
  const { error } = await userClient
    .from("blocked_users")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedUserId);
  if (error) throw new ApiError(400, error.message, "UNBLOCK_FAILED");
  return { unblocked: true };
}

export async function listBlockedUsers(args: { userClient: SupabaseClientLike; userId: string }) {
  const { userClient, userId } = args;
  const { data, error } = await userClient
    .from("blocked_users")
    .select("id, blocked_id, created_at")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(400, error.message, "BLOCKED_USERS_FETCH_FAILED");

  const blockedIds = (data ?? []).map((row) => row.blocked_id);
  if (blockedIds.length === 0) return [];
  const { data: profiles, error: profilesError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .in("id", blockedIds);
  if (profilesError) throw new ApiError(400, profilesError.message, "BLOCKED_USER_PROFILES_FAILED");
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return (data ?? [])
    .map((row) => {
      const profile = profileMap.get(row.blocked_id);
      if (!profile) return null;
      return {
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: resolveProfileAvatar(profile),
        blockedAt: row.created_at,
      };
    })
    .filter(Boolean);
}

export async function reportMessage(args: {
  userClient: SupabaseClientLike;
  userId: string;
  messageId: string;
  reason: ReportReason;
  details?: string;
}) {
  const { userClient, userId, messageId, reason, details } = args;
  await assertAccountCanSocialize(userClient, userId);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: recentReportCount, error: recentReportError } = await userClient
    .from("message_reports")
    .select("*", { count: "exact", head: true })
    .eq("reporter_id", userId)
    .gte("created_at", tenMinutesAgo);
  if (recentReportError) throw new ApiError(400, recentReportError.message, "REPORT_SPAM_CHECK_FAILED");
  if ((recentReportCount ?? 0) >= 8) {
    throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
  }
  const { data: message, error: messageError } = await userClient
    .from("direct_messages")
    .select("id, sender_id, conversation_id")
    .eq("id", messageId)
    .single();
  if (messageError || !message) throw new ApiError(404, "Message not found.", "MESSAGE_NOT_FOUND");

  await assertConversationParticipant(userClient, userId, message.conversation_id);
  const reportedUserId = message.sender_id;

  const { data: report, error: reportError } = await userClient
    .from("message_reports")
    .upsert(
      {
        message_id: message.id,
        reporter_id: userId,
        reported_user_id: reportedUserId,
        reason,
        details: details?.trim() ? details.trim().slice(0, 1000) : null,
        status: "open",
      },
      { onConflict: "message_id,reporter_id" },
    )
    .select("id, status, reason, created_at")
    .single();
  if (reportError || !report) throw new ApiError(400, reportError?.message ?? "Could not file report.", "REPORT_FAILED");
  return report;
}

export async function listMessageReportsForModeration(limit = 100) {
  const admin = createAdminClient();
  const capped = Math.max(1, Math.min(200, limit));
  const { data, error } = await admin
    .from("message_reports")
    .select("id, message_id, reporter_id, reported_user_id, reason, details, status, moderator_note, reviewed_at, reviewed_by, created_at")
    .order("created_at", { ascending: false })
    .limit(capped);
  if (error) throw new ApiError(400, error.message, "REPORTS_MODERATION_FETCH_FAILED");
  const rows = data ?? [];
  const messageIds = rows.map((row) => row.message_id);
  const profileIds = Array.from(
    new Set(
      rows.flatMap((row) => [row.reporter_id, row.reported_user_id].filter(Boolean) as string[]),
    ),
  );

  const [{ data: messages, error: messagesError }, { data: profiles, error: profilesError }] = await Promise.all([
    messageIds.length > 0
      ? admin
          .from("direct_messages")
          .select("id, content, created_at, sender_id, recipient_id")
          .in("id", messageIds)
      : Promise.resolve({ data: [] as any[], error: null as any }),
    profileIds.length > 0
      ? admin
          .from("profiles")
          .select("id, username, display_name")
          .in("id", profileIds)
      : Promise.resolve({ data: [] as any[], error: null as any }),
  ]);
  if (messagesError) throw new ApiError(400, messagesError.message, "REPORT_MESSAGES_FETCH_FAILED");
  if (profilesError) throw new ApiError(400, profilesError.message, "REPORT_PROFILES_FETCH_FAILED");

  const messageMap = new Map((messages ?? []).map((message: any) => [message.id, message]));
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));

  return rows.map((row: any) => {
    const reporter = profileMap.get(row.reporter_id);
    const reportedUser = profileMap.get(row.reported_user_id);
    const message = messageMap.get(row.message_id);
    return {
      id: row.id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      moderatorNote: row.moderator_note,
      message: message
        ? {
            id: message.id,
            content: message.content,
            createdAt: message.created_at,
            senderId: message.sender_id,
            recipientId: message.recipient_id,
          }
        : null,
      reporter: reporter
        ? {
            id: reporter.id,
            username: reporter.username,
            displayName: reporter.display_name,
          }
        : null,
      reportedUser: reportedUser
        ? {
            id: reportedUser.id,
            username: reportedUser.username,
            displayName: reportedUser.display_name,
          }
        : null,
    };
  });
}

export async function resolveMessageReport(args: {
  reportId: string;
  status: "resolved" | "dismissed";
  moderatorNote?: string;
  reviewerUserId?: string;
  reviewerEmail?: string;
}) {
  const admin = createAdminClient();
  const { reportId, status, moderatorNote, reviewerUserId, reviewerEmail } = args;
  const { data: reportRow } = await admin
    .from("message_reports")
    .select("id, reported_user_id")
    .eq("id", reportId)
    .maybeSingle();
  const { data, error } = await admin
    .from("message_reports")
    .update({
      status,
      moderator_note: moderatorNote?.trim() ? moderatorNote.trim().slice(0, 1000) : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerUserId ?? null,
    })
    .eq("id", reportId)
    .select("id, status, reviewed_at, reviewed_by")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not resolve report.", "REPORT_RESOLVE_FAILED");
  await logAdminAuditAction({
    actionType: status === "resolved" ? "report_resolved" : "report_dismissed",
    targetUserId: reportRow?.reported_user_id ?? null,
    adminUserId: reviewerUserId ?? null,
    adminEmail: reviewerEmail ?? null,
    reason: moderatorNote ?? null,
    metadata: {
      reportId: data.id,
      status: data.status,
    },
  });
  return data;
}

export async function suspendUserForModeration(args: {
  userId: string;
  status: "active" | "suspended" | "banned";
  reason?: string;
  suspendedUntil?: string;
  updatedBy?: string;
  adminEmail?: string;
}) {
  const { userId, status, reason, suspendedUntil, updatedBy, adminEmail } = args;
  return setAccountSafetyStatus({
    userId,
    status,
    reason,
    suspendedUntil: suspendedUntil ?? null,
    updatedBy: updatedBy ?? null,
    adminEmail: adminEmail ?? null,
  });
}
