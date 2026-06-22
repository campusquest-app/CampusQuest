"use client";

import { deleteAuthed, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export type PinnedDmUserRow = {
  pinnedUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  pinnedAt: string;
};

export async function fetchPinnedDmUsers(): Promise<PinnedDmUserRow[]> {
  try {
    const data = await fetchAuthed<{ pinnedUsers: PinnedDmUserRow[] }>("/api/social/pinned-dm-users");
    return data.pinnedUsers ?? [];
  } catch (error) {
    console.error("[cq][inbox] Could not load pinned DM users; hiding pinned row.", error);
    return [];
  }
}

export async function pinDmUser(pinnedUserId: string): Promise<void> {
  await postAuthed("/api/social/pinned-dm-users", { pinnedUserId });
}

export async function unpinDmUser(pinnedUserId: string): Promise<void> {
  await deleteAuthed(`/api/social/pinned-dm-users/${pinnedUserId}`);
}
