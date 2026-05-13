"use client";

import type { Character, CharacterStats, ActivityLog, BossProgress as BossProgressType, CurrentBoss, UserBoss, StatKey } from "./types";
import { STAT_KEYS, MAX_STAT } from "./types";
import { xpToLevel, DAILY_MINIMUM_XP } from "./level";
import { getActivityById, isStudyActivityForBoss } from "./activities";
import { getSampleBosses } from "./bosses";
import { registerCharacter as registerCharacterInFriends, getCharacterById } from "./friendsStore";
import { applyClassStats, type CharacterClassId } from "./characterClasses";
import { pickLootCosmetic, type CosmeticItem } from "./cosmetics";
import { addLootDrop } from "./lootLog";
import { getSpecialQuestById } from "./specialQuests";
import { computeXpBreakdown, type XpBreakdown } from "./xpEngine";
import { contributeCampusBossDamage, clearCampusBossContributors } from "./campusBossEvent";
import { contributeGuildBossDamage, clearGuildBossContributors } from "./guildBossEvent";
import { recordGuildWeeklyRace, getGuildWeeklyXpBoostPercent } from "./guildWeeklyRace";
import { getTodaysSurpriseQuest } from "./surpriseQuests";
import { todayString, yesterdayString } from "./dateUtils";
import {
  ensureMiniGameTrainingRollover,
  streakMultiplierForTraining,
  MINI_GAME_MAX_PLAYS_PER_DAY,
  MINI_GAME_DAILY_QUOTA_BONUS_XP,
  MINI_GAME_WEEK_ALL_FIVE_BONUS_XP,
} from "./miniGameTraining";
import { rollStreakSave } from "./gameBuffs";
import { canUnlockSkill, getSkillNode, availableSkillPoints } from "./skillTree";

/** Called when a character extends their streak (so guilds can add XP). Set by guildStore. */
let onStreakExtended: ((characterId: string) => void) | null = null;
export function registerOnStreakExtended(fn: (characterId: string) => void): void {
  onStreakExtended = fn;
}

const STORAGE_KEY_CHARACTER = "campusquest_character";
const STORAGE_KEY_LOGS = "campusquest_activity_logs";
const STORAGE_KEY_BOSS_PROGRESS = "campusquest_boss_progress";
const STORAGE_KEY_CURRENT_BOSS = "campusquest_current_boss";
const STORAGE_KEY_USER_BOSSES = "campusquest_user_bosses";
const STORAGE_KEY_ACTIVE_BOSS_ID = "campusquest_active_boss_id";

const MAX_USER_BOSSES = 4;
const MIN_BOSS_HP = 250;

// Fallback so "Attack" still works even if `localStorage` is blocked (common on some mobile browsers).
let inMemoryActiveBossId: string | null = null;

/** XP on defeat: 100 at 250 HP, +5 per 10 HP above 250 */
function bossXpReward(maxHp: number): number {
  const hp = Math.max(MIN_BOSS_HP, maxHp);
  return 100 + Math.floor((hp - MIN_BOSS_HP) / 10) * 5;
}

function defaultStats(): CharacterStats {
  return {
    strength: 0,
    stamina: 0,
    knowledge: 0,
    social: 0,
    focus: 0,
  };
}

function loadCharacter(): Character | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CHARACTER);
    if (!raw) return null;
    const data = JSON.parse(raw) as Character;
    data.stats = { ...defaultStats(), ...data.stats };
    data.level = xpToLevel(data.totalXP);
    if (data.streakDays == null) data.streakDays = 0;
    if (data.lastActivityDate == null) data.lastActivityDate = null;
    if (!Array.isArray(data.achievements)) data.achievements = [];
    if (!Array.isArray(data.unlockedCosmetics)) data.unlockedCosmetics = [];
    if (!data.username) data.username = (data.name || "student").toLowerCase().replace(/\s+/g, "_");
    if (data.classId == null) data.classId = undefined;
    if (data.starterWeapon == null) data.starterWeapon = undefined;
    if (!Array.isArray(data.guildIds)) {
      data.guildIds = data.guildId ? [data.guildId] : [];
      data.guildId = undefined;
    }
    if (!Array.isArray(data.unlockedSkillNodes)) data.unlockedSkillNodes = [];
    if (data.streakFreezes == null) data.streakFreezes = 0;
    if (data.equippedCosmetics != null && typeof data.equippedCosmetics !== "object") data.equippedCosmetics = {};
    if (data.quadAssistScore == null) data.quadAssistScore = 0;
  if (!data.scholarGuildId) data.scholarGuildId = "undecided";
    return data;
  } catch {
    return null;
  }
}

