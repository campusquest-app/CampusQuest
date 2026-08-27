import type { EventSourceAdapter, EventSourceSyncResult, EventSourceType } from "@/lib/eventSources/types";
import { ATHLETICS_CONFIGURATION_HINT, athleticsFeedConfigured, runAthleticsSync } from "@/lib/server/eventSources/athleticsSync";
import { runUrinvolvedSync } from "@/lib/server/urinvolved/sync";

function skippedAdapter(source: EventSourceType, hint: string): EventSourceAdapter {
  return {
    source,
    label: source,
    isConfigured: () => false,
    configurationHint: hint,
    async sync(_syncType): Promise<EventSourceSyncResult> {
      return {
        source,
        success: true,
        skipped: true,
        skipReason: "feed_not_configured",
        eventsReceived: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsFailed: 0,
        duplicatesMerged: 0,
        orgsCreated: 0,
        orgsUpdated: 0,
        errors: [],
      };
    },
  };
}

export const EVENT_SOURCE_ADAPTERS: EventSourceAdapter[] = [
  {
    source: "urinvolved",
    label: "URInvolved",
    isConfigured: () => true,
    configurationHint: "Uses the existing URInvolved discovery sync.",
    async sync(syncType) {
      const result = await runUrinvolvedSync(syncType);
      return {
        source: "urinvolved",
        success: result.success,
        skipped: result.skipped,
        skipReason: result.skip_reason ?? null,
        eventsReceived: result.events_fetched,
        eventsCreated: result.events_created,
        eventsUpdated: result.events_updated,
        eventsFailed: result.events_failed,
        duplicatesMerged: 0,
        orgsCreated: result.orgs_created,
        orgsUpdated: result.orgs_updated,
        errors: result.errors,
        syncLogId: result.syncLogId,
      };
    },
  },
  {
    source: "athletics",
    label: "Athletics",
    isConfigured: athleticsFeedConfigured,
    configurationHint: ATHLETICS_CONFIGURATION_HINT,
    sync: runAthleticsSync,
  },
  skippedAdapter("fine_arts", "Connect a Fine Arts calendar/ICS or JSON feed when available."),
  skippedAdapter("academic", "Connect an academic lectures/seminars feed when available."),
  skippedAdapter("career", "Connect a career-services events feed when available."),
  skippedAdapter("recreation", "Connect a recreation/intramurals feed when available."),
  skippedAdapter("department", "Connect department event feeds when available."),
];

export function getEventSourceAdapter(source: string): EventSourceAdapter | null {
  return EVENT_SOURCE_ADAPTERS.find((adapter) => adapter.source === source) ?? null;
}
