/**
 * Pure guards for URInvolved sync soft-deactivation.
 * Upstream failures / incomplete catalogs must never wipe stored events.
 */

export type SoftDeactivateDecision = {
  shouldDeactivate: boolean;
  preservePreviousInventory: boolean;
  reason:
    | "fetch_failed"
    | "fetch_not_attempted"
    | "malformed_payload"
    | "successful_catalog"
    | "empty_legitimate_catalog"
    | "suspicious_empty_catalog";
};

export function decideSoftDeactivateMissingEvents(input: {
  fetchAttempted: boolean;
  fetchSucceeded: boolean;
  eventsFetched: number;
  existingUpcomingActiveCount: number;
  existingUpcomingStoredCount?: number;
  payloadValid?: boolean;
}): SoftDeactivateDecision {
  if (!input.fetchAttempted) {
    return { shouldDeactivate: false, preservePreviousInventory: true, reason: "fetch_not_attempted" };
  }
  if (input.payloadValid === false) {
    return { shouldDeactivate: false, preservePreviousInventory: true, reason: "malformed_payload" };
  }
  if (!input.fetchSucceeded) {
    return { shouldDeactivate: false, preservePreviousInventory: true, reason: "fetch_failed" };
  }
  if (input.eventsFetched === 0) {
    const storedUpcoming =
      input.existingUpcomingStoredCount ?? input.existingUpcomingActiveCount;
    // Discovery returning [] while future events already exist in inventory
    // (active or previously deactivated) is the same class of failure as the
    // old 24h RSS empty feed. Do not treat that as a legitimate empty campus.
    if (storedUpcoming > 0) {
      return {
        shouldDeactivate: false,
        preservePreviousInventory: true,
        reason: "suspicious_empty_catalog",
      };
    }
    return {
      shouldDeactivate: true,
      preservePreviousInventory: false,
      reason: "empty_legitimate_catalog",
    };
  }
  return { shouldDeactivate: true, preservePreviousInventory: false, reason: "successful_catalog" };
}

export function idsMissingFromSeen(activeIds: string[], seenIds: string[]): string[] {
  const seen = new Set(seenIds);
  return activeIds.filter((id) => !seen.has(id));
}

export function countUpcomingFromActiveRows(
  rows: Array<{ starts_at?: string | null }>,
  nowMs = Date.now(),
  graceMs = 2 * 60 * 60 * 1000,
): number {
  const cutoff = nowMs - graceMs;
  return rows.filter((row) => {
    if (!row.starts_at) return false;
    const t = new Date(row.starts_at).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
}

export function shouldServeStaleInactiveEvents(status: {
  upcomingActiveEventsCount: number;
  lastError: string | null;
  lastSyncImportedCount: number;
}): boolean {
  if (status.upcomingActiveEventsCount > 0) return false;
  if (status.lastError) return true;
  return status.lastSyncImportedCount === 0;
}
