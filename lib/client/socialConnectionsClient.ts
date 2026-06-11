"use client";

import { deleteAuthed, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export type ConnectionRequestItem = {
  requestId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  createdAt: string;
  mutualFriendsCount: number | null;
};

export type ConnectionItem = {
  connectionId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
};

export type SendConnectionRequestResult = {
  connection: {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: string;
    createdAt: string;
  };
  notification: {
    id: string;
    userId: string;
  };
};

const IS_DEV = process.env.NODE_ENV !== "production";

function logFriendRequestClient(
  phase: "send" | "success" | "error",
  detail: Record<string, unknown>,
) {
  if (!IS_DEV) return;
  console.info(`[cq:friend-request:${phase}]`, detail);
}

export function avatarFromConnectionProfile(profile: {
  avatarUrl: string | null;
  avatarCustomJson: string | null;
}): string {
  const custom = profile.avatarCustomJson?.trim();
  if (custom) return custom;
  const url = profile.avatarUrl?.trim();
  if (url) return url;
  return "🎓";
}

export function formatRequestSentAt(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export async function fetchIncomingConnectionRequests(): Promise<ConnectionRequestItem[]> {
  const data = await fetchAuthed<{ requests: ConnectionRequestItem[] }>(
    "/api/social/connections/requests?direction=incoming",
  );
  return data.requests ?? [];
}

export async function fetchOutgoingConnectionRequests(): Promise<ConnectionRequestItem[]> {
  const data = await fetchAuthed<{ requests: ConnectionRequestItem[] }>(
    "/api/social/connections/requests?direction=outgoing",
  );
  return data.requests ?? [];
}

export type ConnectionsPayload = {
  connections: ConnectionItem[];
  followingCount: number;
};

export async function fetchConnections(): Promise<ConnectionsPayload> {
  const data = await fetchAuthed<{
    connections: ConnectionItem[];
    following?: ConnectionItem[];
    followersCount?: number;
    followingCount?: number;
  }>("/api/social/connections");
  const connections = data.connections ?? data.following ?? [];
  return {
    connections,
    followingCount: data.followingCount ?? connections.length,
  };
}

export type FollowCounts = {
  followersCount: number;
  followingCount: number;
};

export async function fetchFollowCounts(userId: string): Promise<FollowCounts> {
  const data = await fetchAuthed<{ followersCount: number; followingCount: number }>(
    `/api/users/${userId}/profile`,
  );
  return {
    followersCount: data.followersCount ?? 0,
    followingCount: data.followingCount ?? 0,
  };
}

export async function fetchFollowers(userId: string): Promise<ConnectionItem[]> {
  const data = await fetchAuthed<{ followers: ConnectionItem[] }>(`/api/social/followers/${userId}`);
  return data.followers ?? [];
}

export async function fetchFollowing(userId: string): Promise<ConnectionItem[]> {
  const data = await fetchAuthed<{ following: ConnectionItem[] }>(`/api/social/following/${userId}`);
  return data.following ?? [];
}

export async function removeConnection(connectionId: string): Promise<void> {
  await deleteAuthed(`/api/social/connections/${connectionId}`);
}

/** Persist friend request to Supabase via POST /api/social/connections/request */
export async function sendConnectionRequest(username: string): Promise<SendConnectionRequestResult> {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) {
    throw new Error("Enter a username.");
  }

  logFriendRequestClient("send", { targetUsername: normalized });

  try {
    const data = await postAuthed<SendConnectionRequestResult, { username: string }>(
      "/api/social/connections/request",
      { username: normalized },
    );

    logFriendRequestClient("success", {
      targetUsername: normalized,
      friendRequestId: data.connection.id,
      requesterId: data.connection.requesterId,
      recipientId: data.connection.addresseeId,
      notificationId: data.notification.id,
      notificationUserId: data.notification.userId,
      status: data.connection.status,
    });

    if (data.notification.userId !== data.connection.addresseeId) {
      console.warn("[cq:friend-request] notification recipient mismatch", {
        notificationUserId: data.notification.userId,
        addresseeId: data.connection.addresseeId,
      });
    }

    return data;
  } catch (error) {
    logFriendRequestClient("error", {
      targetUsername: normalized,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function respondToConnectionRequest(
  requestId: string,
  action: "accept" | "decline",
): Promise<void> {
  await postAuthed("/api/social/connections/requests/respond", { requestId, action });
}

export async function cancelOutgoingConnectionRequest(requestId: string): Promise<void> {
  await postAuthed("/api/social/connections/requests/cancel", { requestId });
}

export type RelationshipSnapshot = {
  canMessage: boolean;
  incomingPending: boolean;
  outgoingPending: boolean;
  isFollowing: boolean;
  isFollowedBy: boolean;
  followBackAvailable: boolean;
  blockedByMe: boolean;
  blockedByOther: boolean;
  requestId: string | null;
};

export async function fetchRelationship(otherUserId: string): Promise<RelationshipSnapshot> {
  return fetchAuthed<RelationshipSnapshot>(`/api/social/relationships/${otherUserId}`);
}

export function isOutgoingRequestPending(
  outgoing: ConnectionRequestItem[],
  targetUserId: string,
): boolean {
  return outgoing.some((row) => row.userId === targetUserId);
}
