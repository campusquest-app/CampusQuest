import { createAdminClient } from "@/lib/server/supabase";
import { athleticsFeedConfigured } from "@/lib/server/eventSources/athleticsSync";
import { probeExternalIdentitySchemaHealth } from "@/lib/server/eventSources/schemaHealth";
import { inspectEventProviderWatchdog, type EventWatchdogDiagnostics } from "@/lib/server/eventSources/providerWatchdog";
import { listProviderIncidents, type ProviderIncidentRow } from "@/lib/server/eventSources/incidentStore";
import { classifyProviderIncident } from "@/lib/server/eventSources/incidentTypes";
import { operatorHealthLabel, repairPhaseLabel } from "@/lib/eventSources/providerHealth";
import type { ExternalIdentitySchemaHealth } from "@/lib/server/eventSources/schemaHealth";

export type ProviderHealthServiceSnapshot = {
  schema: ExternalIdentitySchemaHealth;
  watchdog: EventWatchdogDiagnostics;
  incidents: ProviderIncidentRow[];
  providers: Array<{
    source: "urinvolved" | "athletics";
    healthStatus: string;
    operatorLabel: "Healthy" | "Failed" | "Repairing" | "Manual Review";
    repairPhase: string | null;
    currentEventCount: number;
    lastReceived: number;
    lastSuccessAt: string | null;
    lastAttemptAt: string | null;
    consecutiveFailures: number;
    latestErrorCode: string | null;
    latestErrorSummary: string | null;
    latestIncident: ProviderIncidentRow | null;
    needsRecovery: boolean;
  }>;
};

export function latestIncidentForProvider(
  incidents: ProviderIncidentRow[],
  source: string,
): ProviderIncidentRow | null {
  return incidents.find((row) => row.provider === source) ?? null;
}

export function providerNeedsRecovery(input: {
  source: "urinvolved" | "athletics";
  schemaOk: boolean;
  lastError: string | null;
  watchdogStatus: string | null | undefined;
  athleticsOnlyFailure: boolean;
  configured: boolean;
}): boolean {
  if (input.source === "urinvolved" && !input.schemaOk) return true;
  if (input.source === "urinvolved" && input.athleticsOnlyFailure) return true;
  if (input.lastError) return true;
  if (
    input.watchdogStatus === "degraded" ||
    input.watchdogStatus === "circuit_open" ||
    input.watchdogStatus === "failed" ||
    input.watchdogStatus === "repairing"
  ) {
    return true;
  }
  if (input.source === "athletics" && !input.configured) return true;
  return false;
}

export async function inspectCentralProviderHealth(
  admin = createAdminClient(),
): Promise<ProviderHealthServiceSnapshot> {
  const [schema, watchdog, incidents] = await Promise.all([
    probeExternalIdentitySchemaHealth(admin),
    inspectEventProviderWatchdog(admin),
    listProviderIncidents(admin, { limit: 40 }),
  ]);

  const athleticsConfigured = athleticsFeedConfigured();
  const sources = ["urinvolved", "athletics"] as const;
  const providers = sources.map((source) => {
    const card = watchdog.providers.find((row) => row.source === source);
    const incident = latestIncidentForProvider(incidents, source);
    const lastError = card?.lastError ?? incident?.error_message ?? (!schema.ok && source === "urinvolved" ? schema.message : null);
    const classified = classifyProviderIncident(lastError);
    const healthStatus = card?.status ?? "healthy";
    return {
      source,
      healthStatus,
      operatorLabel: operatorHealthLabel({
        healthStatus: source === "athletics" && !athleticsConfigured ? "configuration_required" : healthStatus,
        incidentStatus: incident?.status,
        watchdogStatus: healthStatus,
      }),
      repairPhase: repairPhaseLabel(incident?.status),
      currentEventCount: card?.eventCount ?? 0,
      lastReceived: card?.latestImportCount ?? 0,
      lastSuccessAt: card?.lastSuccessfulSync ?? null,
      lastAttemptAt: card?.lastAttemptedSync ?? null,
      consecutiveFailures: card?.consecutiveFailures ?? 0,
      latestErrorCode: classified.errorCode === "UNKNOWN" && !lastError ? null : classified.errorCode,
      latestErrorSummary: lastError ? classified.summary : null,
      latestIncident: incident,
      needsRecovery: providerNeedsRecovery({
        source,
        schemaOk: schema.ok,
        lastError,
        watchdogStatus: healthStatus,
        athleticsOnlyFailure: watchdog.athleticsOnlyFailure,
        configured: source === "athletics" ? athleticsConfigured : true,
      }),
    };
  });

  return { schema, watchdog, incidents, providers };
}

export function recoveryLastErrorForProvider(
  snapshot: ProviderHealthServiceSnapshot,
  source: "urinvolved" | "athletics",
): string | null {
  const row = snapshot.providers.find((provider) => provider.source === source);
  if (!row) return null;
  if (source === "urinvolved" && snapshot.watchdog.athleticsOnlyFailure) {
    return row.latestErrorSummary ?? snapshot.watchdog.athleticsOnlyReason ?? "URInvolved inventory collapsed while Athletics remains populated.";
  }
  return row.latestIncident?.technical_details ?? row.latestErrorSummary ?? (source === "urinvolved" && !snapshot.schema.ok ? snapshot.schema.message : null);
}