function saveCharacter(c: Character): void {
  if (typeof window === "undefined") return;
  c.level = xpToLevel(c.totalXP);
  try {
    localStorage.setItem(STORAGE_KEY_CHARACTER, JSON.stringify(c));
  } catch {
    // Persistence may fail on some mobile browsers (e.g. QuotaExceededError / blocked storage).
  }
  registerCharacterInFriends(c);
  void import("@/lib/client/gameStateSync").then((m) => m.scheduleCharacterSync(c));
}

function loadLogs(): ActivityLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLogs(logs: ActivityLog[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
  } catch {
    // Ignore persistence failure.
  }
}

function localDayBoundsMs(isoDate: string): { start: number; end: number } {
  const [y, mo, d] = isoDate.split("-").map((n) => parseInt(n, 10));
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0).getTime();
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function sumActivityLogXpForDay(characterId: string, day: string): number {
  const { start, end } = localDayBoundsMs(day);
  return loadLogs()
    .filter((l) => l.characterId === characterId && l.createdAt >= start && l.createdAt < end && l.xpEarned != null)
    .reduce((sum, l) => sum + (l.xpEarned ?? 0), 0);
}

function creditStreakBonusXp(c: Character, day: string, amount: number): void {
  if (amount <= 0) return;
  if (!c.streakBonusXpByDate) c.streakBonusXpByDate = {};
  c.streakBonusXpByDate[day] = (c.streakBonusXpByDate[day] ?? 0) + amount;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 21);
  const cutoffStr = todayString(cutoff);
  for (const k of Object.keys(c.streakBonusXpByDate)) {
    if (k < cutoffStr) delete c.streakBonusXpByDate[k];
  }
}

type BossProgressRecord = Record<string, BossProgressType>;

function loadBossProgress(): BossProgressRecord {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BOSS_PROGRESS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveBossProgress(record: BossProgressRecord): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_BOSS_PROGRESS, JSON.stringify(record));
  } catch {
    // Ignore persistence failure.
  }
}

function loadCurrentBoss(): CurrentBoss | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT_BOSS);
    if (!raw) return null;
    return JSON.parse(raw) as CurrentBoss;
  } catch {
    return null;
  }
}

function saveCurrentBoss(boss: CurrentBoss | null): void {
  if (typeof window === "undefined") return;
  if (boss === null) {
    try {
      localStorage.removeItem(STORAGE_KEY_CURRENT_BOSS);
    } catch {
      // Ignore persistence failure.
    }
  } else {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_BOSS, JSON.stringify(boss));
    } catch {
      // Ignore persistence failure.
    }
  }
}

function loadUserBosses(): UserBoss[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_BOSSES);
    if (!raw) return [];
    const list = JSON.parse(raw) as UserBoss[];
    return list.map((b) => ({
      ...b,
      xpReward: b.xpReward ?? bossXpReward(b.maxHp),
    }));
  } catch {
    return [];
  }
}

function saveUserBosses(bosses: UserBoss[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_USER_BOSSES, JSON.stringify(bosses));
  } catch {
    // Ignore persistence failure.
  }
}

function loadActiveBossId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_BOSS_ID);
  } catch {
    return inMemoryActiveBossId;
  }
}

function saveActiveBossId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY_ACTIVE_BOSS_ID);
    else localStorage.setItem(STORAGE_KEY_ACTIVE_BOSS_ID, id);
  } catch {
    inMemoryActiveBossId = id;
  }
}

function applyStatIncrease(
  activityId: string,
  stat: keyof CharacterStats,
  statGain: number,
  minutes: number | undefined,
  c: Character
): void {
  const def = getActivityById(activityId);
  if (def?.usesMinutes && minutes != null && minutes > 0) {
    if (stat === "knowledge") {
      c.stats.knowledge = Math.min(MAX_STAT, (c.stats.knowledge ?? 0) + Math.max(1, Math.floor(minutes / 20)));
    } else if (stat === "focus") {
      c.stats.focus = Math.min(MAX_STAT, (c.stats.focus ?? 0) + Math.max(1, Math.floor(minutes / 25)));
    } else {
      c.stats[stat] = Math.min(MAX_STAT, (c.stats[stat] ?? 0) + statGain);
    }
  } else {
    if (activityId === "gym") {
      c.stats.strength = Math.min(MAX_STAT, (c.stats.strength ?? 0) + 2);
    } else if (stat === "social" && (activityId === "club" || activityId === "group-study")) {
      c.stats.social = Math.min(MAX_STAT, (c.stats.social ?? 0) + 1);
    } else {
      c.stats[stat] = Math.min(MAX_STAT, (c.stats[stat] ?? 0) + statGain);
    }
  }
}

