import { fail, ok } from "@/lib/server/http";
import { assertCronSecret } from "@/lib/server/urinvolved/cronAuth";
import {
  inspectCentralProviderHealth,
  recoveryLastErrorForProvider,
} from "@/lib/server/eventSources/providerHealthService";
import { runProviderRecoveryController } from "@/lib/server/eventSources/recoveryController";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Production health inspector. Does not run a duplicate healthy sync.
 * Invokes recovery only when a provider is already unhealthy.
 */
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const snapshot = await inspectCentralProviderHealth();
    const recoveries: Record<string, unknown> = {};
    for (const provider of snapshot.providers) {
      if (!provider.needsRecovery) continue;
      recoveries[provider.source] = await runProviderRecoveryController({
        source: provider.source,
        trigger: "health",
        lastError: recoveryLastErrorForProvider(snapshot, provider.source),
      });
    }
    const after = await inspectCentralProviderHealth();
    return ok({
      inspected: true,
      recoveries,
      health: after,
    });
  } catch (error) {
    return fail(error);
  }
}
