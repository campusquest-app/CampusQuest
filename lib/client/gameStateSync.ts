"use client";

import type { Character } from "@/lib/types";
import { getAccessToken } from "@/lib/client/apiSession";
import { patchAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow } from "@/lib/client/profileCharacter";
import { runLogoutPrepares } from "@/lib/client/logoutPrepare";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function isServerBackedUserId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Character-derived keys stored in `profiles.game_state_json` (equipment, unlocks, streak metadata, etc.). */
export function getCharacterGameStateJson(character: Character): Record<string, unknown> {
  return {
    equippedCosmetics: character.equippedCosmetics ?? {},
    unlockedCosmetics: character.unlockedCosmetics ?? [],
    guildIds: character.guildIds ?? [],
    achievements: character.achievements ?? [],
    featuredAchievementIds: character.featuredAchievementIds ?? [],
    equippedTitleId: character.equippedTitleId ?? null,
    achievementEarnedAt: character.achievementEarnedAt ?? {},
    achievementCelebratedAt: character.achievementCelebratedAt ?? {},
    qrMilestones: character.qrMilestones ?? {},
    eventsAttendedCount: character.eventsAttendedCount ?? 0,
    foundingMember: character.foundingMember ?? false,
    betaTester: character.betaTester ?? false,
    talentPioneer: character.talentPioneer ?? false,
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
    acceptedQuestIds: character.acceptedQuestIds ?? [],
    questBoardClaims: character.questBoardClaims ?? {},
    questChainProgress: character.questChainProgress ?? {},
  };
}

/** Builds PATCH body for `/api/me/profile` gameplay cosmetic sync (never stats/XP). */
export function buildUserStatePatchBodies(character: Character): {
  profile: Record<string, unknown>;
} {
  const profile: Record<string, unknown> = {
    gameStateJson: getCharacterGameStateJson(character),
  };

  const av = character.avatar?.trim();
  if (av && av.length >= 1) profile.avatarCustomJson = av;

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

  return { profile };
}

/** Persist bio only — never sends stats, XP, or full profile object. */
export async function persistBioToServer(bio: string): Promise<MeProfileRow> {
  return patchAuthed<MeProfileRow, { bio: string }>("/api/me/profile", { bio: bio.trim() });
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

/** Best-effort profile PATCH with only avatar (used during logout salvage so avatar persists if the full bundle fails). */
async function persistAvatarLogoutPatch(character: Character | null): Promise<void> {
  if (typeof window === "undefined") return;
  const token = getAccessToken();
  if (!character || !token || !isServerBackedUserId(character.id)) return;

  const av = character.avatar?.trim();
  if (!av || av.length < 1) return;

  await patchAuthed<MeProfileRow, { avatarCustomJson: string }>("/api/me/profile", {
    avatarCustomJson: av,
  });
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
    const { profile } = buildUserStatePatchBodies(character);
    const store = await import("@/lib/store");
    profile.gameStateJson = store.getFullGameStateJsonForServerSync(character);
    await patchAuthed<MeProfileRow, Record<string, unknown>>("/api/me/profile", profile);
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
  await runLogoutPrepares();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  await runSerialized(async () => {
    const c = getCharacter();
    if (!c || !getAccessToken() || !isServerBackedUserId(c.id)) return;

    let fullPushError: unknown;
    try {
      await executePush(c);
    } catch (e) {
      fullPushError = e;
    }

    // Always PATCH avatar alone so DiceBear/custom avatar survives stats/gameState failures during logout flush.
    try {
      await persistAvatarLogoutPatch(getCharacter() ?? c);
    } catch {
      if (!fullPushError) {
        // Full flush already persisted profile stats + avatar; redundant avatar PATCH is best-effort.
      }
      // When fullPush failed, salvage either succeeded (avatar persisted) or not — primary error reflects the bundle failure below.
    }

    if (fullPushError) throw fullPushError;
  });
}

/** @deprecated Use flushUserStateToBackend */
export async function flushGameStateSync(getCharacter: () => Character | null): Promise<void> {
  return flushUserStateToBackend(getCharacter);
}

let pagehideFlushInstalled = false;

/** Flush pending gameplay state when the tab closes or hides (mobile + desktop). */
export function installPagehidePersistenceFlush(getCharacter: () => Character | null): () => void {
  if (typeof window === "undefined" || pagehideFlushInstalled) return () => {};
  pagehideFlushInstalled = true;

  const flush = () => {
    if (!isUserStateDirty()) return;
    void flushUserStateToBackend(getCharacter).catch(() => {
      /* best-effort on unload */
    });
  };

  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);

  return () => {
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("beforeunload", flush);
    pagehideFlushInstalled = false;
  };
}
