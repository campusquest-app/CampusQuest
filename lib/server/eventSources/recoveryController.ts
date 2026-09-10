import { createAdminClient } from "@/lib/server/supabase";
import { probeExternalIdentitySchemaHealth } from "@/lib/server/eventSources/schemaHealth";
import { APPROVED_IDENTITY_REPAIR_RPC } from "@/lib/server/eventSources/migrationSafety";
import { classifyProviderIncident, isAutoRepairEnabled } from "@/lib/server/eventSources/incidentTypes";
import {
  countUpcomingEventsForSource,
  getEventProviderHealth,
  upsertEventProviderHealth,
} from "@/lib/server/eventSources/providerHealthStore";
import { getLatestSyncBySource } from "@/lib/server/eventSources/syncLogs";
import {
  createProviderIncident,
  findOpenRepairIncident,
  findRecentActiveIncident,
  updateProviderIncident,
  type ProviderIncidentRow,
} from "@/lib/server/eventSources/incidentStore";
import { sendProductionAlert } from "@/lib/server/eventSources/productionAlerts";
import { runBoundedProviderRecovery, defaultWatchdogSleep } from "@/lib/server/eventSources/providerWatchdog";
import { runUrinvolvedSync } from "@/lib/server/urinvolved/sync";
import { runAthleticsSync } from "@/lib/server/eventSources/athleticsSync";

type AdminClient = ReturnType<typeof createAdminClient>;

export type InventorySnapshot = {
  urinvolved: number;
  urinvolved_stored: number;
  athletics: number;
  manual: number;
};

export type RecoveryControllerResult = {
  status: "not_needed" | "in_progress" | "resolved" | "manual_review_required" | "failed_repair" | "skipped_disabled";
  incidentId: string | null;
  repairAction: string | null;
  inventoryBefore: InventorySnapshot | null;
  inventoryAfter: InventorySnapshot | null;
  verification: { ok: boolean; reasons: string[] } | null;
};

export async function snapshotProviderInventory(admin: AdminClient): Promise<InventorySnapshot> {
  const [urinvolved, urinvolvedStored, athletics, manual] = await Promise.all([
    countUpcomingEventsForSource(admin, "urinvolved", { activeOnly: true }),
    countUpcomingEventsForSource(admin, "urinvolved", { activeOnly: false }),
    countUpcomingEventsForSource(admin, "athletics", { activeOnly: true }),
    countUpcomingEventsForSource(admin, "manual", { activeOnly: true }),
  ]);
  return {
    urinvolved,
    urinvolved_stored: urinvolvedStored,
    athletics,
    manual,
  };
}

export function verifyInventoryAfterRepair(input: {
  source: string;
  before: InventorySnapshot;
  after: InventorySnapshot;
  schemaOk: boolean;
  syncSucceeded?: boolean;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.schemaOk) reasons.push("schema invariant still missing");
  const athleticsBefore = input.before.athletics;
  if (athleticsBefore >= 5 && input.after.athletics === 0) {
    reasons.push("athletics inventory was wiped");
  }
  if (input.source === "urinvolved" && input.syncSucceeded) {
    if (input.after.urinvolved === 0 && input.after.urinvolved_stored === 0 && input.before.urinvolved_stored === 0) {
      reasons.push("URInvolved active event count is unexpectedly zero");
    }
  }
  if (input.source === "urinvolved" && input.syncSucceeded === false) {
    reasons.push("provider sync did not succeed after repair");
  }
  if (input.source === "urinvolved" && input.before.manual > 0 && input.after.manual === 0) {
    reasons.push("manual events were removed");
  }
  return { ok: reasons.length === 0, reasons };
}

function recoveryLog(fields: Record<string, unknown>) {
  console.info("[cq:provider-recovery]", { system: "provider-recovery", ...fields });
}

async function applyIdentityRepair(admin: AdminClient): Promise<{ ok: boolean; message: string; rpcMissing: boolean }> {
  const { data, error } = await admin.rpc(APPROVED_IDENTITY_REPAIR_RPC);
  if (error) {
    const rpcMissing = /could not find the function|PGRST202|42883/i.test(error.message);
    return { ok: false, message: error.message, rpcMissing };
  }
  const health = (data ?? {}) as { ok?: boolean; message?: string };
  return { ok: Boolean(health.ok), message: String(health.message ?? "repair rpc returned"), rpcMissing: false };
}

