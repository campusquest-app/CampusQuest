"use client";

const WEEKLY_KEY = "campusquest_guild_weekly_v1";
const BOOST_KEY = "campusquest_guild_xp_boost_members";
const GUILDS_KEY = "campusquest_guilds";

function isoMondayWeekKey(d = new Date()): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

interface WeeklyState {
  weekKey: string;
  scores: Record<string, number>;
}

function loadWeeklyState(): WeeklyState {
  if (typeof window === "undefined") return { weekKey: isoMondayWeekKey(), scores: {} };
  try {
    const raw = localStorage.getItem(WEEKLY_KEY);
    if (!raw) return { weekKey: isoMondayWeekKey(), scores: {} };
    const s = JSON.parse(raw) as WeeklyState;
    if (!s.scores) s.scores = {};
    return s;
  } catch {
    return { weekKey: isoMondayWeekKey(), scores: {} };
  }
}

function saveWeeklyState(s: WeeklyState): void {
  try {
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function resolvePreviousWeekWinner(scores: Record<string, number>): void {
  const entries = Object.entries(scores);
  if (entries.length === 0) return;
  entries.sort((a, b) => b[1] - a[1]);
  const winnerGuildId = entries[0][0];
  try {
    const raw = localStorage.getItem(GUILDS_KEY);
    if (!raw) return;
    const guilds = JSON.parse(raw) as { id: string; memberIds: string[] }[];
    const g = guilds.find((x) => x.id === winnerGuildId);
    if (g?.memberIds?.length) {
      localStorage.setItem(BOOST_KEY, JSON.stringify(g.memberIds));
    }
  } catch {
    // ignore
  }
}

/** After each activity log — guild weekly race + Monday rollover (winner's members get +10% XP next week). */
export function recordGuildWeeklyRace(characterId: string, guildIds: string[], xpEarned: number): void {
  if (typeof window === "undefined" || !guildIds.length) return;
  void characterId;
  const wk = isoMondayWeekKey();
  let state = loadWeeklyState();
  if (state.weekKey !== wk) {
    resolvePreviousWeekWinner(state.scores);
    state = { weekKey: wk, scores: {} };
  }
  const pts = Math.max(1, Math.floor(xpEarned / 5));
  for (const gid of guildIds) {
    state.scores[gid] = (state.scores[gid] ?? 0) + pts;
  }
  saveWeeklyState(state);
}

export function getGuildWeeklyXpBoostPercent(characterId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const arr = JSON.parse(localStorage.getItem(BOOST_KEY) || "[]") as string[];
    return Array.isArray(arr) && arr.includes(characterId) ? 10 : 0;
  } catch {
    return 0;
  }
}

export function getGuildWeeklyScores(): { guildId: string; score: number }[] {
  const state = loadWeeklyState();
  const activeGuildIds = new Set<string>();
  try {
    const raw = localStorage.getItem(GUILDS_KEY);
    if (raw) {
      const guilds = JSON.parse(raw) as { id: string }[];
      for (const guild of guilds) activeGuildIds.add(guild.id);
    }
  } catch {
    // ignore
  }

  return Object.entries(state.scores)
    .filter(([guildId]) => activeGuildIds.has(guildId))
    .map(([guildId, score]) => ({ guildId, score }))
    .sort((a, b) => b.score - a.score);
}