function ensureAchievement(c: Character, id: string): void {
  if (!c.achievements.includes(id)) c.achievements.push(id);
}

/** Total XP today that counts toward the daily streak minimum (activity logs + non-log bonuses). */
export function getTodaysXpForStreak(characterId: string, c: Character, day: string = todayString()): number {
  return sumActivityLogXpForDay(characterId, day) + (c.streakBonusXpByDate?.[day] ?? 0);
}

/** Apply streak extend / break from today's combined XP. Safe to call after any XP change. */
export function updateStreakFromTodaysXp(c: Character, characterId: string, day: string = todayString()): void {
  const todaysXp = getTodaysXpForStreak(characterId, c, day);

  if (todaysXp >= DAILY_MINIMUM_XP) {
    if (c.lastActivityDate !== day) {
      const yesterdayStr = yesterdayString();
      if (c.lastActivityDate === yesterdayStr) {
        c.streakDays += 1;
        onStreakExtended?.(characterId);
      } else {
        c.streakDays = 1;
        onStreakExtended?.(characterId);
      }
      c.lastActivityDate = day;
    }
  } else {
    if (c.lastActivityDate != null) {
      const last = c.lastActivityDate;
      if (day > last) {
        if ((c.streakFreezes ?? 0) > 0) {
          c.streakFreezes = (c.streakFreezes ?? 0) - 1;
          c.lastActivityDate = day;
        } else if (rollStreakSave(c)) {
          c.lastActivityDate = day;
        } else {
          c.streakDays = 0;
        }
      }
    }
  }

  if (c.streakDays >= 7) ensureAchievement(c, "7-Day Streak");
  if (c.streakDays >= 30) ensureAchievement(c, "30-Day Streak");
}

function ensureUnlockedCosmetic(c: Character, cosmeticId: string): void {
  if (!Array.isArray(c.unlockedCosmetics)) c.unlockedCosmetics = [];
  if (!c.unlockedCosmetics.includes(cosmeticId)) c.unlockedCosmetics.push(cosmeticId);
}

export function getCharacter(): Character | null {
  return loadCharacter();
}

/** Sync local character progression from backend snapshot after authenticated rewards. */
export function syncCharacterProgressFromBackend(
  userId: string,
  payload: {
    profile?: { streak_days?: number | null; last_activity_date?: string | null };
    stats?: {
      level?: number | null;
      total_xp?: number | null;
      strength?: number | null;
      stamina?: number | null;
      knowledge?: number | null;
      social?: number | null;
      focus?: number | null;
    };
  }
): Character | null {
  const c = loadCharacter();
  if (!c || c.id !== userId) return null;

  if (payload.stats) {
    if (payload.stats.level != null) c.level = Math.max(1, Number(payload.stats.level));
    if (payload.stats.total_xp != null) c.totalXP = Math.max(0, Number(payload.stats.total_xp));
    if (payload.stats.strength != null) c.stats.strength = Math.max(0, Number(payload.stats.strength));
    if (payload.stats.stamina != null) c.stats.stamina = Math.max(0, Number(payload.stats.stamina));
    if (payload.stats.knowledge != null) c.stats.knowledge = Math.max(0, Number(payload.stats.knowledge));
    if (payload.stats.social != null) c.stats.social = Math.max(0, Number(payload.stats.social));
    if (payload.stats.focus != null) c.stats.focus = Math.max(0, Number(payload.stats.focus));
  }

  if (payload.profile) {
    if (payload.profile.streak_days != null) c.streakDays = Math.max(0, Number(payload.profile.streak_days));
    c.lastActivityDate = payload.profile.last_activity_date ?? c.lastActivityDate ?? null;
  }

  saveCharacter(c);
  return c;
}

/** Persist full character snapshot (used after Supabase profile+stats hydration). */
export function replaceLocalCharacter(character: Character): void {
  saveCharacter(character);
}

/** Remove only the persisted character blob (e.g. different signed-in user). Session/logout should not call this by default. */
export function clearPersistedCharacter(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_CHARACTER);
  } catch {
    // Ignore.
  }
}

