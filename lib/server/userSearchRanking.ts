export type UserSearchConnectionStatus = "connected" | "incoming_pending" | "outgoing_pending" | "none";

export function normalizeUserSearchQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/^@/, "").toLowerCase();
}

/** Higher score = better match. Zero means no match. */
export function userSearchMatchScore(query: string, username: string, displayName: string): number {
  const q = normalizeUserSearchQuery(query);
  if (!q) return 0;

  const u = username.toLowerCase();
  const d = displayName.toLowerCase();

  if (u.startsWith(q)) return 100;
  if (d.startsWith(q)) return 90;
  if (u.includes(q)) return 70;
  if (d.includes(q)) return 60;

  return 0;
}

export function resolveUserSearchConnectionStatus(args: {
  userId: string;
  connectedIds: Set<string>;
  incomingIds: Set<string>;
  outgoingIds: Set<string>;
}): UserSearchConnectionStatus {
  if (args.connectedIds.has(args.userId)) return "connected";
  if (args.incomingIds.has(args.userId)) return "incoming_pending";
  if (args.outgoingIds.has(args.userId)) return "outgoing_pending";
  return "none";
}

export function rankUserSearchCandidates<T extends { userId: string; username: string; displayName: string }>(
  query: string,
  rows: T[],
  connectedIds: Set<string>,
  limit: number,
): T[] {
  const scored = rows
    .map((row) => {
      const matchScore = userSearchMatchScore(query, row.username, row.displayName);
      const friendBoost = connectedIds.has(row.userId) ? 10_000 : 0;
      return { row, score: friendBoost + matchScore };
    })
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.row.username.localeCompare(b.row.username, undefined, { sensitivity: "base" });
  });

  return scored.slice(0, limit).map((entry) => entry.row);
}
