/**
 * Pure guards for provider sync soft-deactivation.
 * Upstream failures / incomplete catalogs / zero successful imports
 * must never wipe stored events for that provider.
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
    | "suspicious_empty_catalog"
    | "suspicious_partial_catalog"
    | "zero_successful_imports"
    | "excessive_missing_ratio";
};

/** Absolute floor: never treat fewer than this many fetched rows as a full catalog when inventory exists. */
export const MIN_FETCHED_FOR_DEACTIVATE = 25;

/** Fetched catalog must be at least this fraction of existing upcoming-active inventory. */
export const MIN_FETCH_TO_INVENTORY_RATIO = 0.4;

/** Never deactivate more than this fraction of active rows in one sync. */
export const MAX_MISSING_DEACTIVATE_RATIO = 0.5;

export function decideSoftDeactivateMissingEvents(input: {
  fetchAttempted: boolean;
  fetchSucceeded: boolean;
  eventsFetched: number;
  existingUpcomingActiveCount: number;
  existingUpcomingStoredCount?: number;
  /** Total active rows for this source (any start time). */
  existingActiveCount?: number;
  payloadValid?: boolean;
  /** Rows successfully upserted this run (created + updated). */
  successfulImports?: number;
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
    const activeCount = input.existingActiveCount ?? input.existingUpcomingActiveCount;
    // Discovery returning [] while any inventory remains is not a safe purge signal.
    if (storedUpcoming > 0 || activeCount > 0) {
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

  const successfulImports = input.successfulImports ?? input.eventsFetched;
  // Critical: fetch can succeed while every upsert fails (e.g. ON CONFLICT / schema drift).
  // seenEventIds stays empty → every active row looks "missing" → full inventory wipe.
  if (successfulImports <= 0) {
    return {
      shouldDeactivate: false,
      preservePreviousInventory: true,
      reason: "zero_successful_imports",
    };
  }

  const existingUpcoming = input.existingUpcomingActiveCount;
  if (existingUpcoming > 0) {
    let minRequired = Math.ceil(existingUpcoming * MIN_FETCH_TO_INVENTORY_RATIO);
    // Absolute floor only when inventory is already large (avoids blocking small campuses).
    if (existingUpcoming >= MIN_FETCHED_FOR_DEACTIVATE) {
      minRequired = Math.max(MIN_FETCHED_FOR_DEACTIVATE, minRequired);
    }
    if (input.eventsFetched < minRequired || successfulImports < minRequired) {
      return {
        shouldDeactivate: false,
        preservePreviousInventory: true,
        reason: "suspicious_partial_catalog",
      };
    }
  }

  return { shouldDeactivate: true, preservePreviousInventory: false, reason: "successful_catalog" };
}

/**
 * Second gate after computing missing IDs: refuse mass wipe even if catalog looked OK.
 */
export function filterSafeDeactivationIds(input: {
  missingIds: string[];
  activeCount: number;
  maxMissingRatio?: number;
}): { ids: string[]; blocked: boolean; reason: SoftDeactivateDecision["reason"] | null } {
  const ratio = input.maxMissingRatio ?? MAX_MISSING_DEACTIVATE_RATIO;
  if (input.activeCount <= 0 || input.missingIds.length === 0) {
    return { ids: input.missingIds, blocked: false, reason: null };
  }
  if (input.missingIds.length / input.activeCount > ratio) {
    return { ids: [], blocked: true, reason: "excessive_missing_ratio" };
  }
  return { ids: input.missingIds, blocked: false, reason: null };
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
