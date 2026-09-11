import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { runUrinvolvedSync } from "@/lib/server/urinvolved/sync";
import { runAthleticsSync } from "@/lib/server/eventSources/athleticsSync";
import { inspectEventProviderWatchdog, runProviderWatchdogAfterSync } from "@/lib/server/eventSources/providerWatchdog";
import { classifyProviderIncident, shouldSkipWatchdogRetries } from "@/lib/server/eventSources/incidentTypes";
import { runProviderRecoveryController } from "@/lib/server/eventSources/recoveryController";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Single daily job that syncs URInvolved then Athletics.
 * Use this when the host allows only one daily cron (Vercel Hobby).
 * Existing per-provider routes remain for manual/admin triggers.
 */
export async function GET(request: Request) {
  try {
    assertCronSecret(request);

    const urinvolved = await runUrinvolvedSync("cron");
    const classified = classifyProviderIncident(urinvolved.errors[0] ?? null);
    let urinvolvedWatchdog;
    let recovery: unknown = null;
    if (!urinvolved.success && shouldSkipWatchdogRetries(classified.type)) {
      recovery = await runProviderRecoveryController({
        source: "urinvolved",
        trigger: "cron",
        lastError: urinvolved.errors[0] ?? classified.summary,
      });
      urinvolvedWatchdog = await inspectEventProviderWatchdog();
    } else {
      urinvolvedWatchdog = await runProviderWatchdogAfterSync({
        source: "urinvolved",
        publishable: urinvolved.catalog_publishable ?? urinvolved.success,
        importedCount: urinvolved.events_created + urinvolved.events_updated,
        errors: urinvolved.errors,
        skipped: urinvolved.skipped,
        enableRecovery: true,
        runRecoverySync: async () => {
          const retry = await runUrinvolvedSync("cron");
          return {
            success: retry.success,
            skipped: retry.skipped,
            importedCount: retry.events_created + retry.events_updated,
            errors: retry.errors,
            publishable: retry.catalog_publishable ?? retry.success,
          };
        },
      });
    }

    const athletics = await runAthleticsSync("cron");
    const athleticsWatchdog = await runProviderWatchdogAfterSync({
      source: "athletics",
      publishable: athletics.success && !athletics.skipped,
      importedCount: athletics.eventsCreated + athletics.eventsUpdated,
      errors: athletics.errors,
      skipped: athletics.skipped,
      enableRecovery: false,
    });

    return ok({
      urinvolved: { result: urinvolved, watchdog: urinvolvedWatchdog, recovery },
      athletics: { result: athletics, watchdog: athleticsWatchdog },
    });
  } catch (error) {
    return fail(error);
  }
}
