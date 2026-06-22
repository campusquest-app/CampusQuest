"use client";

import type { Guild, GuildInviteRequest, GuildInterest } from "./types";
import type { Character } from "./types";
import { addCharacterToGuild, removeCharacterFromGuild, registerOnStreakExtended } from "./store";
import { getCharacterById } from "./friendsStore";

const STORAGE_KEY_GUILDS = "campusquest_guilds";
const STORAGE_KEY_GUILD_INVITES = "campusquest_guild_invites";

/** Legacy sample guild ids from removed seed data. */
const LEGACY_SAMPLE_GUILD_IDS = new Set([
  "g-study-1",
  "g-study-2",
  "g-fitness-1",
  "g-fitness-2",
  "g-networking-1",
  "g-networking-2",
  "g-clubs-1",
  "g-clubs-2",
]);

const LEGACY_SAMPLE_GUILD_NAMES = new Set(
  [
    "Library Legends",
    "All-Nighter Squad",
    "Ram Runners",
    "Keaney Fit",
    "Career Quest",
    "LinkedIn Rams",
    "Quad Squad",
    "Campus Crew",
    "Demo Guild",
    "Test Guild",
    "Example Guild",
    "Placeholder Guild",
    "Super Guild",
  ].map((n) => n.toLowerCase()),
);

const PLACEHOLDER_MEMBER_PREFIX = "ph-guild-";

function isPlaceholderMemberId(id: string): boolean {
  return id.startsWith(PLACEHOLDER_MEMBER_PREFIX) || (id.startsWith("ph-") && !id.includes("-"));
}

function isLegacySampleGuild(guild: Guild): boolean {
  if (LEGACY_SAMPLE_GUILD_IDS.has(guild.id)) return true;
  const name = guild.name.trim().toLowerCase();
  if (LEGACY_SAMPLE_GUILD_NAMES.has(name)) return true;
  if (/^(demo|test|example|placeholder)\b/.test(name) && name.includes("guild")) return true;
  if (name.includes("zuc")) return true;
  if (guild.memberIds.length > 0 && guild.memberIds.every(isPlaceholderMemberId)) return true;
  return false;
}

/** Strip seeded/demo guilds and fake placeholder members from persisted data. */
function sanitizeGuilds(guilds: Guild[]): { guilds: Guild[]; changed: boolean } {
  let changed = false;
  const out: Guild[] = [];
  for (const guild of guilds) {
    if (isLegacySampleGuild(guild)) {
      changed = true;
      continue;
    }
    const memberIds = guild.memberIds.filter((id) => !isPlaceholderMemberId(id));
    if (memberIds.length !== guild.memberIds.length) changed = true;
    if (memberIds.length === 0) {
      changed = true;
      continue;
    }
    const cleaned: Guild = {
      ...guild,
      memberIds,
      createdByUserId: isPlaceholderMemberId(guild.createdByUserId) ? memberIds[0] : guild.createdByUserId,
      cofounderUserId:
        guild.cofounderUserId && memberIds.includes(guild.cofounderUserId) ? guild.cofounderUserId : undefined,
    };
    out.push(cleaned);
  }
  return { guilds: out, changed };
}

function loadGuilds(): Guild[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GUILDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Guild[];
    const { guilds, changed } = sanitizeGuilds(Array.isArray(parsed) ? parsed : []);
    if (changed) saveGuilds(guilds);
    applyCofounderInvariantToAll(guilds);
    return guilds;
  } catch {
    localStorage.removeItem(STORAGE_KEY_GUILDS);
    return [];
  }
}

function saveGuilds(guilds: Guild[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_GUILDS, JSON.stringify(guilds));
}

function loadInviteRequests(): GuildInviteRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GUILD_INVITES);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveInviteRequests(requests: GuildInviteRequest[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_GUILD_INVITES, JSON.stringify(requests));
}

export const GUILD_INTEREST_LABELS: Record<GuildInterest, string> = {
  study: "Study",
  fitness: "Fitness",
  networking: "Networking",
  clubs: "Clubs",
};

export const GUILD_INTEREST_ICONS: Record<GuildInterest, string> = {
  study: "📚",
  fitness: "💪",
  networking: "💼",
  clubs: "🌟",
};

export function getGuilds(): Guild[] {
  return loadGuilds();
}

export function getGuildById(id: string): Guild | undefined {
  return loadGuilds().find((g) => g.id === id);
}

export function getRecommendedGuilds(interest?: GuildInterest): Guild[] {
  const guilds = loadGuilds();
  if (interest) return guilds.filter((g) => g.interest === interest).sort((a, b) => b.level - a.level);
  return [...guilds].sort((a, b) => b.level - a.level);
}

export const GUILD_XP_PER_LEVEL = 100;

/**
 * Min 1 (founder), max `MAX_GUILD_MEMBERS`.
 * `MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER`: up to 10 members may join without a co-founder; the 11th requires one.
 */
