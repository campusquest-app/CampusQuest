import { createAdminClient } from "@/lib/server/supabase";
import { EVENT_SOURCE_ADAPTERS } from "@/lib/server/eventSources/adapters";
import { getLatestSyncBySource } from "@/lib/server/eventSources/syncLogs";
import { athleticsFeedConfigured } from "@/lib/server/eventSources/athleticsSync";
import { eventSourceLabel } from "@/lib/eventSources/catalog";
import {
  estimateNextDailyCronUtc,
  operatorHealthLabel,
  repairPhaseLabel,
  resolveProviderHealth,
  type ProviderHealthStatus,
} from "@/lib/eventSources/providerHealth";
import type { ExternalIdentitySchemaHealth } from "@/lib/server/eventSources/schemaHealth";
import type { EventWatchdogDiagnostics } from "@/lib/server/eventSources/providerWatchdog";
import {
  inspectCentralProviderHealth,
  latestIncidentForProvider,
} from "@/lib/server/eventSources/providerHealthService";
import type { ProviderIncidentRow } from "@/lib/server/eventSources/incidentStore";

export type EventSourceAdminStatus = {
  source: string;
  label: string;
  configured: boolean;
  configurationHint: string;
  lastSuccessfulSync: string | null;
  lastAttemptedSync: string | null;
  nextScheduledSync: string | null;
  lastStatus: string | null;
  lastError: string | null;
  eventsReceived: number;
  eventsCreated: number;
  eventsUpdated: number;
  duplicatesMerged: number;
  activeEventsCount: number;
  healthStatus: ProviderHealthStatus;
  healthLabel: string;
  healthMessage: string;
  operatorHealthLabel: "Healthy" | "Failed" | "Repairing" | "Manual Review";
  repairPhase: string | null;
  schemaCompatible: boolean;
  watchdogStatus?: string | null;
  currentEventCount?: number;
  lastGoodEventCount?: number;
  consecutiveFailures?: number;
  latestIncident: ProviderIncidentRow | null;
};

export type EventSourcesAdminPayload = {
  sources: EventSourceAdminStatus[];
  schemaHealth: ExternalIdentitySchemaHealth;
  watchdog: EventWatchdogDiagnostics;
  incidents: ProviderIncidentRow[];
};

export async function listEventSourceAdminStatuses(): Promise<EventSourcesAdminPayload> {
  const admin = createAdminClient();
  const central = await inspectCentralProviderHealth(admin);
  const statuses: EventSourceAdminStatus[] = [];

  for (const adapter of EVENT_SOURCE_ADAPTERS) {
    const latest = await getLatestSyncBySource(admin, adapter.source);
    const { count } = await admin
      .from("external_events")
      .select("id", { count: "exact", head: true })
      .eq("source", adapter.source)
      .eq("is_active", true);

    const configured =
      adapter.source === "athletics" ? athleticsFeedConfigured() : adapter.isConfigured();
    const activeEventsCount = count ?? 0;
    const overlaySchemaError = !central.schema.ok && configured;
    const schemaError = overlaySchemaError
      ? central.schema.message || "EVENT_SCHEMA_INCOMPATIBLE: external_events requires UNIQUE(source, external_id)"
      : null;
    const effectiveLastError = schemaError ?? latest.lastError;
    const effectiveLastStatus = schemaError ? "failed" : latest.lastStatus;
    const health = resolveProviderHealth({
      source: adapter.source,
      configured,
      activeEventsCount,
      lastSuccessfulSync: latest.lastSuccessfulSync,
      lastAttemptedSync: latest.lastAttemptedSync,
      lastStatus: effectiveLastStatus,
      lastError: effectiveLastError,
    });

    const nextScheduledSync =
      adapter.source === "urinvolved" || adapter.source === "athletics"
        ? estimateNextDailyCronUtc({
            scheduled: configured || activeEventsCount > 0,
            cronHourUtc: 3,
            cronMinuteUtc: adapter.source === "athletics" ? 30 : 0,
          })
        : null;

    const watchdogCard = central.watchdog.providers.find((row) => row.source === adapter.source);
    const incident = latestIncidentForProvider(central.incidents, adapter.source);
    const operator = operatorHealthLabel({
      healthStatus: health.status,
      incidentStatus: incident?.status,
      watchdogStatus: watchdogCard?.status,
    });

    statuses.push({
      source: adapter.source,
      label: eventSourceLabel(adapter.source),
      configured,
      configurationHint: adapter.configurationHint,
      lastSuccessfulSync: latest.lastSuccessfulSync,
      lastAttemptedSync: latest.lastAttemptedSync,
      nextScheduledSync,
      lastStatus: effectiveLastStatus,
      lastError: effectiveLastError,
      eventsReceived: latest.eventsReceived,
      eventsCreated: latest.eventsCreated,
      eventsUpdated: latest.eventsUpdated,
      duplicatesMerged: latest.duplicatesMerged,
      activeEventsCount,
      healthStatus: health.status,
      healthLabel: operator,
      healthMessage:
        overlaySchemaError && adapter.source !== "athletics"
          ? "Database schema is incompatible with event imports. Apply the identity invariant migration before syncing."
          : health.message,
      operatorHealthLabel: operator,
      repairPhase: repairPhaseLabel(incident?.status),
      schemaCompatible: central.schema.ok,
      watchdogStatus: watchdogCard?.status ?? null,
      currentEventCount: watchdogCard?.eventCount,
      lastGoodEventCount: watchdogCard?.lastGoodEventCount,
      consecutiveFailures: watchdogCard?.consecutiveFailures,
      latestIncident: incident,
    });
  }

  return {
    sources: statuses,
    schemaHealth: central.schema,
    watchdog: central.watchdog,
    incidents: central.incidents,
  };
}