/** Clear local boss event contributon caches; does not remove saved character progress. */
export function logout(): void {
  if (typeof window === "undefined") return;
  clearCampusBossContributors();
  clearGuildBossContributors();
}

export interface CreateCharacterOptions {
  username?: string;
  classId?: CharacterClassId;
  starterWeapon?: string;
  scholarGuildId?: string;
}

export function createCharacter(
  name: string,
  avatar: string,
  username?: string,
  options?: CreateCharacterOptions
): Character {
  const existing = loadCharacter();
  if (existing) return existing;

  const id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const un = (options?.username ?? username ?? name ?? "student").trim().toLowerCase().replace(/\s+/g, "_") || "student";
  const baseStats = defaultStats();
  const classId = options?.classId;
  const stats = classId ? applyClassStats(baseStats, classId) : baseStats;

  const character: Character = {
    id,
    name: name.trim() || "Student",
    username: un,
    avatar: avatar || "🎓",
    level: 1,
    totalXP: 0,
    stats,
    streakDays: 0,
    lastActivityDate: null,
    achievements: [],
    unlockedCosmetics: [],
    createdAt: Date.now(),
    classId,
    starterWeapon: options?.starterWeapon,
    unlockedSkillNodes: [],
    streakFreezes: 0,
    quadAssistScore: 0,
    scholarGuildId: options?.scholarGuildId ?? "undecided",
  };
  saveCharacter(character);
  return character;
}

export function updateCharacter(
  updates: Partial<Pick<Character, "name" | "avatar" | "username" | "classId" | "starterWeapon" | "bio" | "scholarGuildId">>
): Character | null {
  const c = loadCharacter();
  if (!c) return null;
  if (updates.name !== undefined) c.name = updates.name.trim() || c.name;
  if (updates.avatar !== undefined) c.avatar = updates.avatar || c.avatar;
  if (updates.username !== undefined) c.username = (updates.username || c.username).toLowerCase().replace(/\s+/g, "_");
  if (updates.classId !== undefined) c.classId = updates.classId;
  if (updates.starterWeapon !== undefined) c.starterWeapon = updates.starterWeapon;
  if (updates.bio !== undefined) c.bio = updates.bio.trim() || undefined;
  if (updates.scholarGuildId !== undefined) c.scholarGuildId = updates.scholarGuildId || "undecided";
  saveCharacter(c);
  return c;
}

const MAX_GUILDS_PER_CHARACTER = 2;

/** Add character to a guild (max 2 guilds). Used by guild store. */
export function addCharacterToGuild(characterId: string, guildId: string): boolean {
  const c = loadCharacter();
  if (!c || c.id !== characterId) return false;
  const ids = c.guildIds ?? [];
  if (ids.includes(guildId)) return true;
  if (ids.length >= MAX_GUILDS_PER_CHARACTER) return false;
  c.guildIds = [...ids, guildId];
  saveCharacter(c);
  return true;
}

/** Remove character from a guild. Used by guild store. */
export function removeCharacterFromGuild(characterId: string, guildId: string): void {
  const c = loadCharacter();
  if (!c || c.id !== characterId) return;
  const ids = c.guildIds ?? [];
  c.guildIds = ids.filter((id) => id !== guildId);
  saveCharacter(c);
}

/** Prestige a stat: set it to 0 and increment its prestige count. Only allowed when stat >= MAX_STAT. */
export function prestigeStat(characterId: string, stat: StatKey): Character | null {
  const c = loadCharacter();
  if (!c || c.id !== characterId) return null;
  const value = c.stats[stat] ?? 0;
  if (value < MAX_STAT) return null;
  c.stats[stat] = 0;
  if (!c.statPrestige) c.statPrestige = {};
  c.statPrestige[stat] = (c.statPrestige[stat] ?? 0) + 1;
  saveCharacter(c);
  return c;
}

/** Claim a special quest (one-time). Requires proof; grants XP and marks quest complete. */
export function completeSpecialQuest(characterId: string, questId: string, proof: string): Character | null {
  const trimmed = typeof proof === "string" ? proof.trim() : "";
  if (!trimmed) return null;
  const c = loadCharacter();
  if (!c || c.id !== characterId) return null;
  const quest = getSpecialQuestById(questId);
  if (!quest) return null;
  const completed = c.completedSpecialQuests ?? [];
  if (completed.includes(questId)) return null;
  const td = todayString();
  c.totalXP += quest.xpReward;
  c.level = xpToLevel(c.totalXP);
  creditStreakBonusXp(c, td, quest.xpReward);
  c.completedSpecialQuests = [...completed, questId];
  if (!c.specialQuestProofs) c.specialQuestProofs = {};
  c.specialQuestProofs[questId] = trimmed;
  updateStreakFromTodaysXp(c, characterId, td);
  saveCharacter(c);
  return c;
}

