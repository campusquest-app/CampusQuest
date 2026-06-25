"use client";

import { resolveAvatarParts } from "@/lib/avatarSource";
import { deleteAuthed, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import type { CharacterStats, Friend } from "@/lib/types";

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

export type ConnectionPlayerStats = {
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
};

export type ConnectionItem = {
  connectionId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  relationshipStatus?: "connected";
  level?: number;
  xp?: number;
  streakDays?: number;
  title?: string | null;
  guild?: string | null;
  stats?: ConnectionPlayerStats;
  statsAvailable?: boolean;
};

export type SendConnectionRequestResult = {
  status: "sent" | "connected" | "already_sent" | "already_received";
  message: string;
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
  } | null;
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
  return resolveAvatarParts(profile);
}

const EMPTY_STATS: CharacterStats = {
  strength: 0,
  stamina: 0,
  knowledge: 0,
  social: 0,
  focus: 0,
};

/** Map API connection row to Friend card display model using server stats when present. */
export function connectionItemToFriend(connection: ConnectionItem, addedAt = Date.now()): Friend {
  const stats = connection.stats ?? EMPTY_STATS;
  return {
    userId: connection.userId,
    username: connection.username,
    name: connection.displayName,
    avatar: avatarFromConnectionProfile(connection),
    level: connection.level ?? 1,
    totalXP: connection.xp ?? 0,
    streakDays: connection.streakDays ?? 0,
    stats,
    addedAt,
  };
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
    const data = await postAuthed<
      {
        status?: string;
        message?: string;
        connection: SendConnectionRequestResult["connection"];
        notification: SendConnectionRequestResult["notification"];
      },
      { username: string }
    >("/api/social/connections/request", { username: normalized });

    const status = normalizeConnectionRequestStatus(data.status, data.connection.status);
    const result: SendConnectionRequestResult = {
      status,
      message: data.message ?? "Connection request sent.",
      connection: data.connection,
      notification: data.notification ?? null,
    };

    logFriendRequestClient("success", {
      targetUsername: normalized,
      friendRequestId: result.connection.id,
      requesterId: result.connection.requesterId,
      recipientId: result.connection.addresseeId,
      notificationId: result.notification?.id ?? null,
      notificationUserId: result.notification?.userId ?? null,
      status: result.status,
    });

    if (
      result.notification &&
      result.notification.userId !== result.connection.addresseeId
    ) {
      console.warn("[cq:friend-request] notification recipient mismatch", {
        notificationUserId: result.notification.userId,
        addresseeId: result.connection.addresseeId,
      });
    }

    return result;
  } catch (error) {
    logFriendRequestClient("error", {
      targetUsername: normalized,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function normalizeConnectionRequestStatus(
  apiStatus: string | undefined,
  connectionStatus: string,
): SendConnectionRequestResult["status"] {
  if (apiStatus === "connected" || connectionStatus === "accepted") return "connected";
  if (apiStatus === "already_sent") return "already_sent";
  if (apiStatus === "already_received") return "already_received";
  return "sent";
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
