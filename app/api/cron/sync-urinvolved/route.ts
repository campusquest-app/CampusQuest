import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { runUrinvolvedSync } from "@/lib/server/urinvolved/sync";
import { inspectEventProviderWatchdog, runProviderWatchdogAfterSync } from "@/lib/server/eventSources/providerWatchdog";
import { classifyProviderIncident, shouldSkipWatchdogRetries } from "@/lib/server/eventSources/incidentTypes";
import { runProviderRecoveryController } from "@/lib/server/eventSources/recoveryController";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const result = await runUrinvolvedSync("cron");
    const classified = classifyProviderIncident(result.errors[0] ?? null);
    if (!result.success && shouldSkipWatchdogRetries(classified.type)) {
      const recovery = await runProviderRecoveryController({
        source: "urinvolved",
        trigger: "cron",
        lastError: result.errors[0] ?? classified.summary,
      });
      const watchdog = await inspectEventProviderWatchdog();
      return ok({ result, recovery, watchdog });
    }
    const watchdog = await runProviderWatchdogAfterSync({
      source: "urinvolved",
      publishable: result.catalog_publishable ?? result.success,
      importedCount: result.events_created + result.events_updated,
      errors: result.errors,
      skipped: result.skipped,
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
    return ok({ result, watchdog });
  } catch (error) {
    return fail(error);
  }
}
