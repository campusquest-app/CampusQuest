import type { RealmDirectionsSummary } from "@/lib/realm/realmDirectionsTypes";

/** Rough footstep estimate — only for optional display, never as primary metric. */
export function estimateFootsteps(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  return Math.round(distanceMeters / 0.78);
}

/** "7:42 PM" arrival label from route duration. */
export function formatArrivalTime(durationSeconds: number, now: Date = new Date()): string {
  const arrival = new Date(now.getTime() + durationSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(arrival);
}

/**
 * Primary route stats line for UI.
 * Examples: "7 min • 0.4 mi" or "7 min • 0.4 mi • 9 turns"
 * Never uses "steps" — turn count is maneuver segments from Directions API.
 */
export function formatRouteStatsLine(summary: Pick<
  RealmDirectionsSummary,
  "durationText" | "distanceText" | "turnCount"
>): string {
  const parts = [summary.durationText, summary.distanceText];
  if (summary.turnCount != null && summary.turnCount > 0) {
    parts.push(`${summary.turnCount} turn${summary.turnCount === 1 ? "" : "s"}`);
  }
  return parts.join(" • ");
}

/** Optional secondary line with footstep estimate (never primary). */
export function formatFootstepsLine(distanceMeters: number): string | null {
  const steps = estimateFootsteps(distanceMeters);
  if (steps <= 0) return null;
  return `~${steps.toLocaleString()} footsteps`;
}
