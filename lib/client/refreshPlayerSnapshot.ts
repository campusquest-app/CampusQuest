"use client";

import { invalidateMeSessionCache, fetchMeProfileAndStatsDeduped } from "@/lib/client/meSessionCache";
import { buildLocalCharacterFromServer } from "@/lib/client/profileCharacter";
import { getCharacter, replaceLocalCharacter } from "@/lib/store";
import type { Character } from "@/lib/types";

/** Reload profile + stats from Supabase into the local character (single XP/level source). */
export async function refreshPlayerSnapshotFromServer(): Promise<Character | null> {
  invalidateMeSessionCache();
  const snap = await fetchMeProfileAndStatsDeduped();
  if (!snap?.profile || !snap?.stats) {
    return getCharacter();
  }
  const merged = buildLocalCharacterFromServer(snap.profile, snap.stats);
  replaceLocalCharacter(merged, { skipRemoteSync: true });
  return merged;
}
