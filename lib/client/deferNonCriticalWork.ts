"use client";

/**
 * Run fn after the current task so shell/critical hydration can paint first (Quad feed, leaderboard, notifications).
 */
export function scheduleNonCriticalWork(fn: () => void): number {
  return typeof window !== "undefined" ? window.setTimeout(fn, 0) : 0;
}
