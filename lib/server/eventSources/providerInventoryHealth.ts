/**
 * Per-source event inventory health. A healthy Athletics feed is never proof
 * that URInvolved (or the overall Events system) is healthy.
 */

import {
  MAX_INVENTORY_DROP_RATIO,
  resolveKnownGoodInventoryCount,
  inventoryDropRatio,
} from "@/lib/server/urinvolved/syncSafety";

export const WATCHDOG_PROVIDER_SOURCES = ["athletics", "urinvolved", "manual"] as const;
export type WatchdogProviderSource = (typeof WATCHDOG_PROVIDER_SOURCES)[number];

export type ProviderHealthStatusValue = "healthy" | "degraded" | "recovering" | "circuit_open";
export type OverallEventsHealth = "HEALTHY" | "DEGRADED";
export type RecoveryFinalResult =
  | "not_needed"
  | "recovered"
  | "circuit_open"
  | "skipped"
  | "in_progress";

export type ProviderInventorySnapshot = {
  source: string;
  upcomingActiveCount: number;
  upcomingStoredCount?: number;
  lastGoodEventCount: number | null;
  recentHistoricalCounts?: number[];
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastFailureAt?: string | null;
  lastError: string | null;
  lastStatus: string | null;
  latestImportCount: number;
  consecutiveFailures?: number;
  status?: ProviderHealthStatusValue | null;
};

/** Athletics still looks like a normal upcoming schedule. */
export const ATHLETICS_NORMAL_MIN_EVENTS = 5;

/** URInvolved at or below this upcoming count is "extremely few" when last-good is unknown. */
export const URINVOLVED_EXTREMELY_FEW_ABS = 3;

export function resolveProviderHealthStatus(input: {
  publishable: boolean;
  consecutiveFailures: number;
  circuitOpen?: boolean;
  recovering?: boolean;
}): ProviderHealthStatusValue {
  if (input.recovering) return "recovering";
  if (input.circuitOpen) return "circuit_open";
  if (!input.publishable) return "degraded";
  return "healthy";
}

export function detectSuspiciousInventoryDrop(input: {
  candidateCount: number;
  lastGoodEventCount?: number | null;
  recentHistoricalCounts?: number[] | null;
}): { suspicious: boolean; knownGood: number | null; dropRatio: number } {
  const knownGood = resolveKnownGoodInventoryCount({
    lastGoodEventCount: input.lastGoodEventCount,
    recentHistoricalCounts: input.recentHistoricalCounts,
  });
  if (knownGood == null || knownGood <= 0) {
    return { suspicious: false, knownGood: null, dropRatio: 0 };
  }
  const dropRatio = inventoryDropRatio(input.candidateCount, knownGood);
  return {
    suspicious: dropRatio > MAX_INVENTORY_DROP_RATIO,
    knownGood,
    dropRatio,
  };
}

/**
 * Recurring production failure: Athletics stays populated while URInvolved
 * collapses, so Events + For You become athletics-only.
 */
export function detectAthleticsOnlyFailure(input: {
  athletics: Pick<ProviderInventorySnapshot, "upcomingActiveCount" | "lastGoodEventCount">;
  urinvolved: Pick<
    ProviderInventorySnapshot,
    "upcomingActiveCount" | "lastGoodEventCount" | "recentHistoricalCounts"
  >;
}): { degraded: boolean; reason: string | null } {
  const athleticsCount = input.athletics.upcomingActiveCount;
  const athleticsGood = input.athletics.lastGoodEventCount;
  const athleticsNormal =
    athleticsCount >= ATHLETICS_NORMAL_MIN_EVENTS ||
    (typeof athleticsGood === "number" &&
      athleticsGood > 0 &&
      athleticsCount >= Math.ceil(athleticsGood * (1 - MAX_INVENTORY_DROP_RATIO)));

  if (!athleticsNormal) {
    return { degraded: false, reason: null };
  }

  const uriCount = input.urinvolved.upcomingActiveCount;
  const uriKnownGood = resolveKnownGoodInventoryCount({
    lastGoodEventCount: input.urinvolved.lastGoodEventCount,
    recentHistoricalCounts: input.urinvolved.recentHistoricalCounts,
  });

  if (uriKnownGood != null) {
    if (uriKnownGood > URINVOLVED_EXTREMELY_FEW_ABS) {
      const drop = inventoryDropRatio(uriCount, uriKnownGood);
      if (drop > MAX_INVENTORY_DROP_RATIO || uriCount <= URINVOLVED_EXTREMELY_FEW_ABS) {
        return {
          degraded: true,
          reason: `URInvolved upcoming inventory collapsed to ${uriCount} while Athletics remains populated (${athleticsCount}).`,
        };
      }
    }
    return { degraded: false, reason: null };
  }

  // No last-known-good yet: athletics-only with an empty/tiny URInvolved feed is the
  // production symptom and must still be flagged.
  if (uriCount <= URINVOLVED_EXTREMELY_FEW_ABS) {
    return {
      degraded: true,
      reason: `URInvolved has ${uriCount} upcoming events while Athletics still has ${athleticsCount}.`,
    };
  }

  return { degraded: false, reason: null };
}

export function overallEventsHealth(input: {
  athleticsOnlyFailure: boolean;
  providers: Array<{ source: string; status: ProviderHealthStatusValue | null | undefined }>;
}): OverallEventsHealth {
  if (input.athleticsOnlyFailure) return "DEGRADED";
  const live = input.providers.filter(
    (provider) => provider.source === "urinvolved" || provider.source === "athletics",
  );
  if (live.some((provider) => provider.status === "degraded" || provider.status === "circuit_open")) {
    return "DEGRADED";
  }
  return "HEALTHY";
}

export function recommendationsStayMultiSource(events: Array<{ source: string; is_active?: boolean }>): {
  athleticsOnly: boolean;
  sources: string[];
} {
  const sources = Array.from(new Set(events.map((event) => event.source)));
  const hasNonAthletics = sources.some((source) => source !== "athletics");
  return { athleticsOnly: !hasNonAthletics && sources.includes("athletics"), sources };
}