async function retryProviderSync(source: "urinvolved" | "athletics") {
  if (source === "athletics") {
    const result = await runAthleticsSync("api");
    return {
      success: result.success && !result.skipped,
      skipped: result.skipped,
      importedCount: result.eventsCreated + result.eventsUpdated,
      errors: result.errors,
      publishable: result.success && !result.skipped,
    };
  }
  const result = await runUrinvolvedSync("api");
  return {
    success: result.success,
    skipped: result.skipped,
    importedCount: result.events_created + result.events_updated,
    errors: result.errors,
    publishable: result.catalog_publishable ?? result.success,
  };
}

export async function runProviderRecoveryController(input: {
  source: "urinvolved" | "athletics";
  trigger: "cron" | "admin" | "health" | "post_deploy";
  lastError?: string | null;
  skipSyncRetry?: boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<RecoveryControllerResult> {
  const admin = createAdminClient();
  const source = input.source;
  const [schema, latest, healthRow] = await Promise.all([
    probeExternalIdentitySchemaHealth(admin),
    getLatestSyncBySource(admin, source),
    getEventProviderHealth(admin, source),
  ]);
  const lastError = input.lastError ?? healthRow?.last_error ?? latest.lastError ?? (!schema.ok ? schema.message : null);
  const classified = classifyProviderIncident(lastError);

  const looksHealthy =
    schema.ok &&
    !lastError &&
    (healthRow?.status === "healthy" || latest.lastStatus === "success");
  if (looksHealthy && classified.type === "unknown" && !lastError) {
    return {
      status: "not_needed",
      incidentId: null,
      repairAction: null,
      inventoryBefore: null,
      inventoryAfter: null,
      verification: null,
    };
  }

  if (!lastError && schema.ok && (healthRow?.status === "healthy" || !healthRow)) {
    return {
      status: "not_needed",
      incidentId: null,
      repairAction: null,
      inventoryBefore: null,
      inventoryAfter: null,
      verification: null,
    };
  }

  const open = await findOpenRepairIncident(admin, source);
  if (open) {
    return {
      status: "in_progress",
      incidentId: open.id,
      repairAction: open.repair_action,
      inventoryBefore: (open.inventory_before as InventorySnapshot) ?? null,
      inventoryAfter: null,
      verification: null,
    };
  }

  if (input.trigger !== "admin") {
    const recentWindowMs =
      classified.type === "configuration_missing" ? 24 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
    const recent = await findRecentActiveIncident(admin, source, recentWindowMs);
    if (recent && recent.incident_type === classified.type) {
      return {
        status: recent.status === "failed_repair" ? "failed_repair" : "in_progress",
        incidentId: recent.id,
        repairAction: recent.repair_action,
        inventoryBefore: (recent.inventory_before as InventorySnapshot) ?? null,
        inventoryAfter: null,
        verification: null,
      };
    }
  }

  const inventoryBefore = await snapshotProviderInventory(admin);
  const incident = await createProviderIncident(admin, {
    provider: source,
    incidentType: classified.type,
    errorCode: classified.errorCode,
    errorMessage: classified.summary,
    technicalDetails: lastError,
    lastSuccessAt: healthRow?.last_success_at ?? latest.lastSuccessfulSync,
    inventoryBefore,
    status: "diagnosing",
    metadata: { trigger: input.trigger, autoRepairable: classified.autoRepairable },
  });

  if (!incident) {
    const raced = await findOpenRepairIncident(admin, source);
    return {
      status: raced ? "in_progress" : "failed_repair",
      incidentId: raced?.id ?? null,
      repairAction: null,
      inventoryBefore,
      inventoryAfter: null,
      verification: null,
    };
  }

  recoveryLog({
    provider: source,
    incident_id: incident.id,
    error_code: classified.errorCode,
    repair_action: "diagnosing",
    result: "detected",
  });

  await upsertEventProviderHealth(admin, {
    source,
    status: "repairing",
    current_event_count: inventoryBefore[source === "athletics" ? "athletics" : "urinvolved"],
    last_good_event_count: healthRow?.last_good_event_count ?? 0,
    latest_import_count: healthRow?.latest_import_count ?? 0,
    consecutive_failures: healthRow?.consecutive_failures ?? 0,
    last_error: classified.summary,
  });

  const finish = async (
    status: RecoveryControllerResult["status"],
    patch: Partial<ProviderIncidentRow> & { repair_action?: string | null },
    verification: RecoveryControllerResult["verification"],
    inventoryAfter: InventorySnapshot | null,
    alertKind: "resolved" | "failed_repair" | "detected",
  ): Promise<RecoveryControllerResult> => {
    await updateProviderIncident(admin, incident.id, {
      status:
        status === "not_needed"
          ? "resolved"
          : status === "in_progress" || status === "skipped_disabled"
            ? "repairing"
            : status,
      repair_action: patch.repair_action ?? null,
      repair_attempts: patch.repair_attempts,
      attempted_at: new Date().toISOString(),
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      inventory_after: inventoryAfter ?? {},
      error_message: patch.error_message,
      technical_details: patch.technical_details,
    });
    recoveryLog({
      provider: source,
      incident_id: incident.id,
      error_code: classified.errorCode,
      repair_action: patch.repair_action,
      result: status,
    });
    if (status !== "in_progress") {
      const healthStatus =
        status === "resolved"
          ? "healthy"
          : classified.type === "configuration_missing"
            ? "configuration_required"
            : "failed";
      await upsertEventProviderHealth(admin, {
        source,
        status: healthStatus,
        current_event_count: (inventoryAfter ?? inventoryBefore)[source === "athletics" ? "athletics" : "urinvolved"],
        last_good_event_count: healthRow?.last_good_event_count ?? 0,
        latest_import_count: healthRow?.latest_import_count ?? 0,
        consecutive_failures: status === "resolved" ? 0 : (healthRow?.consecutive_failures ?? 0) + 1,
        last_error: status === "resolved" ? null : patch.error_message ?? classified.summary,
      });
      await sendProductionAlert({
        kind: alertKind,
        provider: source,
        errorCode: classified.errorCode,
        detectedAt: incident.detected_at,
        cause: classified.summary,
        repair: patch.repair_action,
        verification: verification?.ok
          ? "Provider verification succeeded."
          : verification?.reasons.join("; ") ?? null,
        inventoryBefore,
        inventoryAfter: inventoryAfter ?? undefined,
        reason: patch.error_message,
      });
    }
    return {
      status,
      incidentId: incident.id,
      repairAction: patch.repair_action ?? null,
      inventoryBefore,
      inventoryAfter,
      verification,
    };
  };

  if (!isAutoRepairEnabled() && input.trigger !== "admin") {
    return finish(
      "manual_review_required",
      {
        repair_action: "auto_repair_disabled",
        error_message: "CQ_AUTO_REPAIR_ENABLED is false. Automatic repair did not run.",
      },
      { ok: false, reasons: ["auto-repair disabled"] },
      inventoryBefore,
      "detected",
    );
  }

  if (classified.type === "configuration_missing") {
    return finish(
      "manual_review_required",
      {
        repair_action: "none",
        error_message: classified.summary,
      },
      { ok: false, reasons: [classified.summary] },
      inventoryBefore,
      "detected",
    );
  }

  if (classified.type === "schema_incompatible" || classified.type === "missing_migration") {
    await updateProviderIncident(admin, incident.id, { status: "repairing", repair_action: APPROVED_IDENTITY_REPAIR_RPC });
    const repaired = await applyIdentityRepair(admin);
    if (repaired.rpcMissing) {
      return finish(
        "manual_review_required",
        {
          repair_action: "apply_self_healing_migration",
          error_message:
            "Apply supabase/migrations/20260910180000_provider_self_healing.sql (and 20260905190000 if still pending), then retry provider repair.",
        },
        { ok: false, reasons: ["repair RPC missing"] },
        inventoryBefore,
        "detected",
      );
    }
    if (!repaired.ok) {
      return finish(
        "failed_repair",
        {
          repair_action: APPROVED_IDENTITY_REPAIR_RPC,
          error_message: repaired.message,
        },
        { ok: false, reasons: [repaired.message] },
        inventoryBefore,
        "failed_repair",
      );
    }

    await updateProviderIncident(admin, incident.id, { status: "verifying", repair_action: APPROVED_IDENTITY_REPAIR_RPC });
    let syncSucceeded: boolean | undefined;
    if (!input.skipSyncRetry) {
      const retry = await retryProviderSync(source);
      syncSucceeded = retry.publishable || retry.success;
    }
    const schemaAfter = await probeExternalIdentitySchemaHealth(admin);
    const inventoryAfter = await snapshotProviderInventory(admin);
    const verification = verifyInventoryAfterRepair({
      source,
      before: inventoryBefore,
      after: inventoryAfter,
      schemaOk: schemaAfter.ok,
      syncSucceeded,
    });
    if (verification.ok && schemaAfter.ok && (input.skipSyncRetry || syncSucceeded)) {
      return finish(
        "resolved",
        {
          repair_action: APPROVED_IDENTITY_REPAIR_RPC,
          repair_attempts: 1,
        },
        verification,
        inventoryAfter,
        "resolved",
      );
    }
    return finish(
      "failed_repair",
      {
        repair_action: APPROVED_IDENTITY_REPAIR_RPC,
        repair_attempts: 1,
        error_message:
          verification.reasons.join("; ") ||
          (!syncSucceeded ? "schema repaired but provider sync did not verify" : "verification failed"),
      },
      verification,
      inventoryAfter,
      "failed_repair",
    );
  }

  if (
    classified.type === "provider_fetch_failure" ||
    classified.type === "rate_limit" ||
    classified.type === "database_failure"
  ) {
    await updateProviderIncident(admin, incident.id, { status: "repairing", repair_action: "bounded_retry" });
    const recovered = await runBoundedProviderRecovery({
      sleep: input.sleep ?? defaultWatchdogSleep,
      runAttempt: async () => retryProviderSync(source),
    });
    const schemaAfter = await probeExternalIdentitySchemaHealth(admin);
    const inventoryAfter = await snapshotProviderInventory(admin);
    const verification = verifyInventoryAfterRepair({
      source,
      before: inventoryBefore,
      after: inventoryAfter,
      schemaOk: schemaAfter.ok,
      syncSucceeded: recovered.recovered,
    });
    if (recovered.recovered && verification.ok) {
      return finish(
        "resolved",
        { repair_action: "bounded_retry", repair_attempts: recovered.attempts },
        verification,
        inventoryAfter,
        "resolved",
      );
    }
    return finish(
      "failed_repair",
      {
        repair_action: "bounded_retry",
        repair_attempts: recovered.attempts,
        error_message: recovered.lastResult?.errors[0] ?? "retries exhausted",
      },
      verification,
      inventoryAfter,
      "failed_repair",
    );
  }

  if (classified.type === "authentication_failure") {
    await updateProviderIncident(admin, incident.id, { status: "repairing", repair_action: "limited_auth_retry" });
    const retry = await retryProviderSync(source);
    if (retry.success || retry.publishable) {
      const inventoryAfter = await snapshotProviderInventory(admin);
      const schemaAfter = await probeExternalIdentitySchemaHealth(admin);
      const verification = verifyInventoryAfterRepair({
        source,
        before: inventoryBefore,
        after: inventoryAfter,
        schemaOk: schemaAfter.ok,
        syncSucceeded: true,
      });
      return finish(
        verification.ok ? "resolved" : "failed_repair",
        { repair_action: "limited_auth_retry", repair_attempts: 1 },
        verification,
        inventoryAfter,
        verification.ok ? "resolved" : "failed_repair",
      );
    }
    return finish(
      "manual_review_required",
      { repair_action: "limited_auth_retry", repair_attempts: 1, error_message: classified.summary },
      { ok: false, reasons: [classified.summary] },
      inventoryBefore,
      "detected",
    );
  }

  return finish(
    "manual_review_required",
    { repair_action: "none", error_message: classified.summary },
    { ok: false, reasons: [classified.summary] },
    inventoryBefore,
    "detected",
  );
}

export async function runProviderVerification(source: "urinvolved" | "athletics" = "urinvolved") {
  const admin = createAdminClient();
  const [schema, inventory, latest] = await Promise.all([
    probeExternalIdentitySchemaHealth(admin),
    snapshotProviderInventory(admin),
    getLatestSyncBySource(admin, source),
  ]);
  return {
    schemaOk: schema.ok,
    schema,
    inventory,
    lastStatus: latest.lastStatus,
    lastError: latest.lastError,
    athleticsPreserved: inventory.athletics > 0 || latest.source === source,
  };
}
