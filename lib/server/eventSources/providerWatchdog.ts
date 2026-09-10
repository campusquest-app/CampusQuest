import { createAdminClient } from "@/lib/server/supabase";
import { logAdminAuditAction } from "@/lib/server/audit";
import {
  detectAthleticsOnlyFailure,
  overallEventsHealth,
  resolveProviderHealthStatus,
  type OverallEventsHealth,
  type ProviderHealthStatusValue,
  type ProviderInventorySnapshot,
  type RecoveryFinalResult,
} from "@/lib/server/eventSources/providerInventoryHealth";
import {
  countUpcomingEventsForSource,
  getEventProviderHealth,
  listEventProviderHealth,
  upsertEventProviderHealth,
  type EventProviderHealthRow,
} from "@/lib/server/eventSources/providerHealthStore";
import { classifyProviderIncident, shouldSkipWatchdogRetries } from "@/lib/server/eventSources/incidentTypes";
import { getLatestSyncBySource, getRecentSuccessfulImportCounts } from "@/lib/server/eventSources/syncLogs";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Attempt 1 immediately, attempt 2 after 2s, attempt 3 after 10s. Never an infinite loop. */
export const RECOVERY_BACKOFF_MS = [0, 2_000, 10_000] as const;
export const MAX_RECOVERY_ATTEMPTS = RECOVERY_BACKOFF_MS.length;

export type RecoverySyncResult = {
  success: boolean;
  skipped?: boolean;
  importedCount: number;
  errors: string[];
  publishable: boolean;
  upcomingActiveCount?: number;
};

export type ProviderWatchdogCard = {
  source: string;
  status: ProviderHealthStatusValue;
  eventCount: number;
  lastGoodEventCount: number;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  lastError: string | null;
  latestImportCount: number;
  consecutiveFailures: number;
};

export type EventWatchdogDiagnostics = {
  overall: OverallEventsHealth;
  athleticsOnlyFailure: boolean;
  athleticsOnlyReason: string | null;
  providers: ProviderWatchdogCard[];
  recovery: {
    source: string | null;
    autoRecoveryOccurred: boolean;
    retryAttempts: number;
    finalResult: RecoveryFinalResult;
  };
};

export async function defaultWatchdogSleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function recoveryAttemptSucceeded(result: RecoverySyncResult): boolean {
  if (result.skipped) return false;
  return result.success && result.publishable;
}

export async function runBoundedProviderRecovery(input: {
  runAttempt: (attempt: number) => Promise<RecoverySyncResult>;
  isHealthy?: (result: RecoverySyncResult) => boolean;
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: readonly number[];
}): Promise<{
  attempts: number;
  recovered: boolean;
  lastResult: RecoverySyncResult | null;
  results: RecoverySyncResult[];
}> {
  const backoff = input.backoffMs ?? RECOVERY_BACKOFF_MS;
  const sleep = input.sleep ?? defaultWatchdogSleep;
  const isHealthy = input.isHealthy ?? recoveryAttemptSucceeded;
  const results: RecoverySyncResult[] = [];

  for (let attempt = 0; attempt < backoff.length; attempt += 1) {
    const waitMs = backoff[attempt] ?? 0;
    if (waitMs > 0) await sleep(waitMs);
    const result = await input.runAttempt(attempt + 1);
    results.push(result);
    if (isHealthy(result)) {
      return { attempts: attempt + 1, recovered: true, lastResult: result, results };
    }
  }

  return {
    attempts: results.length,
    recovered: false,
    lastResult: results[results.length - 1] ?? null,
    results,
  };
}