/** Max minutes allowed per activity log (e.g. 6 hours). */
export const MAX_ACTIVITY_MINUTES = 360;

export interface LogActivityOptions {
  minutes?: number;
  proofUrl?: string;
  tags?: string[];
}

/** Spec: verify_proof — proof must be non-empty (image/link/text evidence). */
function verifyProof(proof: string | undefined): boolean {
  return typeof proof === "string" && proof.trim().length > 0;
}

export interface LogActivityResult {
  character: Character;
  lastBossDrop?: { bossName: string; loot?: CosmeticItem };
  xpBreakdown?: XpBreakdown;
  surpriseBonusXp?: number;
  leveledUp?: boolean;
}

export function logActivity(
  characterId: string,
  activityId: string,
  options?: LogActivityOptions
): LogActivityResult | null {
  const activity = getActivityById(activityId);
  if (!activity) return null;

  if (!verifyProof(options?.proofUrl)) return null;

  const c = loadCharacter();
  if (!c || c.id !== characterId) return null;

  const baseXp = activity.baseXp ?? activity.xp;
  const rawMinutes = options?.minutes;
  const minutes =
    rawMinutes != null
      ? Math.min(MAX_ACTIVITY_MINUTES, Math.max(0, rawMinutes))
      : undefined;

  const guildBoost = getGuildWeeklyXpBoostPercent(c.id);
  const breakdown = computeXpBreakdown({
    character: c,
    activityId,
    baseXp,
    minutes,
    streakDays: c.streakDays,
    guildWeeklyBoostPct: guildBoost,
  });
  let xpEarned = breakdown.finalXp;

  let surpriseBonusXp = 0;
  const today = todayString();
  const surprise = getTodaysSurpriseQuest(characterId);
  if (
    c.lastSurpriseQuestCompletedDay !== today &&
    surprise.matchingActivityIds.includes(activityId)
  ) {
    surpriseBonusXp = surprise.xpReward;
    xpEarned += surpriseBonusXp;
    c.lastSurpriseQuestCompletedDay = today;
  }

  const logs = loadLogs();
  const log: ActivityLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    characterId,
    activityId,
    createdAt: Date.now(),
    minutes,
    proofUrl: options?.proofUrl,
    tags: options?.tags,
    xpEarned,
  };
  logs.push(log);
  saveLogs(logs);

  applyStatIncrease(activityId, activity.stat, activity.statGain, minutes, c);
  c.totalXP += xpEarned;
  const prevLevel = c.level;
  c.level = xpToLevel(c.totalXP);
  const leveledUp = c.level > prevLevel;

  contributeCampusBossDamage(characterId, Math.max(1, Math.floor(xpEarned * 1.15)));
  const guildDmg = Math.max(1, Math.floor(xpEarned * 1.05));
  for (const gid of c.guildIds ?? []) {
    contributeGuildBossDamage(characterId, gid, guildDmg);
  }
  recordGuildWeeklyRace(characterId, c.guildIds ?? [], xpEarned);
  const guildIdsForXp = [...(c.guildIds ?? [])];
  void import("./guildStore").then((m) => {
    for (const gid of guildIdsForXp) {
      m.addGuildXp(gid, Math.max(1, Math.floor(xpEarned / 20)));
    }
  });

  const bossDrop = applyActivityDamageToCurrentBoss(c, activityId, minutes);

  updateStreakFromTodaysXp(c, characterId, today);
  ensureAchievement(c, "First Quest Completed");
  if (leveledUp) ensureAchievement(c, `Reached Level ${c.level}`);

  saveCharacter(c);
  const lastBossDrop =
    bossDrop?.defeatedBossName != null
      ? { bossName: bossDrop.defeatedBossName, loot: bossDrop.droppedLoot ?? undefined }
      : undefined;

  const breakdownOut: XpBreakdown =
    surpriseBonusXp > 0
      ? {
          ...breakdown,
          finalXp: xpEarned,
          lines: [
            ...breakdown.lines,
            { label: `Surprise quest +${surpriseBonusXp} XP`, multiplier: 1, emoji: surprise.icon },
          ],
        }
      : breakdown;

  return { character: c, lastBossDrop, xpBreakdown: breakdownOut, surpriseBonusXp: surpriseBonusXp || undefined, leveledUp };
}

