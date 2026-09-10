import { createAdminClient } from "@/lib/server/supabase";
import type {
  ProviderHealthStatusValue,
  RecoveryFinalResult,
} from "@/lib/server/eventSources/providerInventoryHealth";

type AdminClient = ReturnType<typeof createAdminClient>;

export type EventProviderHealthRow = {
  source: string;
  status: ProviderHealthStatusValue;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  current_event_count: number;
  last_good_event_count: number;
  latest_import_count: number;
  consecutive_failures: number;
  recovery_attempts: number;
  last_recovery_at: string | null;
  last_recovery_result: string | null;
  circuit_opened_at: string | null;
  updated_at: string;
};

export type EventProviderHealthWrite = {
  source: string;
  status: ProviderHealthStatusValue;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_error?: string | null;
  current_event_count: number;
  last_good_event_count: number;
  latest_import_count: number;
  consecutive_failures: number;
  recovery_attempts?: number;
  last_recovery_at?: string | null;
  last_recovery_result?: RecoveryFinalResult | string | null;
  circuit_opened_at?: string | null;
};

function isMissingRelation(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (message.includes("event_provider_health") &&
      (message.includes("does not exist") || message.includes("could not find")))
  );
}

function mapRow(row: Record<string, unknown>): EventProviderHealthRow {
  return {
    source: String(row.source),
    status: (row.status as ProviderHealthStatusValue) ?? "healthy",
    last_attempt_at: (row.last_attempt_at as string | null) ?? null,
    last_success_at: (row.last_success_at as string | null) ?? null,
    last_failure_at: (row.last_failure_at as string | null) ?? null,
    last_error: (row.last_error as string | null) ?? null,
    current_event_count: Number(row.current_event_count ?? 0),
    last_good_event_count: Number(row.last_good_event_count ?? 0),
    latest_import_count: Number(row.latest_import_count ?? 0),
    consecutive_failures: Number(row.consecutive_failures ?? 0),
    recovery_attempts: Number(row.recovery_attempts ?? 0),
    last_recovery_at: (row.last_recovery_at as string | null) ?? null,
    last_recovery_result: (row.last_recovery_result as string | null) ?? null,
    circuit_opened_at: (row.circuit_opened_at as string | null) ?? null,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function getEventProviderHealth(
  admin: AdminClient,
  source: string,
): Promise<EventProviderHealthRow | null> {
  try {
    const { data, error } = await admin
      .from("event_provider_health")
      .select(
        "source, status, last_attempt_at, last_success_at, last_failure_at, last_error, current_event_count, last_good_event_count, latest_import_count, consecutive_failures, recovery_attempts, last_recovery_at, last_recovery_result, circuit_opened_at, updated_at",
      )
      .eq("source", source)
      .maybeSingle();
    if (error) {
      if (!isMissingRelation(error)) {
        console.warn("[cq:provider-health] read failed", { source, error: error.message });
      }
      return null;
    }
    return data ? mapRow(data as Record<string, unknown>) : null;
  } catch (error) {
    console.warn("[cq:provider-health] read threw", {
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function listEventProviderHealth(admin: AdminClient): Promise<EventProviderHealthRow[]> {
  try {
    const { data, error } = await admin
      .from("event_provider_health")
      .select(
        "source, status, last_attempt_at, last_success_at, last_failure_at, last_error, current_event_count, last_good_event_count, latest_import_count, consecutive_failures, recovery_attempts, last_recovery_at, last_recovery_result, circuit_opened_at, updated_at",
      )
      .order("source", { ascending: true });
    if (error) {
      if (!isMissingRelation(error)) {
        console.warn("[cq:provider-health] list failed", { error: error.message });
      }
      return [];
    }
    return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  } catch (error) {
    console.warn("[cq:provider-health] list threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function upsertEventProviderHealth(
  admin: AdminClient,
  patch: EventProviderHealthWrite,
): Promise<EventProviderHealthRow | null> {
  const existing = await getEventProviderHealth(admin, patch.source);
  const now = new Date().toISOString();
  const row = {
    source: patch.source,
    status: patch.status,
    last_attempt_at: patch.last_attempt_at ?? now,
    last_success_at:
      patch.last_success_at !== undefined ? patch.last_success_at : (existing?.last_success_at ?? null),
    last_failure_at:
      patch.last_failure_at !== undefined ? patch.last_failure_at : (existing?.last_failure_at ?? null),
    last_error: patch.last_error !== undefined ? patch.last_error : (existing?.last_error ?? null),
    current_event_count: patch.current_event_count,
    last_good_event_count: patch.last_good_event_count,
    latest_import_count: patch.latest_import_count,
    consecutive_failures: patch.consecutive_failures,
    recovery_attempts:
      patch.recovery_attempts !== undefined ? patch.recovery_attempts : (existing?.recovery_attempts ?? 0),
    last_recovery_at:
      patch.last_recovery_at !== undefined ? patch.last_recovery_at : (existing?.last_recovery_at ?? null),
    last_recovery_result:
      patch.last_recovery_result !== undefined
        ? patch.last_recovery_result
        : (existing?.last_recovery_result ?? null),
    circuit_opened_at:
      patch.circuit_opened_at !== undefined ? patch.circuit_opened_at : (existing?.circuit_opened_at ?? null),
    updated_at: now,
  };
  try {
    const { data, error } = await admin
      .from("event_provider_health")
      .upsert(row, { onConflict: "source" })
      .select(
        "source, status, last_attempt_at, last_success_at, last_failure_at, last_error, current_event_count, last_good_event_count, latest_import_count, consecutive_failures, recovery_attempts, last_recovery_at, last_recovery_result, circuit_opened_at, updated_at",
      )
      .maybeSingle();
    if (error) {
      if (!isMissingRelation(error)) {
        console.warn("[cq:provider-health] write failed", { source: patch.source, error: error.message });
      }
      return null;
    }
    return data ? mapRow(data as Record<string, unknown>) : mapRow(row);
  } catch (error) {
    console.warn("[cq:provider-health] write threw", {
      source: patch.source,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function countUpcomingEventsForSource(
  admin: AdminClient,
  source: string,
  opts?: { activeOnly?: boolean },
): Promise<number> {
  try {
    const pastCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    let query = admin
      .from("external_events")
      .select("id", { count: "exact", head: true })
      .eq("source", source)
      .not("starts_at", "is", null)
      .gte("starts_at", pastCutoff);
    if (opts?.activeOnly !== false) {
      query = query.eq("is_active", true);
    }
    const { count, error } = await query;
    if (error) {
      console.warn("[cq:provider-health] upcoming count failed", { source, error: error.message });
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.warn("[cq:provider-health] upcoming count threw", {
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
