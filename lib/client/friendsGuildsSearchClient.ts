"use client";

import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { GUILD_INTEREST_LABELS, getGuilds } from "@/lib/guildStore";
import type { Guild, GuildInterest } from "@/lib/types";

export type PeopleSearchResult = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  level: number;
  totalXp: number;
  mutualFriendsCount: number;
};

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

const MIN_QUERY_LEN = 2;
const SEARCH_LIMIT = 8;

export function isLiveSearchQueryActive(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LEN;
}

export async function searchPeopleLive(query: string): Promise<PeopleSearchResult[]> {
  const q = query.trim();
  if (!isLiveSearchQueryActive(q)) return [];
  const params = new URLSearchParams({ q, limit: String(SEARCH_LIMIT) });
  const data = await fetchAuthed<{ results: PeopleSearchResult[] }>(`/api/social/people/search?${params}`);
  return data.results ?? [];
}

export async function searchGuildsLive(query: string): Promise<GuildSearchResult[]> {
  const q = query.trim();
  if (!isLiveSearchQueryActive(q)) return [];

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
  if (needle.length < MIN_QUERY_LEN) return [];

  return getGuilds()
    .filter((guild) => guildMatchesQuery(guild, needle))
    .map(localGuildToSearchResult);
}

function guildMatchesQuery(guild: Guild, needle: string): boolean {
  const interestLabel = GUILD_INTEREST_LABELS[guild.interest as GuildInterest] ?? guild.interest;
  const haystack = [
    guild.name,
    interestLabel,
    guild.weeklyQuestGoal,
    guild.interest,
  ]
    .join(" ")
    .toLowerCase();
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

export function avatarFromPeopleSearchResult(row: PeopleSearchResult): string {
  const custom = row.avatarCustomJson?.trim();
  if (custom) return custom;
  const url = row.avatarUrl?.trim();
  if (url) return url;
  return "🎓";
}