function applyActivityDamageToCurrentBoss(
  c: Character,
  activityId: string,
  minutes: number | undefined
): { droppedLoot: CosmeticItem | null; defeatedBossName: string | null } | undefined {
  const activeId = loadActiveBossId();
  if (!activeId) return undefined;
  const bosses = loadUserBosses();
  const boss = bosses.find((b) => b.id === activeId);
  if (!boss || boss.defeated) return undefined;

  const def = getActivityById(activityId);
  if (!def) return;

  const statKey = def.stat;
  const statVal = (c.stats[statKey] ?? 0) as number;

  // Base damage: scaled by stat and the activity itself.
  let damage = 6 + statVal * 1.25 + def.statGain * 8;

  // Minutes-based boost for focus/knowledge blocks.
  if (def.usesMinutes && minutes != null && minutes > 0) {
    damage += Math.floor(minutes / 10) * 3;
  }

  // Study activities get extra oomph (keeps old gameplay flavor).
  if (isStudyActivityForBoss(activityId)) {
    damage += (c.stats.knowledge ?? 0) * 0.9 + (c.stats.focus ?? 0) * 0.9;
  }

  // Weakness bonus
  if (boss.weaknessStat && boss.weaknessStat === statKey) {
    damage *= 1.6;
  }

  const actualDamage = Math.max(1, Math.floor(damage));
  boss.currentHp = Math.max(0, boss.currentHp - actualDamage);

  if (boss.currentHp <= 0) {
    boss.currentHp = 0;
    boss.defeated = true;
    boss.defeatedAt = Date.now();
    const xp = boss.xpReward ?? bossXpReward(boss.maxHp);
    c.totalXP += xp;
    creditStreakBonusXp(c, todayString(), xp);
    const guildIdsForBossXp = [...(c.guildIds ?? [])];
    if (guildIdsForBossXp.length > 0) {
      void import("./guildStore").then((m) => {
        const amt = Math.max(1, Math.floor(xp / 20));
        for (const gid of guildIdsForBossXp) {
          m.addGuildXp(gid, amt);
        }
      });
    }
    c.level = xpToLevel(c.totalXP);
    ensureAchievement(c, `Defeated ${boss.name} Boss (+${xp} XP)`);
    const isFinalBoss = boss.maxHp > 500;
    const loot = pickLootCosmetic({
      isFinalBoss,
      achievements: c.achievements,
      level: c.level,
      unlockedCosmetics: c.unlockedCosmetics,
    });
    if (loot) {
      boss.loot = [...(boss.loot ?? []), loot.id];
      ensureUnlockedCosmetic(c, loot.id);
      ensureAchievement(c, `Looted: ${loot.icon} ${loot.label}`);
      addLootDrop({
        characterId: c.id,
        cosmeticId: loot.id,
        bossName: boss.name,
        isFinalBoss,
        rarity: loot.rarity,
        obtainedAt: Date.now(),
      });
    } else if (Math.random() < 0.16) {
      c.streakFreezes = (c.streakFreezes ?? 0) + 1;
      ensureAchievement(c, "Earned: Streak Freeze (rare drop)");
    }
    // Remove defeated boss after rewarding XP so it disappears from the list
    const remaining = bosses.filter((b) => b.id !== boss.id);
    saveUserBosses(remaining);
    if (loadActiveBossId() === boss.id) saveActiveBossId(null);
    c.bossesDefeatedCount = (c.bossesDefeatedCount ?? 0) + 1;
    if (boss.maxHp > 500) c.finalBossesDefeatedCount = (c.finalBossesDefeatedCount ?? 0) + 1;
    return { droppedLoot: loot ?? null, defeatedBossName: boss.name };
  }
  saveUserBosses(bosses);
  return undefined;
}

export function getBossProgress(characterId: string): BossProgressType[] {
  const bosses = getSampleBosses();
  const progress = loadBossProgress();
  const key = `${characterId}:`;
  return bosses.map((boss) => {
    const pk = key + boss.id;
    const p = progress[pk];
    if (p) return p;
    return { bossId: boss.id, currentHp: boss.bossHp, defeated: false };
  });
}

/** User-created bosses (custom names). Study damage goes to the active one. */
export function getUserBosses(): UserBoss[] {
  return loadUserBosses();
}

/** The boss currently being attacked (study sessions deal damage to this one). */
export function getActiveBoss(): UserBoss | null {
  const id = loadActiveBossId();
  if (!id) return null;
  return loadUserBosses().find((b) => b.id === id) ?? null;
}

