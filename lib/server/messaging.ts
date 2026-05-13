import { ApiError } from "@/lib/server/http";
import { createNotification } from "@/lib/server/notifications";
import { assertAccountCanSocialize, setAccountSafetyStatus } from "@/lib/server/accountSafety";
import { logAdminAuditAction } from "@/lib/server/audit";
import { requireMatchingVerifiedSchool } from "@/lib/server/schoolVerification";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type ReportReason = "harassment" | "threat" | "scam" | "impersonation" | "discrimination" | "unsafe" | "other";

function directKeyFor(userA: string, userB: string) {
  return [userA, userB].sort().join("|");
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
    .select("id, username, display_name, avatar_url")
    .in("id", otherUserIds);
  if (profilesError) throw new ApiError(400, profilesError.message, "CONNECTION_PROFILES_FETCH_FAILED");

  const map = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return rows
    .map((row) => {
      const otherUserId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      const profile = map.get(otherUserId);
      if (!profile) return null;
      return {
        connectionId: row.id,
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
      };
    })
    .filter(Boolean);
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
    throw new ApiError(409, "You are already connected.", "ALREADY_CONNECTED");
  }
  if (existing?.status === "pending") {
    if (existing.requester_id === userId) {
      throw new ApiError(409, "Connection request already sent.", "REQUEST_ALREADY_SENT");
    }
    throw new ApiError(409, "This user already sent you a request.", "REQUEST_ALREADY_RECEIVED");
  }

  if (existing) {
    const { data, error } = await userClient
      .from("student_connections")
      .update({
        requester_id: userId,
        addressee_id: target.id,
        status: "pending",
        responded_at: null,
      })
      .eq("id", existing.id)
      .select("id, requester_id, addressee_id, status, created_at")
      .single();
    if (error || !data) throw new ApiError(400, error?.message ?? "Could not update request.", "CONNECTION_REQUEST_FAILED");
    return data;
  }

  const { data: created, error: createdError } = await userClient
    .from("student_connections")
    .insert({
      requester_id: userId,
      addressee_id: target.id,
      status: "pending",
    })
    .select("id, requester_id, addressee_id, status, created_at")
    .single();
  if (createdError || !created) {
    throw new ApiError(400, createdError?.message ?? "Could not create request.", "CONNECTION_REQUEST_FAILED");
  }
  return created;
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
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  if (profilesError) throw new ApiError(400, profilesError.message, "CONNECTION_REQUEST_PROFILES_FAILED");

  const map = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return rows
    .map((row) => {
      const personId = direction === "incoming" ? row.requester_id : row.addressee_id;
      const profile = map.get(personId);
      if (!profile) return null;
      return {
        requestId: row.id,
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        createdAt: row.created_at,
      };
    })
    .filter(Boolean);
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
  if (nextStatus === "accepted") {
    try {
      await createNotification({
        userId: request.requester_id,
        type: "connection_accepted",
        title: "Connection request accepted",
        body: "A student accepted your connection request.",
        relatedEntityType: "connection_request",
        relatedEntityId: request.id,
      });
    } catch {}
  }
  return data;
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
  const canMessage = connectionStatus === "accepted" && !blockedByMe.data && !blockedByOther.data;
  return {
    canMessage,
    connectionStatus,
    incomingPending,
    outgoingPending,
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
  const relationship = await getRelationshipStatus({ userClient, userId, otherUserId });
  if (!relationship.canMessage) {
    throw new ApiError(403, "You can only message accepted CampusQuest connections.", "MESSAGE_NOT_ALLOWED");
  }

  const directKey = directKeyFor(userId, otherUserId);
  const { data: conversation, error: conversationError } = await admin
    .from("direct_conversations")
    .upsert({ direct_key: directKey, created_by: userId }, { onConflict: "direct_key" })
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

async function assertConversationParticipant(userClient: SupabaseClientLike, userId: string, conversationId: string) {
  const { data, error } = await userClient
    .from("direct_conversation_participants")
    .select("conversation_id, user_id, hidden_at")
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
    .select("conversation_id, last_read_at, hidden_at")
    .eq("user_id", userId)
    .is("hidden_at", null)
    .order("updated_at", { ascending: false });
  if (myParticipantsError) throw new ApiError(400, myParticipantsError.message, "CONVERSATIONS_FETCH_FAILED");

  const conversationIds = (myParticipants ?? []).map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  const [{ data: participants, error: participantsError }, { data: latestMessages, error: latestMessagesError }] =
    await Promise.all([
      admin
        .from("direct_conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", conversationIds),
      userClient
        .from("direct_messages")
        .select("id, conversation_id, sender_id, recipient_id, content, created_at, read_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
    ]);
  if (participantsError) throw new ApiError(400, participantsError.message, "CONVERSATION_PARTICIPANTS_FETCH_FAILED");
  if (latestMessagesError) throw new ApiError(400, latestMessagesError.message, "CONVERSATION_MESSAGES_FETCH_FAILED");

  const otherByConversation = new Map<string, string>();
  for (const row of participants ?? []) {
    if (row.user_id !== userId && !otherByConversation.has(row.conversation_id)) {
      otherByConversation.set(row.conversation_id, row.user_id);
    }
  }

  const otherUserIds = Array.from(new Set(otherByConversation.values()));
  const { data: profiles, error: profilesError } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", otherUserIds);
  if (profilesError) throw new ApiError(400, profilesError.message, "CONVERSATION_PROFILES_FETCH_FAILED");
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const latestByConversation = new Map<string, any>();
  for (const message of latestMessages ?? []) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message);
    }
  }

  return (myParticipants ?? [])
    .map((participant) => {
      const otherUserId = otherByConversation.get(participant.conversation_id);
      if (!otherUserId) return null;
      const profile = profileMap.get(otherUserId);
      if (!profile) return null;
      const latest = latestByConversation.get(participant.conversation_id);
      return {
        conversationId: participant.conversation_id,
        otherUser: {
          id: profile.id,
          username: profile.username,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
        },
        latestMessage: latest
          ? {
              id: latest.id,
              senderId: latest.sender_id,
              recipientId: latest.recipient_id,
              content: latest.content,
              createdAt: latest.created_at,
              readAt: latest.read_at,
            }
          : null,
      };
    })
    .filter(Boolean);
}