export const MAX_GUILD_MEMBERS = 100;
export const MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER = 10;

/** @deprecated Use MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER */
export const COFOUNDER_REQUIRED_AT_MEMBERS = MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER;

/** Co-founder is set, is a current member, and is not the founder. */
export function isCofounderValid(guild: Guild): boolean {
  const c = guild.cofounderUserId;
  if (c == null) return false;
  return guild.memberIds.includes(c) && c !== guild.createdByUserId;
}

/**
 * If the guild has more than 10 members but no valid co-founder, assign the first non-founder member.
 * Returns true if the guild object was updated.
 */
export function ensureCofounderWhenOverTenMembers(guild: Guild): boolean {
  if (guild.memberIds.length <= MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER) return false;
  if (isCofounderValid(guild)) return false;
  const founder = guild.createdByUserId;
  const pick = guild.memberIds.find((id) => id !== founder);
  if (pick == null) return false;
  guild.cofounderUserId = pick;
  return true;
}

/** Fix persisted guilds: any with more than 10 members must have a valid co-founder. */
function applyCofounderInvariantToAll(guilds: Guild[]): void {
  if (typeof window === "undefined") return;
  let changed = false;
  for (const g of guilds) {
    if (ensureCofounderWhenOverTenMembers(g)) changed = true;
  }
  if (changed) saveGuilds(guilds);
}

/** True while the guild has 10 members and cannot accept an 11th until a co-founder is set. */
export function guildBlockedForJoinWithoutCofounder(guild: Guild): boolean {
  return guild.memberIds.length >= MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER && !isCofounderValid(guild);
}

function guildLevelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / GUILD_XP_PER_LEVEL);
}

/** Display level from stored `xp` or legacy `level`. */
export function getGuildDisplayLevel(guild: Guild): number {
  return guild.xp != null ? guildLevelFromXp(guild.xp) : guild.level;
}

/** XP toward the next guild level (100 XP per level). */
export function guildXpInCurrentLevel(guild: Guild): { current: number; needed: number; totalXp: number } {
  const totalXp = Math.max(0, guild.xp ?? 0);
  return {
    current: totalXp % GUILD_XP_PER_LEVEL,
    needed: GUILD_XP_PER_LEVEL,
    totalXp,
  };
}

/** Sum boss defeat stats from member characters known in the local roster. */
export function getGuildAggregatedBossKills(guild: Guild): {
  bossesDefeated: number;
  finalBossesDefeated: number;
  membersWithKnownStats: number;
} {
  let bossesDefeated = 0;
  let finalBossesDefeated = 0;
  let membersWithKnownStats = 0;
  for (const id of guild.memberIds) {
    const c = getCharacterById(id);
    if (c) {
      membersWithKnownStats += 1;
      bossesDefeated += c.bossesDefeatedCount ?? 0;
      finalBossesDefeated += c.finalBossesDefeatedCount ?? 0;
    }
  }
  return { bossesDefeated, finalBossesDefeated, membersWithKnownStats };
}

export function createGuild(params: {
  name: string;
  crest: string;
  weeklyQuestGoal: string;
  interest: GuildInterest;
  createdByUserId: string;
}): Guild | null {
  const name = params.name.trim().slice(0, 40);
  if (!name) return null;
  const guilds = loadGuilds();
  const id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const guild: Guild = {
    id,
    name,
    crest: params.crest || "🛡️",
    level: 1,
    xp: 0,
    memberIds: [params.createdByUserId],
    weeklyQuestGoal: params.weeklyQuestGoal.trim().slice(0, 80) || "Complete activities together",
    interest: params.interest,
    createdAt: Date.now(),
    createdByUserId: params.createdByUserId,
  };
  guilds.push(guild);
  saveGuilds(guilds);
  addCharacterToGuild(params.createdByUserId, id);
  return guild;
}

export function joinGuild(characterId: string, guildId: string): boolean {
  const guilds = loadGuilds();
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || guild.memberIds.includes(characterId)) return false;
  if (guild.memberIds.length >= MAX_GUILD_MEMBERS) return false;
  if (guildBlockedForJoinWithoutCofounder(guild)) return false;
  if (!addCharacterToGuild(characterId, guildId)) return false;
  guild.memberIds.push(characterId);
  ensureCofounderWhenOverTenMembers(guild);
  saveGuilds(guilds);
  return true;
}