export function getActiveBossId(): string | null {
  return loadActiveBossId();
}

/** Set which boss receives study damage. Pass null to attack none. */
export function setActiveBossId(bossId: string | null): void {
  saveActiveBossId(bossId);
}

/** Add a new boss (custom name + HP + optional weakness). Max 4 bosses; min HP 250. Returns null if at limit. */
export function addUserBoss(name: string, hp: number, setAsActive = true, weaknessStat?: StatKey | null): UserBoss | null {
  const bosses = loadUserBosses();
  if (bosses.length >= MAX_USER_BOSSES) return null;
  const maxHp = Math.max(MIN_BOSS_HP, Math.floor(hp));
  const id = `ub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const xp = bossXpReward(maxHp);
  const weakness: StatKey | undefined =
    weaknessStat != null && STAT_KEYS.includes(weaknessStat)
      ? weaknessStat
      : (STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)] as StatKey);
  const boss: UserBoss = {
    id,
    name: name.trim() || "Boss",
    maxHp,
    currentHp: maxHp,
    defeated: false,
    createdAt: Date.now(),
    xpReward: xp,
    weaknessStat: weakness,
    loot: [],
  };
  bosses.push(boss);
  saveUserBosses(bosses);
  if (setAsActive) saveActiveBossId(id);
  return boss;
}

/** Remove a boss (no XP). Frees a slot. If deleted boss was active, clears active target. */
export function deleteUserBoss(bossId: string): void {
  const bosses = loadUserBosses().filter((b) => b.id !== bossId);
  saveUserBosses(bosses);
  if (loadActiveBossId() === bossId) saveActiveBossId(null);
}

export const MAX_BOSSES = MAX_USER_BOSSES;
export { MIN_BOSS_HP, bossXpReward };

/** Legacy: return active user boss in old shape for any code that still expects it. */
export function getCurrentBoss(): CurrentBoss | null {
  const b = getActiveBoss();
  if (!b) return null;
  return {
    name: b.name,
    hp: b.currentHp,
    maxHp: b.maxHp,
    active: !b.defeated,
    startedAt: b.createdAt,
  };
}

/** Legacy: add a boss and set as active (replaces old single-boss behavior). */
export function startBossBattle(name: string, hp: number): void {
  addUserBoss(name, hp, true);
}

export function getActivityLogs(characterId: string): ActivityLog[] {
  return loadLogs()
    .filter((l) => l.characterId === characterId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getStats(): CharacterStats | null {
  const c = loadCharacter();
  return c?.stats ?? null;
}

export function getLogsByActivity(characterId: string): Record<string, number> {
  const logs = loadLogs().filter((l) => l.characterId === characterId);
  const today = todayString();
  const todayStart = new Date(today).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;
  const count: Record<string, number> = {};
  logs.forEach((l) => {
    if (l.createdAt >= todayStart && l.createdAt < todayEnd) {
      count[l.activityId] = (count[l.activityId] ?? 0) + 1;
    }
  });
  return count;
}

export function getGuildIdsForCharacter(userId: string): string[] {
  const c = loadCharacter();
  if (c && c.id === userId) return [...(c.guildIds ?? [])];
  return [];
}

export function bumpQuadAssistForAuthor(authorId: string): void {
  const c = loadCharacter();
  if (c && c.id === authorId) {
    c.quadAssistScore = (c.quadAssistScore ?? 0) + 1;
    saveCharacter(c);
    return;
  }
  const other = getCharacterById(authorId);
  if (other) {
    other.quadAssistScore = (other.quadAssistScore ?? 0) + 1;
    registerCharacterInFriends(other);
  }
}

export function unlockSkillNode(characterId: string, nodeId: string): Character | null {
  const c = loadCharacter();
  if (!c || c.id !== characterId) return null;
  const nodes = c.unlockedSkillNodes ?? [];
  if (nodes.includes(nodeId)) return null;
  if (!getSkillNode(nodeId)) return null;
  if (!canUnlockSkill(nodes, nodeId)) return null;
  const pts = availableSkillPoints(c.level, nodes.length);
  if (pts < 1) return null;
  c.unlockedSkillNodes = [...nodes, nodeId];
  saveCharacter(c);
  return c;
}

export function setEquippedCosmeticSlot(
  characterId: string,
  slot: "hat" | "glasses" | "backpack",
  cosmeticId: string | null
): Character | null {
  const c = loadCharacter();
  if (!c || c.id !== characterId) return null;
  const u = c.unlockedCosmetics ?? [];
  if (cosmeticId && !u.includes(cosmeticId)) return null;
  const next = { ...(c.equippedCosmetics ?? {}) };
  if (cosmeticId) next[slot] = cosmeticId;
  else delete next[slot];
  c.equippedCosmetics = Object.keys(next).length ? next : undefined;
  saveCharacter(c);
  return c;
}

export interface MiniGameTrainingGrantResult {
  character: Character;
  sessionXp: number;
  extras: { label: string; xp: number }[];
}

/** Award XP from a completed stat mini-game (max 2/day). Applies streak mult, daily quota bonus, weekly all-five bonus; syncs campus/guild. */
export function grantMiniGameTrainingXp(characterId: string, stat: StatKey, baseXp: number): MiniGameTrainingGrantResult | null {
  const c = loadCharacter();
  if (!c || c.id !== characterId) return null;
  ensureMiniGameTrainingRollover(c);
  const m = c.miniGameTraining!;
  if (m.playsUsed >= MINI_GAME_MAX_PLAYS_PER_DAY) return null;

  const mult = streakMultiplierForTraining(m.fullTrainingStreak);
  const sessionXp = Math.max(1, Math.round(baseXp * mult));
  const extras: { label: string; xp: number }[] = [];

  m.playsUsed += 1;
  if (!m.statsTrainedToday.includes(stat)) m.statsTrainedToday.push(stat);
  if (!m.weekStatsTrained.includes(stat)) m.weekStatsTrained.push(stat);

  c.totalXP += sessionXp;
  let totalAdded = sessionXp;

  if (m.playsUsed >= MINI_GAME_MAX_PLAYS_PER_DAY && !m.dailyQuotaBonusClaimed) {
    m.dailyQuotaBonusClaimed = true;
    const bonus = MINI_GAME_DAILY_QUOTA_BONUS_XP;
    c.totalXP += bonus;
    extras.push({ label: "Daily training complete", xp: bonus });
    totalAdded += bonus;

    const td = todayString();
    const yd = yesterdayString();
    if (m.lastFullTrainingDay !== td) {
      if (m.lastFullTrainingDay === yd) m.fullTrainingStreak += 1;
      else m.fullTrainingStreak = 1;
      m.lastFullTrainingDay = td;
    }
  }

  if (STAT_KEYS.every((s) => m.weekStatsTrained.includes(s)) && !m.weekAllFiveBonusClaimed) {
    m.weekAllFiveBonusClaimed = true;
    c.totalXP += MINI_GAME_WEEK_ALL_FIVE_BONUS_XP;
    extras.push({ label: "All stats trained this week", xp: MINI_GAME_WEEK_ALL_FIVE_BONUS_XP });
    totalAdded += MINI_GAME_WEEK_ALL_FIVE_BONUS_XP;
  }

  c.level = xpToLevel(c.totalXP);

  contributeCampusBossDamage(characterId, Math.max(1, Math.floor(totalAdded * 1.15)));
  for (const gid of c.guildIds ?? []) {
    contributeGuildBossDamage(characterId, gid, Math.max(1, Math.floor(totalAdded * 1.05)));
  }
  recordGuildWeeklyRace(characterId, c.guildIds ?? [], totalAdded);
  void import("./guildStore").then((mod) => {
    for (const gid of c.guildIds ?? []) {
      mod.addGuildXp(gid, Math.max(1, Math.floor(totalAdded / 20)));
    }
  });

  const td = todayString();
  creditStreakBonusXp(c, td, totalAdded);
  updateStreakFromTodaysXp(c, characterId, td);
  saveCharacter(c);
  return { character: c, sessionXp, extras };
}

/** Grant XP to a character (e.g. when their post gets vouches). Works for current user or friends. */
export function addXpToCharacter(characterId: string, amount: number): void {
  const td = todayString();
  const current = loadCharacter();
  if (current && current.id === characterId) {
    current.totalXP += amount;
    current.level = xpToLevel(current.totalXP);
    creditStreakBonusXp(current, td, amount);
    updateStreakFromTodaysXp(current, characterId, td);
    saveCharacter(current);
    return;
  }
  const c = getCharacterById(characterId);
  if (c) {
    c.totalXP += amount;
    c.level = xpToLevel(c.totalXP);
    creditStreakBonusXp(c, td, amount);
    updateStreakFromTodaysXp(c, characterId, td);
    registerCharacterInFriends(c);
  }
}
