"use client";

import type { Guild, GuildInviteRequest, GuildInterest } from "./types";
import type { Character, CharacterStats } from "./types";
import { addCharacterToGuild, removeCharacterFromGuild, registerOnStreakExtended } from "./store";
import { registerCharacter, getCharacterById } from "./friendsStore";

const STORAGE_KEY_GUILDS = "campusquest_guilds";
const STORAGE_KEY_GUILD_INVITES = "campusquest_guild_invites";

const PLACEHOLDER_STATS: CharacterStats = { strength: 0, stamina: 0, knowledge: 0, social: 0, focus: 0 };

/** Pool of placeholder students for guild member lists. Names/avatars for display. */
const PLACEHOLDER_STUDENTS: { name: string; username: string; avatar: string }[] = [
  { name: "Alex Rivera", username: "alex_rivera", avatar: "📚" },
  { name: "Jordan Kim", username: "jordan_kim", avatar: "🎓" },
  { name: "Sam Chen", username: "sam_chen", avatar: "💪" },
  { name: "Riley Morgan", username: "riley_morgan", avatar: "☕" },
  { name: "Casey Lee", username: "casey_lee", avatar: "🦌" },
  { name: "Quinn Taylor", username: "quinn_taylor", avatar: "📖" },
  { name: "Avery Jones", username: "avery_jones", avatar: "🏃" },
  { name: "Morgan Blake", username: "morgan_blake", avatar: "💼" },
  { name: "Drew Patel", username: "drew_patel", avatar: "🎸" },
  { name: "Jamie Foster", username: "jamie_foster", avatar: "🌟" },
  { name: "Skyler Hayes", username: "skyler_hayes", avatar: "📝" },
  { name: "Cameron Ross", username: "cameron_ross", avatar: "🔬" },
  { name: "Reese Collins", username: "reese_collins", avatar: "⚡" },
  { name: "Parker Wright", username: "parker_wright", avatar: "🎯" },
  { name: "Blake Martinez", username: "blake_martinez", avatar: "🛡️" },
  { name: "Taylor Brooks", username: "taylor_brooks", avatar: "📱" },
  { name: "Jordan Phillips", username: "jordan_phillips", avatar: "🏋️" },
  { name: "Casey Nguyen", username: "casey_nguyen", avatar: "🎨" },
  { name: "Riley Cooper", username: "riley_cooper", avatar: "☕" },
  { name: "Avery Reed", username: "avery_reed", avatar: "📚" },
  { name: "Quinn Sullivan", username: "quinn_sullivan", avatar: "💻" },
  { name: "Morgan Griffin", username: "morgan_griffin", avatar: "🦉" },
  { name: "Drew Hayes", username: "drew_hayes", avatar: "🌟" },
  { name: "Jamie Flores", username: "jamie_flores", avatar: "🎭" },
  { name: "Skyler Bennett", username: "skyler_bennett", avatar: "📊" },
  { name: "Cameron Price", username: "cameron_price", avatar: "🔑" },
  { name: "Reese Simmons", username: "reese_simmons", avatar: "📖" },
  { name: "Parker Bryant", username: "parker_bryant", avatar: "🏆" },
  { name: "Blake Alexander", username: "blake_alexander", avatar: "🎪" },
  { name: "Taylor Russell", username: "taylor_russell", avatar: "🛡️" },
  { name: "Jordan West", username: "jordan_west", avatar: "⚔️" },
  { name: "Casey Jordan", username: "casey_jordan", avatar: "📚" },
  { name: "Riley Morgan", username: "riley_m2", avatar: "🎯" },
  { name: "Avery Clark", username: "avery_clark", avatar: "🌟" },
  { name: "Quinn Lewis", username: "quinn_lewis", avatar: "💡" },
  { name: "Morgan Walker", username: "morgan_walker", avatar: "🔬" },
  { name: "Drew Hall", username: "drew_hall", avatar: "📝" },
  { name: "Jamie Young", username: "jamie_young", avatar: "🎓" },
  { name: "Skyler King", username: "skyler_king", avatar: "🦌" },
  { name: "Cameron Scott", username: "cameron_scott", avatar: "☕" },
];

