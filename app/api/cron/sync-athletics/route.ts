import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import { runAthleticsSync } from "@/lib/server/eventSources/athleticsSync";
import { runProviderWatchdogAfterSync } from "@/lib/server/eventSources/providerWatchdog";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const result = await runAthleticsSync("cron");
    const watchdog = await runProviderWatchdogAfterSync({
      source: "athletics",
      publishable: result.success && !result.skipped,
      importedCount: result.eventsCreated + result.eventsUpdated,
      errors: result.errors,
      skipped: result.skipped,
      enableRecovery: false,
    });
    return ok({ result, watchdog });
  } catch (error) {
    return fail(error);
  }
}