/** Leave one guild. Cannot leave if you're the last member. Founder/cofounder reassigned when they leave. */
export function leaveGuild(characterId: string, guildId?: string): void {
  const guilds = loadGuilds();
  const targetGuildId = guildId ?? guilds.find((g) => g.memberIds.includes(characterId))?.id;
  if (!targetGuildId) return;
  const guild = guilds.find((g) => g.id === targetGuildId);
  if (!guild || !guild.memberIds.includes(characterId)) return;
  if (guild.memberIds.length <= 1) return;
  const wasFounder = guild.createdByUserId === characterId;
  const wasCofounder = guild.cofounderUserId === characterId;
  guild.memberIds = guild.memberIds.filter((id) => id !== characterId);
  if (wasFounder) {
    guild.createdByUserId = guild.cofounderUserId && guild.memberIds.includes(guild.cofounderUserId)
      ? guild.cofounderUserId
      : guild.memberIds[0];
    if (guild.cofounderUserId === characterId) guild.cofounderUserId = undefined;
  } else if (wasCofounder) {
    guild.cofounderUserId = undefined;
  }
  ensureCofounderWhenOverTenMembers(guild);
  saveGuilds(guilds);
  removeCharacterFromGuild(characterId, targetGuildId);
}

/** Update guild name and/or weekly goal. Only founder or cofounder can update. */
export function updateGuildSettings(
  guildId: string,
  requestedByUserId: string,
  updates: { name?: string; weeklyQuestGoal?: string },
): boolean {
  const guilds = loadGuilds();
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) return false;
  const isFounder = guild.createdByUserId === requestedByUserId;
  const isCofounder = guild.cofounderUserId === requestedByUserId;
  if (!isFounder && !isCofounder) return false;
  if (updates.name !== undefined) {
    const name = updates.name.trim().slice(0, 40);
    if (name) guild.name = name;
  }
  if (updates.weeklyQuestGoal !== undefined) {
    guild.weeklyQuestGoal = updates.weeklyQuestGoal.trim().slice(0, 80) || guild.weeklyQuestGoal;
  }
  saveGuilds(guilds);
  return true;
}

/** Set co-founder. Only the founder can set; cofounder must be a current member and not the founder. */
export function setGuildCofounder(guildId: string, requestedByUserId: string, cofounderUserId: string): boolean {
  const guilds = loadGuilds();
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || guild.createdByUserId !== requestedByUserId) return false;
  if (cofounderUserId === guild.createdByUserId) return false;
  if (!guild.memberIds.includes(cofounderUserId)) return false;
  guild.cofounderUserId = cofounderUserId;
  saveGuilds(guilds);
  return true;
}

/** Delete a guild. Only the creator can delete. */
export function deleteGuild(guildId: string, requestedByUserId: string): boolean {
  const guilds = loadGuilds();
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild || guild.createdByUserId !== requestedByUserId) return false;
  const filtered = guilds.filter((g) => g.id !== guildId);
  saveGuilds(filtered);
  if (guild.memberIds.includes(requestedByUserId)) {
    removeCharacterFromGuild(requestedByUserId, guildId);
  }
  const requests = loadInviteRequests().filter((r) => r.guildId !== guildId);
  saveInviteRequests(requests);
  return true;
}

/** Add XP to a guild (e.g. from member streaks). Updates guild level from xp. */
export function addGuildXp(guildId: string, amount: number): void {
  const guilds = loadGuilds();
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) return;
  guild.xp = (guild.xp ?? 0) + amount;
  guild.level = guildLevelFromXp(guild.xp);
  saveGuilds(guilds);
}

/** Get max guild level among the character's guilds. */
export function getMaxGuildLevelForCharacter(characterId: string): number {
  const guilds = loadGuilds();
  const memberGuilds = guilds.filter((g) => g.memberIds.includes(characterId));
  if (memberGuilds.length === 0) return 0;
  return Math.max(...memberGuilds.map((g) => (g.xp != null ? guildLevelFromXp(g.xp) : g.level)));
}

/** Contribute one day's streak XP to all guilds the character is in. */
export function contributeStreakXpForDay(characterId: string): void {
  const guilds = loadGuilds();
  const memberGuilds = guilds.filter((g) => g.memberIds.includes(characterId));
  const xpPerDay = 5;
  memberGuilds.forEach((g) => addGuildXp(g.id, xpPerDay));
}

export function requestGuildInvite(characterId: string, guildId: string): GuildInviteRequest | null {
  const guild = getGuildById(guildId);
  if (!guild) return null;
  const requests = loadInviteRequests();
  if (requests.some((r) => r.guildId === guildId && r.userId === characterId && r.status === "pending")) return null;
  const req: GuildInviteRequest = {
    id: `gir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guildId,
    userId: characterId,
    status: "pending",
    createdAt: Date.now(),
  };
  requests.push(req);
  saveInviteRequests(requests);
  return req;
}

export function getPendingInviteRequestsForUser(characterId: string): GuildInviteRequest[] {
  return loadInviteRequests().filter((r) => r.userId === characterId && r.status === "pending");
}

export function getPendingInviteRequestsForGuild(guildId: string): GuildInviteRequest[] {
  return loadInviteRequests().filter((r) => r.guildId === guildId && r.status === "pending");
}

export function hasRequestedInvite(characterId: string, guildId: string): boolean {
  return loadInviteRequests().some((r) => r.userId === characterId && r.guildId === guildId && r.status === "pending");
}

registerOnStreakExtended(contributeStreakXpForDay);
