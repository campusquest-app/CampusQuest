"use client";

import type { Character } from "@/lib/types";
import { getAccessToken } from "@/lib/client/apiSession";
import { patchAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow, MeStatsRow } from "@/lib/client/profileCharacter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const USERNAME_SYNC_RE = /^[a-z0-9_]{3,24}$/;

/** Debounced autosave after local mutations (XP, bio, cosmetics, etc.). */
export const USER_STATE_SAVE_DEBOUNCE_MS = 900;

/** Shown when logout is blocked until the latest draft persists to Supabase. */
export const LOGOUT_BLOCKED_SAVE_MESSAGE =
  "We couldn't save your latest changes. Try again before logging out.";

export type UserSaveSyncStatus = "idle" | "saving" | "saved" | "failed";

export type SaveStatusSnapshot = {
  status: UserSaveSyncStatus;
  dirty: boolean;
  lastSavedAt: number | null;
  lastErrorMessage: string | null;
};

function computeSnapshot(): SaveStatusSnapshot {
  return {
    status: saveStatus,
    dirty,
    lastSavedAt,
    lastErrorMessage,
  };
}

let dirty = false;
let saveStatus: UserSaveSyncStatus = "idle";
let lastSavedAt: number | null = null;
let lastErrorMessage: string | null = null;
let savedIdleTimer: number | null = null;

const listeners = new Set<(s: SaveStatusSnapshot) => void>();

function emit(): void {
  const snap = computeSnapshot();
  listeners.forEach((fn) => fn(snap));
}

function clearSavedIdleTimer(): void {
  if (savedIdleTimer != null && typeof window !== "undefined") {
    window.clearTimeout(savedIdleTimer);
    savedIdleTimer = null;
  }
}

function scheduleReturnToIdle(): void {
  clearSavedIdleTimer();
  if (typeof window === "undefined") return;
  savedIdleTimer = window.setTimeout(() => {
    savedIdleTimer = null;
    if (saveStatus === "saved") {
      saveStatus = "idle";
      emit();
    }
  }, 2200);
}

export function getSaveStatusSnapshot(): SaveStatusSnapshot {
  return computeSnapshot();
}

export function subscribeSaveStatus(cb: (s: SaveStatusSnapshot) => void): () => void {
  listeners.add(cb);
  cb(getSaveStatusSnapshot());
  return () => {
    listeners.delete(cb);
  };
}

/** Clear pending debounce/dirty UI after hydrating local character from Supabase (avoid stale “unsaved” from prior session). */
export function resetUserSaveSyncAfterHydrate(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  dirty = false;
  clearSavedIdleTimer();
  saveStatus = "idle";
  lastErrorMessage = null;
  emit();
}

/** True when local gameplay/profile edits may not be persisted yet. */
export function isUserStateDirty(): boolean {
  return dirty || debounceTimer != null;
}

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

/** Builds PATCH bodies for `/api/me/stats` and `/api/me/profile` (test hook + sync core). */
export function buildUserStatePatchBodies(character: Character): {
  stats: Record<string, unknown>;
  profile: Record<string, unknown>;
} {
  const stats = {
    totalXp: Math.max(0, Math.floor(character.totalXP)),
    strength: character.stats.strength,
    stamina: character.stats.stamina,
    knowledge: character.stats.knowledge,
    social: character.stats.social,
    focus: character.stats.focus,
    bossesDefeated: Math.max(0, Math.floor(character.bossesDefeatedCount ?? 0)),
    finalBossesDefeated: Math.max(0, Math.floor(character.finalBossesDefeatedCount ?? 0)),
  };

  const profile: Record<string, unknown> = {
    gameStateJson: characterToGameStateJson(character),
  };

  const displayName = character.name?.trim();
  if (displayName && displayName.length >= 1 && displayName.length <= 60) {
    profile.displayName = displayName;
  }
  const userHandle = safeUsernameForPatch(character.username ?? "");
  if (userHandle) profile.username = userHandle;

  const av = character.avatar?.trim();
  if (av && av.length >= 2) profile.avatarCustomJson = av;

  if (character.classId !== undefined) {
    profile.characterClassId = character.classId ?? null;
  }
  if (character.starterWeapon !== undefined) {
    profile.starterWeapon = character.starterWeapon ?? null;
  }
  if (character.scholarGuildId !== undefined) {
    const g = character.scholarGuildId;
    profile.scholarGuildId = !g || g === "undecided" ? null : g;
  }

  const bioTrim = character.bio?.trim();
  if (bioTrim) profile.bio = bioTrim;
  else profile.bio = "";

  return { stats, profile };
}

let debounceTimer: number | null = null;

/** Serialize PATCH chains so logout flush waits on in-flight autosaves without duplicate races. */
let serializeTail: Promise<void> = Promise.resolve();

function runSerialized(fn: () => Promise<void>): Promise<void> {
  const next = serializeTail.then(fn);
  serializeTail = next.then(
    () => {},
    () => {},
  );
  return next;
}

async function executePush(character: Character): Promise<void> {
  if (typeof window === "undefined") return;
  if (!getAccessToken()) return;
  if (!isServerBackedUserId(character.id)) return;

  clearSavedIdleTimer();
  saveStatus = "saving";
  lastErrorMessage = null;
  emit();

  try {
    const { stats, profile } = buildUserStatePatchBodies(character);
    await Promise.all([
      patchAuthed<MeStatsRow, Record<string, unknown>>("/api/me/stats", stats),
      patchAuthed<MeProfileRow, Record<string, unknown>>("/api/me/profile", profile),
    ]);
    dirty = false;
    saveStatus = "saved";
    lastSavedAt = Date.now();
    lastErrorMessage = null;
    emit();
    scheduleReturnToIdle();
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Could not save to the server.";
    dirty = true;
    saveStatus = "failed";
    lastErrorMessage = msg;
    emit();
    throw e;
  }
}

/** Push authoritative gameplay + profile snapshot to Supabase (serialized). */
export async function pushCharacterProgressToServer(character: Character): Promise<void> {
  return runSerialized(() => executePush(character));
}

/** Debounced sync after local mutations (XP, loot, bio, etc.). */
export function scheduleCharacterSync(character: Character): void {
  if (typeof window === "undefined") return;
  if (!getAccessToken()) return;
  if (!isServerBackedUserId(character.id)) return;

  dirty = true;
  emit();

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void runSerialized(() => executePush(character)).catch(() => {
      /* status + lastErrorMessage already set; UI shows Save failed */
    });
  }, USER_STATE_SAVE_DEBOUNCE_MS);
}

/**
 * Flush pending debounced work, then persist the latest character.
 * Supabase is source of truth — call this before logout. Rejects if the save fails.
 */
export async function flushUserStateToBackend(getCharacter: () => Character | null): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const c = getCharacter();
  if (!c) return;
  if (!getAccessToken()) return;
  if (!isServerBackedUserId(c.id)) return;
  await runSerialized(() => executePush(c));
}

/** @deprecated Use flushUserStateToBackend */
export async function flushGameStateSync(getCharacter: () => Character | null): Promise<void> {
  return flushUserStateToBackend(getCharacter);
}