export async function recordProviderSyncOutcome(
  admin: AdminClient,
  input: {
    source: string;
    publishable: boolean;
    importedCount: number;
    currentUpcomingCount: number;
    error: string | null;
    recovering?: boolean;
    recoveryAttempts?: number;
    recoveryResult?: RecoveryFinalResult | null;
    consecutiveFailures?: number;
  },
): Promise<EventProviderHealthRow | null> {
  const existing = await getEventProviderHealth(admin, input.source);
  const now = new Date().toISOString();
  const consecutiveFailures =
    input.consecutiveFailures !== undefined
      ? input.consecutiveFailures
      : input.publishable
        ? 0
        : (existing?.consecutive_failures ?? 0) + 1;
  const circuitOpen = input.recoveryResult === "circuit_open";
  const status = resolveProviderHealthStatus({
    publishable: input.publishable,
    consecutiveFailures,
    circuitOpen,
    recovering: input.recovering && !input.publishable,
  });
  const lastGood =
    input.publishable && input.currentUpcomingCount > 0
      ? input.currentUpcomingCount
      : (existing?.last_good_event_count ?? 0);

  const row = await upsertEventProviderHealth(admin, {
    source: input.source,
    status,
    last_attempt_at: now,
    last_success_at: input.publishable ? now : existing?.last_success_at ?? null,
    last_failure_at: input.publishable ? existing?.last_failure_at ?? null : now,
    last_error: input.publishable ? null : input.error,
    current_event_count: input.currentUpcomingCount,
    last_good_event_count: lastGood,
    latest_import_count: input.importedCount,
    consecutive_failures: consecutiveFailures,
    recovery_attempts: input.recoveryAttempts ?? existing?.recovery_attempts ?? 0,
    last_recovery_at: input.recoveryResult ? now : existing?.last_recovery_at ?? null,
    last_recovery_result: input.recoveryResult ?? existing?.last_recovery_result ?? null,
    circuit_opened_at: circuitOpen ? now : input.publishable ? null : existing?.circuit_opened_at ?? null,
  });

  if (circuitOpen) {
    console.warn("[cq:provider-watchdog] circuit open", {
      source: input.source,
      consecutiveFailures,
      lastError: input.error,
      currentEventCount: input.currentUpcomingCount,
      lastGoodEventCount: lastGood,
    });
    try {
      await logAdminAuditAction({
        actionType: "event_provider_circuit_open",
        reason: input.error ?? `Provider ${input.source} recovery exhausted.`,
        metadata: {
          source: input.source,
          consecutiveFailures,
          currentEventCount: input.currentUpcomingCount,
          lastGoodEventCount: lastGood,
        },
      });
    } catch (auditError) {
      console.warn("[cq:provider-watchdog] audit log failed", {
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
  }

  return row;
}

async function snapshotSource(admin: AdminClient, source: string): Promise<ProviderInventorySnapshot> {
  const [health, latest, historical, upcomingActive, upcomingStored] = await Promise.all([
    getEventProviderHealth(admin, source),
    getLatestSyncBySource(admin, source).catch(() => null),
    getRecentSuccessfulImportCounts(admin, source),
    countUpcomingEventsForSource(admin, source, { activeOnly: true }),
    countUpcomingEventsForSource(admin, source, { activeOnly: false }),
  ]);
  return {
    source,
    upcomingActiveCount: upcomingActive,
    upcomingStoredCount: upcomingStored,
    lastGoodEventCount: health?.last_good_event_count || null,
    recentHistoricalCounts: historical,
    lastSuccessAt: health?.last_success_at ?? latest?.lastSuccessfulSync ?? null,
    lastAttemptAt: health?.last_attempt_at ?? latest?.lastAttemptedSync ?? null,
    lastFailureAt: health?.last_failure_at ?? null,
    lastError: health?.last_error ?? latest?.lastError ?? null,
    lastStatus: health?.status ?? latest?.lastStatus ?? null,
    latestImportCount: health?.latest_import_count ?? latest?.eventsCreated ?? 0,
    consecutiveFailures: health?.consecutive_failures ?? 0,
    status: health?.status ?? null,
  };
}

function cardFromSnapshot(snapshot: ProviderInventorySnapshot): ProviderWatchdogCard {
  const raw = snapshot.status;
  const status: ProviderHealthStatusValue =
    raw === "healthy" ||
    raw === "degraded" ||
    raw === "recovering" ||
    raw === "circuit_open" ||
    raw === "failed" ||
    raw === "repairing" ||
    raw === "configuration_required"
      ? raw
      : snapshot.lastError
        ? "degraded"
        : "healthy";
  return {
    source: snapshot.source,
    status,
    eventCount: snapshot.upcomingActiveCount,
    lastGoodEventCount: snapshot.lastGoodEventCount ?? 0,
    lastSuccessfulSync: snapshot.lastSuccessAt,
    lastAttemptedSync: snapshot.lastAttemptAt,
    lastError: snapshot.lastError,
    latestImportCount: snapshot.latestImportCount,
    consecutiveFailures: snapshot.consecutiveFailures ?? 0,
  };
}

export function diagnosticsFromSnapshots(
  snapshots: ProviderInventorySnapshot[],
  recovery: EventWatchdogDiagnostics["recovery"],
): EventWatchdogDiagnostics {
  const athletics = snapshots.find((row) => row.source === "athletics");
  const urinvolved = snapshots.find((row) => row.source === "urinvolved");
  const athleticsOnly = athletics && urinvolved
    ? detectAthleticsOnlyFailure({ athletics, urinvolved })
    : { degraded: false, reason: null };
  const providers = snapshots.map(cardFromSnapshot);
  if (athleticsOnly.degraded) {
    const uri = providers.find((row) => row.source === "urinvolved");
    if (uri && uri.status === "healthy") uri.status = "degraded";
  }
  return {
    overall: overallEventsHealth({
      athleticsOnlyFailure: athleticsOnly.degraded,
      providers,
    }),
    athleticsOnlyFailure: athleticsOnly.degraded,
    athleticsOnlyReason: athleticsOnly.reason,
    providers,
    recovery,
  };
}

export async function inspectEventProviderWatchdog(
  admin: AdminClient = createAdminClient(),
): Promise<EventWatchdogDiagnostics> {
  const [athletics, urinvolved, manual, healthRows] = await Promise.all([
    snapshotSource(admin, "athletics"),
    snapshotSource(admin, "urinvolved"),
    snapshotSource(admin, "manual"),
    listEventProviderHealth(admin),
  ]);
  const uriHealth = healthRows.find((row) => row.source === "urinvolved");
  return diagnosticsFromSnapshots([athletics, urinvolved, manual], {
    source: uriHealth ? "urinvolved" : null,
    autoRecoveryOccurred: (uriHealth?.recovery_attempts ?? 0) > 0,
    retryAttempts: uriHealth?.recovery_attempts ?? 0,
    finalResult: (uriHealth?.last_recovery_result as RecoveryFinalResult | null) ?? "not_needed",
  });
}

export async function runProviderWatchdogAfterSync(input: {
  source: "urinvolved" | "athletics";
  publishable: boolean;
  importedCount: number;
  errors: string[];
  skipped?: boolean;
  enableRecovery?: boolean;
  sleep?: (ms: number) => Promise<void>;
  runRecoverySync?: () => Promise<RecoverySyncResult>;
}): Promise<EventWatchdogDiagnostics> {
  const admin = createAdminClient();
  const initial = await inspectEventProviderWatchdog(admin);
  const uriCard = initial.providers.find((row) => row.source === "urinvolved");
  const uriUnhealthy =
    !input.publishable ||
    initial.athleticsOnlyFailure ||
    uriCard?.status === "degraded" ||
    uriCard?.status === "circuit_open";

  let recovery: EventWatchdogDiagnostics["recovery"] = {
    source: "urinvolved",
    autoRecoveryOccurred: false,
    retryAttempts: 0,
    finalResult: "not_needed",
  };

  const skipWatchdogRetries = input.errors.some((error) =>
    shouldSkipWatchdogRetries(classifyProviderIncident(error).type),
  );

  const shouldRecover =
    Boolean(input.enableRecovery) &&
    !input.skipped &&
    uriUnhealthy &&
    !skipWatchdogRetries &&
    typeof input.runRecoverySync === "function";

  if (!shouldRecover) {
    return { ...initial, recovery };
  }

  const existing = await getEventProviderHealth(admin, "urinvolved");
  await upsertEventProviderHealth(admin, {
    source: "urinvolved",
    status: "recovering",
    last_attempt_at: new Date().toISOString(),
    last_success_at: existing?.last_success_at ?? null,
    last_failure_at: existing?.last_failure_at ?? null,
    last_error: existing?.last_error ?? input.errors[0] ?? "URInvolved degraded; starting automatic recovery.",
    current_event_count: existing?.current_event_count ?? uriCard?.eventCount ?? 0,
    last_good_event_count: existing?.last_good_event_count ?? uriCard?.lastGoodEventCount ?? 0,
    latest_import_count: existing?.latest_import_count ?? 0,
    consecutive_failures: existing?.consecutive_failures ?? 0,
    recovery_attempts: 0,
    last_recovery_at: new Date().toISOString(),
    last_recovery_result: "in_progress",
    circuit_opened_at: existing?.circuit_opened_at ?? null,
  });

  const recovered = await runBoundedProviderRecovery({
    runAttempt: async (attempt) => {
      console.info("[cq:provider-watchdog] recovery attempt", { source: "urinvolved", attempt });
      return input.runRecoverySync!();
    },
    sleep: input.sleep,
  });

  recovery = {
    source: "urinvolved",
    autoRecoveryOccurred: true,
    retryAttempts: recovered.attempts,
    finalResult: recovered.recovered ? "recovered" : "circuit_open",
  };

  const afterCount = await countUpcomingEventsForSource(admin, "urinvolved", { activeOnly: true });
  const last = recovered.lastResult;
  await recordProviderSyncOutcome(admin, {
    source: "urinvolved",
    publishable: recovered.recovered,
    importedCount: last?.importedCount ?? 0,
    currentUpcomingCount: afterCount,
    error: recovered.recovered ? null : last?.errors[0] ?? "Automatic URInvolved recovery failed.",
    recoveryAttempts: recovered.attempts,
    recoveryResult: recovery.finalResult,
    consecutiveFailures: recovered.recovered
      ? 0
      : (existing?.consecutive_failures ?? 0) + recovered.attempts,
  });

  const diagnostics = await inspectEventProviderWatchdog(admin);
  return { ...diagnostics, recovery };
}