const SAMPLE_GUILD_TEMPLATES: Omit<Guild, "memberIds" | "createdByUserId" | "cofounderUserId">[] = [
  { id: "g-study-1", name: "Library Legends", crest: "📚", level: 4, weeklyQuestGoal: "Log 20 study sessions as a guild", interest: "study", createdAt: Date.now() - 86400000 * 14, xp: 300 },
  { id: "g-study-2", name: "All-Nighter Squad", crest: "☕", level: 2, weeklyQuestGoal: "10 group study activities", interest: "study", createdAt: Date.now() - 86400000 * 7, xp: 50 },
  { id: "g-fitness-1", name: "Ram Runners", crest: "🦌", level: 5, weeklyQuestGoal: "30 gym or run logs combined", interest: "fitness", createdAt: Date.now() - 86400000 * 21, xp: 450 },
  { id: "g-fitness-2", name: "Keaney Fit", crest: "💪", level: 3, weeklyQuestGoal: "Every member logs 1 workout", interest: "fitness", createdAt: Date.now() - 86400000 * 10, xp: 150 },
  { id: "g-networking-1", name: "Career Quest", crest: "💼", level: 3, weeklyQuestGoal: "Attend 1 career event (any member)", interest: "networking", createdAt: Date.now() - 86400000 * 5, xp: 120 },
  { id: "g-networking-2", name: "LinkedIn Rams", crest: "🔗", level: 2, weeklyQuestGoal: "5 networking activities", interest: "networking", createdAt: Date.now() - 86400000 * 3, xp: 80 },
  { id: "g-clubs-1", name: "Quad Squad", crest: "🎸", level: 6, weeklyQuestGoal: "12 club or social activities", interest: "clubs", createdAt: Date.now() - 86400000 * 30, xp: 550 },
  { id: "g-clubs-2", name: "Campus Crew", crest: "🌟", level: 4, weeklyQuestGoal: "Everyone posts 1 post", interest: "clubs", createdAt: Date.now() - 86400000 * 12, xp: 320 },
];

const PLACEHOLDER_ID_PREFIX = "ph-guild-";

/**
 * Min 1 (founder), max `MAX_GUILD_MEMBERS`.
 * `MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER`: up to 10 members may join without a co-founder; the 11th requires one.
 * Every guild with **more than 10** members always has a co-founder (enforced on load, join, and leave).
 */
export const MAX_GUILD_MEMBERS = 100;
export const MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER = 10;

/** Sample guilds only: small roster for UI (capped by placeholder student pool). */
const SAMPLE_PLACEHOLDER_MEMBER_SPAN = 15;

/** Deterministic "random" count for sample guild placeholders — not tied to `MAX_GUILD_MEMBERS`. */
function placeholderMemberCount(guildId: string): number {
  let h = 0;
  for (let i = 0; i < guildId.length; i++) h = (h * 31 + guildId.charCodeAt(i)) >>> 0;
  return (h % SAMPLE_PLACEHOLDER_MEMBER_SPAN) + 1;
}

