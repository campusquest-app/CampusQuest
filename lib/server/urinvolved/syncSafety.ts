/**
 * Pure guards for URInvolved sync soft-deactivation.
 * Upstream failures / incomplete catalogs must never wipe stored events.
 */

export type SoftDeactivateDecision = {
  shouldDeactivate: boolean;
  reason:
    | "fetch_failed"
    | "fetch_not_attempted"
    | "successful_catalog"
    | "empty_legitimate_catalog";
};

export function decideSoftDeactivateMissingEvents(input: {
  fetchAttempted: boolean;
  fetchSucceeded: boolean;
  eventsFetched: number;
}): SoftDeactivateDecision {
  if (!input.fetchAttempted) {
    return { shouldDeactivate: false, reason: "fetch_not_attempted" };
  }
  if (!input.fetchSucceeded) {
    return { shouldDeactivate: false, reason: "fetch_failed" };
  }
  if (input.eventsFetched === 0) {
    // Legitimate empty upcoming catalog — safe to hide previously active rows
    // that are no longer returned by the full upcoming search.
    return { shouldDeactivate: true, reason: "empty_legitimate_catalog" };
  }
  return { shouldDeactivate: true, reason: "successful_catalog" };
}

export function idsMissingFromSeen(activeIds: string[], seenIds: string[]): string[] {
  const seen = new Set(seenIds);
  return activeIds.filter((id) => !seen.has(id));
}
