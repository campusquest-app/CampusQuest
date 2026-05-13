"use client";

import type { Character } from "@/lib/types";
import { getAccessToken } from "@/lib/client/apiSession";
import { patchAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow, MeStatsRow } from "@/lib/client/profileCharacter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const USERNAME_SYNC_RE = /^[a-z0-9_]{3,24}$/;

function safeUsernameForPatch(username: string): string | undefined {
  const n = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
  if (!USERNAME_SYNC_RE.test(n)) return undefined;
  return n;
}

export function isServerBackedUserId(id: string): boolean {
  return UUID_RE.test(id);
}

let debounceTimer: number | null = null;

function characterToGameStateJson(character: Character): Record<string, unknown> {
  return {
    equippedCosmetics: character.equippedCosmetics ?? {},
    unlockedCosmetics: character.unlockedCosmetics ?? [],
    guildIds: character.guildIds ?? [],
    achievements: character.achievements ?? [],
    finalBossesDefeatedCount: character.finalBossesDefeatedCount ?? 0,
    unlockedSkillNodes: character.unlockedSkillNodes ?? [],
    streakFreezes: character.streakFreezes ?? 0,
    quadAssistScore: character.quadAssistScore ?? 0,
    miniGameTraining: character.miniGameTraining,
    statPrestige: character.statPrestige,
    streakBonusXpByDate: character.streakBonusXpByDate,
    lastSurpriseQuestCompletedDay: character.lastSurpriseQuestCompletedDay,
    surpriseQuestDay: character.surpriseQuestDay,
    completedSpecialQuests: character.completedSpecialQuests ?? [],
    specialQuestProofs: character.specialQuestProofs ?? {},
  };
}

/** Push authoritative gameplay numbers + profile bio + JSON snapshot to Supabase. */
export async function pushCharacterProgressToServer(character: Character): Promise<void> {
  if (typeof window === "undefined") return;
  if (!getAccessToken()) return;
  if (!isServerBackedUserId(character.id)) return;

  const statsBody = {
    totalXp: Math.max(0, Math.floor(character.totalXP)),
    strength: character.stats.strength,
    stamina: character.stats.stamina,
    knowledge: character.stats.knowledge,
    social: character.stats.social,
    focus: character.stats.focus,
    bossesDefeated: Math.max(0, Math.floor(character.bossesDefeatedCount ?? 0)),
  };

  const profileBody: Record<string, unknown> = {
    gameStateJson: characterToGameStateJson(character),
  };

  const displayName = character.name?.trim();
  if (displayName && displayName.length >= 1 && displayName.length <= 60) {
    profileBody.displayName = displayName;
  }
  const userHandle = safeUsernameForPatch(character.username ?? "");
  if (userHandle) profileBody.username = userHandle;

  const av = character.avatar?.trim();
  if (av && av.length >= 2) profileBody.avatarCustomJson = av;

  if (character.classId !== undefined) {
    profileBody.characterClassId = character.classId ?? null;
  }
  if (character.starterWeapon !== undefined) {
    profileBody.starterWeapon = character.starterWeapon ?? null;
  }
  if (character.scholarGuildId !== undefined) {
    const g = character.scholarGuildId;
    profileBody.scholarGuildId = !g || g === "undecided" ? null : g;
  }

  const bioTrim = character.bio?.trim();
  if (bioTrim) profileBody.bio = bioTrim;
  else profileBody.bio = "";

  await Promise.all([
    patchAuthed<MeStatsRow, Record<string, unknown>>("/api/me/stats", statsBody),
    patchAuthed<MeProfileRow, Record<string, unknown>>("/api/me/profile", profileBody),
  ]);
}

/** Debounced sync after local mutations (XP, loot, bio, etc.). */
export function scheduleCharacterSync(character: Character): void {
  if (typeof window === "undefined") return;
  if (!getAccessToken()) return;
  if (!isServerBackedUserId(character.id)) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void pushCharacterProgressToServer(character);
  }, 1400);
}

/** Wait for any pending debounced sync, then push latest character. */
export async function flushGameStateSync(getCharacter: () => Character | null): Promise<void> {
  const c = getCharacter();
  if (!c) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await pushCharacterProgressToServer(c);
}