/** Deterministic shuffle of indices [0..n-1] seeded by guild id. */
function shuffledIndicesForGuild(guildId: string, n: number): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  let seed = 0;
  for (let i = 0; i < guildId.length; i++) seed = (seed * 31 + guildId.charCodeAt(i)) >>> 0;
  for (let i = indices.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function buildPlaceholderCharacter(index: number): Character {
  const s = PLACEHOLDER_STUDENTS[index % PLACEHOLDER_STUDENTS.length];
  const level = (index % 5) + 1;
  return {
    id: `${PLACEHOLDER_ID_PREFIX}${index}`,
    name: s.name,
    username: `${s.username}_${index}`,
    avatar: s.avatar,
    level,
    totalXP: level * 50,
    stats: PLACEHOLDER_STATS,
    streakDays: 0,
    lastActivityDate: null,
    achievements: [],
    createdAt: Date.now() - 86400000 * 30,
  };
}

/** Get placeholder member ids for a guild (same deterministic list as generateSampleGuilds). */
function getPlaceholderMemberIdsForGuild(guildId: string): string[] {
  const poolSize = PLACEHOLDER_STUDENTS.length;
  const count = placeholderMemberCount(guildId);
  const shuffled = shuffledIndicesForGuild(guildId, poolSize);
  return shuffled.slice(0, count).map((i) => `${PLACEHOLDER_ID_PREFIX}${i}`);
}

function generateSampleGuilds(): Guild[] {
  const poolSize = PLACEHOLDER_STUDENTS.length;
  const indicesByGuild = SAMPLE_GUILD_TEMPLATES.map((t) => {
    const count = placeholderMemberCount(t.id);
    const shuffled = shuffledIndicesForGuild(t.id, poolSize);
    return shuffled.slice(0, count);
  });
  const usedIndices = new Set<number>();
  indicesByGuild.forEach((indices) => indices.forEach((i) => usedIndices.add(i)));
  usedIndices.forEach((i) => registerCharacter(buildPlaceholderCharacter(i)));

  return SAMPLE_GUILD_TEMPLATES.map((t, guildIndex) => {
    const indices = indicesByGuild[guildIndex];
    const memberIds = indices.map((i) => `${PLACEHOLDER_ID_PREFIX}${i}`);
    const createdByUserId = memberIds[0];
    const cofounderUserId =
      memberIds.length > MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER ? memberIds[1] : undefined;
    return {
      ...t,
      memberIds,
      createdByUserId,
      cofounderUserId,
    };
  });
}

/** Fill sample guilds with placeholder members: empty, old-format ph-*, or missing ph-guild-* ids. */
function migratePlaceholderMemberIds(guilds: Guild[]): { guilds: Guild[]; changed: boolean } {
  const templateIds = new Set(SAMPLE_GUILD_TEMPLATES.map((t) => t.id));
  let changed = false;
  const out = guilds.map((g) => {
    if (!templateIds.has(g.id)) return g;
    const isEmpty = g.memberIds.length === 0;
    const isOldPlaceholder = g.memberIds.length > 0 && g.memberIds.every((id) => id.startsWith("ph-") && !id.startsWith(PLACEHOLDER_ID_PREFIX));
    const hasNoNewPlaceholders = g.memberIds.length > 0 && !g.memberIds.some((id) => id.startsWith(PLACEHOLDER_ID_PREFIX));
    const shouldFill = isEmpty || isOldPlaceholder || hasNoNewPlaceholders;
    if (!shouldFill) return g;
    const memberIds = getPlaceholderMemberIdsForGuild(g.id);
    changed = true;
    return {
      ...g,
      memberIds,
      createdByUserId: memberIds[0],
      cofounderUserId:
        memberIds.length > MAX_GUILD_MEMBERS_WITHOUT_COFOUNDER ? memberIds[1] : undefined,
    };
  });
  return { guilds: out, changed };
}

/** Register any ph-guild-* member that isn't in the character store so ViewGuild shows names/avatars. */
function ensurePlaceholderMembersRegistered(guilds: Guild[]): void {
  for (const g of guilds) {
    for (const id of g.memberIds) {
      if (!id.startsWith(PLACEHOLDER_ID_PREFIX)) continue;
      const indexStr = id.slice(PLACEHOLDER_ID_PREFIX.length);
      const index = parseInt(indexStr, 10);
      if (!Number.isNaN(index) && getCharacterById(id) === null) {
        registerCharacter(buildPlaceholderCharacter(index));
      }
    }
  }
}

function loadGuilds(): Guild[] {
  if (typeof window === "undefined") return generateSampleGuilds();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GUILDS);
    let guilds: Guild[];
    if (!raw) {
      guilds = generateSampleGuilds();
      saveGuilds(guilds);
    } else {
      guilds = JSON.parse(raw);
      const { guilds: migrated, changed } = migratePlaceholderMemberIds(guilds);
      guilds = migrated;
      if (changed) saveGuilds(guilds);
      const nameLower = (g: Guild) => g.name.trim().toLowerCase();
      const toRemove = guilds.filter((g) => {
        const n = nameLower(g);
        return n === "super guild" || n.includes("zuc");
      });
      guilds = guilds.filter((g) => !toRemove.includes(g));
      for (const g of toRemove) {
        for (const memberId of g.memberIds) removeCharacterFromGuild(memberId, g.id);
      }
      if (toRemove.length > 0) saveGuilds(guilds);
      ensurePlaceholderMembersRegistered(guilds);
    }
    applyCofounderInvariantToAll(guilds);
    return guilds;
  } catch {
    const guilds = generateSampleGuilds();
    saveGuilds(guilds);
    return guilds;
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

/** Sum boss defeat stats from member characters known in the local roster (friends + placeholders + you). */
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
  updates: { name?: string; weeklyQuestGoal?: string }
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

/** Set co-founder. Only the founder can set; cofounder must be a current member and not the founder. Required once the guild has more than 10 members. */
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

/** Delete a guild. Only the creator can delete. Removes the guild and updates current user's guild list if they were a member. Returns true if deleted. */
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

/** Contribute one day's streak XP to all guilds the character is in. Call when the user extends their streak (e.g. after logActivity). */
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