export async function listConversationMessages(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  limit?: number;
}) {
  const { userClient, userId, conversationId, limit = 50 } = args;
  const participant = await assertConversationParticipant(userClient, userId, conversationId);

  const capped = Math.max(1, Math.min(100, limit));
  const { data, error } = await userClient
    .from("direct_messages")
    .select("id, conversation_id, sender_id, recipient_id, content, created_at, read_at")
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

  return (data ?? []).reverse().map((message) => ({
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    recipientId: message.recipient_id,
    content: message.content,
    createdAt: message.created_at,
    readAt: message.read_at,
  }));
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
  content: string;
}) {
  const { userClient, userId, conversationId, content } = args;
  const admin = createAdminClient();
  await assertAccountCanSocialize(userClient, userId);
  const trimmed = content.trim();
  if (!trimmed) throw new ApiError(400, "Message content is required.", "VALIDATION_ERROR");
  if (trimmed.length > 2000) throw new ApiError(400, "Message is too long.", "VALIDATION_ERROR");
  await assertConversationParticipant(userClient, userId, conversationId);

  const { data: participants, error: participantsError } = await admin
    .from("direct_conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  if (participantsError) throw new ApiError(400, participantsError.message, "MESSAGE_PARTICIPANTS_FETCH_FAILED");

  const recipient = (participants ?? []).find((row) => row.user_id !== userId);
  if (!recipient) throw new ApiError(400, "Recipient not found for conversation.", "MESSAGE_RECIPIENT_NOT_FOUND");

  await assertNotBlocked(userClient, userId, recipient.user_id);

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: minuteCount, error: minuteCountError } = await userClient
    .from("direct_messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", userId)
    .eq("recipient_id", recipient.user_id)
    .gte("created_at", minuteAgo);
  if (minuteCountError) throw new ApiError(400, minuteCountError.message, "MESSAGE_SPAM_CHECK_FAILED");
  if ((minuteCount ?? 0) >= 12) {
    throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
  }

  const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
  const { data: duplicateRecent, error: duplicateError } = await userClient
    .from("direct_messages")
    .select("id")
    .eq("sender_id", userId)
    .eq("recipient_id", recipient.user_id)
    .eq("content", trimmed)
    .gte("created_at", thirtySecondsAgo)
    .limit(1)
    .maybeSingle();
  if (duplicateError) throw new ApiError(400, duplicateError.message, "MESSAGE_SPAM_CHECK_FAILED");
  if (duplicateRecent) {
    throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
  }

  const { data: inserted, error: insertedError } = await userClient
    .from("direct_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      recipient_id: recipient.user_id,
      content: trimmed,
    })
    .select("id, conversation_id, sender_id, recipient_id, content, created_at, read_at")
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
    await createNotification({
      userId: recipient.user_id,
      type: "direct_message",
      title: "New direct message",
      body: trimmed.slice(0, 120),
      relatedEntityType: "conversation",
      relatedEntityId: conversationId,
    });
  } catch {}

  return {
    id: inserted.id,
    conversationId: inserted.conversation_id,
    senderId: inserted.sender_id,
    recipientId: inserted.recipient_id,
    content: inserted.content,
    createdAt: inserted.created_at,
    readAt: inserted.read_at,
  };
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
  const recentBlockCutoff = new Date(Date.now() - 30_000).toISOString();
  const { data: recentlyTouched, error: recentlyTouchedError } = await userClient
    .from("blocked_users")
    .select("id")
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedUserId)
    .gte("updated_at", recentBlockCutoff)
    .maybeSingle();
  if (recentlyTouchedError) throw new ApiError(400, recentlyTouchedError.message, "UNBLOCK_SPAM_CHECK_FAILED");
  if (recentlyTouched) throw new ApiError(429, ABUSE_RATE_LIMIT_MESSAGE, "ABUSE_RATE_LIMITED");
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
    .select("id, username, display_name, avatar_url")
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
        avatarUrl: profile.avatar_url,
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
