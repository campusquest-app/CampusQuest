"use client";

import {
  avatarFromUserSearchResult,
  isUserSearchQueryActive,
  searchUsers,
  USER_SEARCH_DEBOUNCE_MS,
  USER_SEARCH_LIMIT,
  USER_SEARCH_MIN_LEN,
  type UserSearchResult,
} from "@/lib/client/userSearchClient";

export type {
  UserSearchConnectionStatus,
  UserSearchResult,
} from "@/lib/client/userSearchClient";

export {
  USER_SEARCH_MIN_LEN,
  USER_SEARCH_DEBOUNCE_MS,
  USER_SEARCH_LIMIT,
  avatarFromUserSearchResult,
  isUserSearchQueryActive,
  searchUsers,
  userSearchConnectionLabel,
} from "@/lib/client/userSearchClient";

/** @deprecated Use UserSearchResult */
export type PeopleSearchResult = UserSearchResult;

export const MIN_QUERY_LEN = USER_SEARCH_MIN_LEN;
export const DEBOUNCE_MS = USER_SEARCH_DEBOUNCE_MS;
const SEARCH_LIMIT = USER_SEARCH_LIMIT;

export function isLiveSearchQueryActive(query: string): boolean {
  return isUserSearchQueryActive(query);
}

export async function searchPeopleLive(query: string): Promise<UserSearchResult[]> {
  return searchUsers(query, SEARCH_LIMIT);
}

export function avatarFromPeopleSearchResult(row: UserSearchResult): string {
  return avatarFromUserSearchResult(row);
}

// Guild search remains in this module.
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { GUILD_INTEREST_LABELS, getGuilds } from "@/lib/guildStore";
import type { Guild, GuildInterest } from "@/lib/types";

export type GuildSearchResult = {
  guildId: string;
  name: string;
  description: string;
  categoryLabel: string | null;
  memberCount: number;
  level: number;
  totalXp: number;
  logoUrl: string | null;
  crest: string | null;
  source: "supabase" | "local";
};

export async function searchGuildsLive(query: string): Promise<GuildSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({ q, limit: String(SEARCH_LIMIT) });
  let remote: GuildSearchResult[] = [];
  try {
    const data = await fetchAuthed<{ results: Omit<GuildSearchResult, "crest" | "source">[] }>(
      `/api/guilds/search?${params}`,
    );
    remote = (data.results ?? []).map((row) => ({
      ...row,
      crest: null,
      source: "supabase" as const,
    }));
  } catch {
    remote = [];
  }

  const local = filterLocalGuilds(q);
  return mergeGuildSearchResults(remote, local).slice(0, SEARCH_LIMIT);
}

function filterLocalGuilds(query: string): GuildSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  return getGuilds()
    .filter((guild) => guildMatchesQuery(guild, needle))
    .map(localGuildToSearchResult);
}

function guildMatchesQuery(guild: Guild, needle: string): boolean {
  const interestLabel = GUILD_INTEREST_LABELS[guild.interest as GuildInterest] ?? guild.interest;
  const haystack = [guild.name, interestLabel, guild.weeklyQuestGoal, guild.interest].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function localGuildToSearchResult(guild: Guild): GuildSearchResult {
  return {
    guildId: guild.id,
    name: guild.name,
    description: guild.weeklyQuestGoal,
    categoryLabel: GUILD_INTEREST_LABELS[guild.interest as GuildInterest] ?? null,
    memberCount: guild.memberIds.length,
    level: guild.level,
    totalXp: guild.xp ?? guild.level * 100,
    logoUrl: null,
    crest: guild.crest,
    source: "local",
  };
}

function mergeGuildSearchResults(
  remote: GuildSearchResult[],
  local: GuildSearchResult[],
): GuildSearchResult[] {
  const seen = new Set<string>();
  const merged: GuildSearchResult[] = [];

  for (const row of [...remote, ...local]) {
    const key = row.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  return merged;
}

export async function joinGuildRemote(guildId: string): Promise<void> {
  await postAuthed<{ joined: boolean; guildId: string }, { guildId: string }>("/api/guilds/join", {
    guildId,
  });
}
