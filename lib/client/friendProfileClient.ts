"use client";

import { fetchAuthed } from "@/lib/client/dashboardApi";
import {
  buildLocalCharacterFromServer,
  type MeProfileRow,
  type MeStatsRow,
} from "@/lib/client/profileCharacter";
import type { Character } from "@/lib/types";

export async function fetchFriendCharacter(userId: string): Promise<Character> {
  const data = await fetchAuthed<{ profile: MeProfileRow; stats: MeStatsRow }>(
    `/api/users/${userId}/character`,
  );
  return buildLocalCharacterFromServer(data.profile, data.stats);
}
