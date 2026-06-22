/** Shared XP leaderboard ordering for Scholars leaderboard (client + server). */

export type XpLeaderboardSortable = {
  userId: string;
  username: string;
  displayName: string;
  level: number;
  totalXp: number;
};

/** Higher return value = should appear earlier (descending XP). */
export function compareXpLeaderboardEntries(a: XpLeaderboardSortable, b: XpLeaderboardSortable): number {
  if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
  if (b.level !== a.level) return b.level - a.level;
  const byDisplay = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  if (byDisplay !== 0) return byDisplay;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

export function sortXpLeaderboardEntries<T extends XpLeaderboardSortable>(entries: T[]): T[] {
  return [...entries].sort(compareXpLeaderboardEntries);
}

export function sortAndRankXpEntries<T extends XpLeaderboardSortable>(entries: T[]): Array<T & { rank: number }> {
  return sortXpLeaderboardEntries(entries).map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Seed / demo scholar rows use `name` + `totalXP`. */
export function compareScholarGuildMemberEntries(
  a: { name: string; totalXP: number; level?: number },
  b: { name: string; totalXP: number; level?: number },
): number {
  if (b.totalXP !== a.totalXP) return b.totalXP - a.totalXP;
  const levelA = a.level ?? 1;
  const levelB = b.level ?? 1;
  if (levelB !== levelA) return levelB - levelA;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
