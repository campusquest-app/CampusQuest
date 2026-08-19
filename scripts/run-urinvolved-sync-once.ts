import { runUrinvolvedSync, getUrinvolvedSyncStatus } from "../lib/server/urinvolved/sync";
import { listActiveExternalEvents } from "../lib/server/externalContent";

async function main() {
  const started = Date.now();
  const result = await runUrinvolvedSync("manual");
  const elapsed = Date.now() - started;
  const status = await getUrinvolvedSyncStatus();
  const listed = await listActiveExternalEvents();
  console.log(
    JSON.stringify(
      {
        elapsedMs: elapsed,
        result: {
          success: result.success,
          events_fetched: result.events_fetched,
          events_created: result.events_created,
          events_updated: result.events_updated,
          events_failed: result.events_failed,
          events_unresolved_location: result.events_unresolved_location,
          events_map_matched: result.events_map_matched,
          orgs_created: result.orgs_created,
          orgs_updated: result.orgs_updated,
          errors: result.errors.slice(0, 8),
          skipped: result.skipped ?? false,
        },
        status: {
          lastSuccessfulSync: status.lastSuccessfulSync,
          lastAttemptedSync: status.lastAttemptedSync,
          totalEventsCount: status.totalEventsCount,
          activeEventsCount: status.activeEventsCount,
          upcomingActiveEventsCount: status.upcomingActiveEventsCount,
          lastError: status.lastError,
        },
        apiListedCount: listed.length,
        apiSample: listed.slice(0, 8).map((e) => ({
          title: e.title.slice(0, 60),
          startsAt: e.startsAt,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
