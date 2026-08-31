import { createAdminClient } from "@/lib/server/supabase";
import { EVENT_SOURCE_ADAPTERS } from "@/lib/server/eventSources/adapters";
import { getLatestSyncBySource } from "@/lib/server/eventSources/syncLogs";
import { athleticsFeedConfigured } from "@/lib/server/eventSources/athleticsSync";
import { eventSourceLabel } from "@/lib/eventSources/catalog";
import {
  estimateNextDailyCronUtc,
  resolveProviderHealth,
  type ProviderHealthStatus,
} from "@/lib/eventSources/providerHealth";

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
};

export async function listEventSourceAdminStatuses(): Promise<EventSourceAdminStatus[]> {
  const admin = createAdminClient();
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
    const health = resolveProviderHealth({
      source: adapter.source,
      configured,
      activeEventsCount,
      lastSuccessfulSync: latest.lastSuccessfulSync,
      lastAttemptedSync: latest.lastAttemptedSync,
      lastStatus: latest.lastStatus,
      lastError: latest.lastError,
    });

    const nextScheduledSync =
      adapter.source === "urinvolved" || adapter.source === "athletics"
        ? estimateNextDailyCronUtc({
            scheduled: configured || activeEventsCount > 0,
            cronHourUtc: 3,
            cronMinuteUtc: adapter.source === "athletics" ? 30 : 0,
          })
        : null;

    statuses.push({
      source: adapter.source,
      label: eventSourceLabel(adapter.source),
      configured,
      configurationHint: adapter.configurationHint,
      lastSuccessfulSync: latest.lastSuccessfulSync,
      lastAttemptedSync: latest.lastAttemptedSync,
      nextScheduledSync,
      lastStatus: latest.lastStatus,
      lastError: latest.lastError,
      eventsReceived: latest.eventsReceived,
      eventsCreated: latest.eventsCreated,
      eventsUpdated: latest.eventsUpdated,
      duplicatesMerged: latest.duplicatesMerged,
      activeEventsCount,
      healthStatus: health.status,
      healthLabel: health.label,
      healthMessage: health.message,
    });
  }

  return statuses;
}
