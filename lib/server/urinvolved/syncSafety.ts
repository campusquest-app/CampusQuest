/**
 * Pure guards for provider sync soft-deactivation.
 * Upstream failures / incomplete catalogs / zero successful imports
 * must never wipe stored events for that provider.
 */

export type SoftDeactivateReason =
  | "fetch_failed"
  | "fetch_not_attempted"
  | "malformed_payload"
  | "validation_failed"
  | "successful_catalog"
  | "empty_legitimate_catalog"
  | "suspicious_empty_catalog"
  | "suspicious_partial_catalog"
  | "suspicious_inventory_drop"
  | "zero_successful_imports"
  | "excessive_missing_ratio";

export type SoftDeactivateDecision = {
  shouldDeactivate: boolean;
  preservePreviousInventory: boolean;
  reason: SoftDeactivateReason;
};

/** Absolute floor: never treat fewer than this many fetched rows as a full catalog when inventory exists. */
export const MIN_FETCHED_FOR_DEACTIVATE = 25;

/** Fetched catalog must be at least this fraction of existing upcoming-active inventory. */
export const MIN_FETCH_TO_INVENTORY_RATIO = 0.4;

/** Never deactivate more than this fraction of active rows in one sync. */
export const MAX_MISSING_DEACTIVATE_RATIO = 0.5;

/**
 * Drop larger than this vs last-known-good / historical inventory is suspicious.
 * Example: 100 → 19 is an 81% drop and must not publish.
 */
export const MAX_INVENTORY_DROP_RATIO = 0.8;

export function resolveKnownGoodInventoryCount(input: {
  lastGoodEventCount?: number | null;
  recentHistoricalCounts?: number[] | null;
}): number | null {
  const lastGood = input.lastGoodEventCount;
  if (typeof lastGood === "number" && lastGood > 0) return lastGood;
  const historical = (input.recentHistoricalCounts ?? []).filter((n) => typeof n === "number" && n > 0);
  if (historical.length === 0) return null;
  const sorted = [...historical].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
  return median > 0 ? median : null;
}

export function inventoryDropRatio(candidateCount: number, knownGoodCount: number): number {
  if (knownGoodCount <= 0) return 0;
  return 1 - candidateCount / knownGoodCount;
}

/**
 * True when the catalog is trusted enough to upsert + soft-deactivate.
 * Suspicious / failed results must retain last-known-good inventory (no destructive writes).
 */
export function isCatalogPublishable(decision: SoftDeactivateDecision): boolean {
  return !decision.preservePreviousInventory;
}

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
  /** Last known-good upcoming count for this provider (health table). */
  lastGoodEventCount?: number | null;
  /** Recent successful catalog sizes (sync_logs events_received). */
  recentHistoricalCounts?: number[] | null;
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
    const knownGood = resolveKnownGoodInventoryCount(input);
    // Discovery returning [] while any inventory remains is not a safe purge signal.
    if (storedUpcoming > 0 || activeCount > 0 || (knownGood ?? 0) > 0) {
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

  const candidateCount = Math.min(input.eventsFetched, successfulImports);
  const knownGood = resolveKnownGoodInventoryCount(input);
  if (knownGood != null && knownGood > 0 && inventoryDropRatio(candidateCount, knownGood) > MAX_INVENTORY_DROP_RATIO) {
    return {
      shouldDeactivate: false,
      preservePreviousInventory: true,
      reason: "suspicious_inventory_drop",
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

/**
 * Per-source stale merge: a healthy Athletics feed must not hide last-known-good
 * URInvolved (or manual) rows. Evaluate each provider independently.
 */
export function shouldMergeLastKnownGoodForSource(input: {
  sourceUpcomingActiveCount: number;
  sourceHasInactiveUpcoming: boolean;
  providerDegraded?: boolean;
  lastError?: string | null;
  lastSyncImportedCount?: number;
}): boolean {
  if (!input.sourceHasInactiveUpcoming) return false;
  if (input.sourceUpcomingActiveCount > 0) return false;
  if (input.providerDegraded) return true;
  return shouldServeStaleInactiveEvents({
    upcomingActiveEventsCount: input.sourceUpcomingActiveCount,
    lastError: input.lastError ?? null,
    lastSyncImportedCount: input.lastSyncImportedCount ?? 0,
  });
}

export function mergeFeedRowsById<T extends { id: string }>(primary: T[], extra: T[]): T[] {
  const seen = new Set(primary.map((row) => row.id));
  const merged = [...primary];
  for (const row of extra) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}
