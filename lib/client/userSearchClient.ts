"use client";

import { resolveAvatarParts } from "@/lib/avatarSource";
import { fetchAuthed } from "@/lib/client/dashboardApi";

export const USER_SEARCH_MIN_LEN = 1;
export const USER_SEARCH_DEBOUNCE_MS = 250;
export const USER_SEARCH_LIMIT = 15;

export type UserSearchConnectionStatus = "connected" | "incoming_pending" | "outgoing_pending" | "none";

export type UserSearchResult = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  level: number;
  totalXp: number;
  mutualFriendsCount: number;
  isFriend: boolean;
  connectionStatus: UserSearchConnectionStatus;
};

export function isUserSearchQueryActive(query: string): boolean {
  return query.trim().length >= USER_SEARCH_MIN_LEN;
}

export async function searchUsers(query: string, limit = USER_SEARCH_LIMIT): Promise<UserSearchResult[]> {
  const q = query.trim();
  if (!isUserSearchQueryActive(q)) return [];

  const params = new URLSearchParams({ q, limit: String(limit) });
  const data = await fetchAuthed<{ results: UserSearchResult[] }>(`/api/social/users/search?${params}`);
  return data.results ?? [];
}

export function avatarFromUserSearchResult(row: Pick<UserSearchResult, "avatarUrl" | "avatarCustomJson">): string {
  return resolveAvatarParts(row);
}

export function userSearchConnectionLabel(status: UserSearchConnectionStatus): string | null {
  switch (status) {
    case "connected":
      return "Friends";
    case "incoming_pending":
      return "Follows you";
    case "outgoing_pending":
      return "Requested";
    default:
      return null;
  }
}
