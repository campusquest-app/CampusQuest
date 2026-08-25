/**
 * Helpers for recommendation popularity counts and offline/unit debug formatting.
 * Score-breakdown strings must never be rendered in student-facing UI.
 */

import type { RecommendationScore } from "@/lib/recommendations/types";

export function publicPopularityCount<T extends { userId?: string | null }>(
  rows: T[],
  excludedUserIds: Iterable<string>,
): number {
  const excluded = excludedUserIds instanceof Set ? excludedUserIds : new Set(excludedUserIds);
  let count = 0;
  for (const row of rows) {
    const id = row.userId;
    if (!id || excluded.has(id)) continue;
    count += 1;
  }
  return count;
}

/** Policy helper for tests / future admin tools. Client profiles always ship includeDebug: false. */
export function shouldExposeRecommendationDebug(args: {
  isAdmin: boolean;
  isInternalTester?: boolean;
}): boolean {
  return args.isAdmin === true || args.isInternalTester === true;
}

/** Formats an internal score breakdown. Returns null unless score.debug was explicitly attached. */
export function formatRecommendationDebugLine(score: RecommendationScore): string | null {
  if (!score.debug) return null;
  return [
    `score ${score.score.toFixed(1)}`,
    `interests ${score.matchedInterests.join(",") || "—"}`,
    `communities ${score.matchedCommunities.join(",") || "—"}`,
    `featured ${score.debug.campusImportance}`,
    `behavior ${score.debug.inferredAffinity.toFixed(2)}`,
    `time ${score.debug.timeRelevance.toFixed(2)}`,
  ].join(" · ");
}
