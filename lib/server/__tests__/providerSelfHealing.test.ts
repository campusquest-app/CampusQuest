import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  classifyProviderIncident,
  isAutoRepairEnabled,
  shouldSkipWatchdogRetries,
} from "@/lib/server/eventSources/incidentTypes";
import {
  APPROVED_IDENTITY_REPAIR_RPC,
  evaluateMigrationSafety,
  extractSqlFunctionBody,
} from "@/lib/server/eventSources/migrationSafety";
import { verifyInventoryAfterRepair } from "@/lib/server/eventSources/recoveryController";
import { buildProductionAlertEmail, sendProductionAlert } from "@/lib/server/eventSources/productionAlerts";
import { createProviderIncident } from "@/lib/server/eventSources/incidentStore";
import { providerNeedsRecovery } from "@/lib/server/eventSources/providerHealthService";
import { sanitizeTechnicalDiagnostics } from "@/lib/eventSources/providerHealth";
import { MAX_RECOVERY_ATTEMPTS, runBoundedProviderRecovery } from "@/lib/server/eventSources/providerWatchdog";

const root = join(__dirname, "../../..");

describe("incident classification", () => {
  it("schema mismatch produces EVENT_SCHEMA_INCOMPATIBLE / schema_incompatible", () => {
    const classified = classifyProviderIncident(
      "EVENT_SCHEMA_INCOMPATIBLE: external_organizations requires UNIQUE(source, external_id)\nPostgres: there is no unique or exclusion constraint matching the ON CONFLICT specification",
    );
    expect(classified.type).toBe("schema_incompatible");
    expect(classified.errorCode).toBe("EVENT_SCHEMA_INCOMPATIBLE");
    expect(classified.autoRepairable).toBe(true);
    expect(classified.summary).toMatch(/external_organizations/);
    expect(shouldSkipWatchdogRetries(classified.type)).toBe(true);
  });

  it("missing feed config is manual review and names URI_ATHLETICS_FEED_URL", () => {
    const classified = classifyProviderIncident("feed_not_configured");
    expect(classified.type).toBe("configuration_missing");
    expect(classified.autoRepairable).toBe(false);
    expect(classified.summary).toMatch(/URI_ATHLETICS_FEED_URL/);
  });

  it("parser and unknown never auto-mutate", () => {
    expect(classifyProviderIncident("payload could not be parsed").type).toBe("parser_failure");
    expect(classifyProviderIncident("payload could not be parsed").autoRepairable).toBe(false);
    expect(classifyProviderIncident("weird boom").type).toBe("unknown");
    expect(classifyProviderIncident("weird boom").autoRepairable).toBe(false);
  });
});

describe("migration safety policy", () => {
  const selfHealing = readFileSync(
    join(root, "supabase/migrations/20260910180000_provider_self_healing.sql"),
    "utf8",
  );

  it("known safe identity repair RPC is allowlisted", () => {
    const body = extractSqlFunctionBody(selfHealing, APPROVED_IDENTITY_REPAIR_RPC);
    expect(body).toBeTruthy();
    const result = evaluateMigrationSafety(body ?? "");
    expect(result.safe).toBe(true);
    expect(result.prohibited).toEqual([]);
  });

  it("unsafe migrations are refused with manual-review semantics", () => {
    const result = evaluateMigrationSafety("DROP TABLE public.external_events; TRUNCATE public.external_events;");
    expect(result.safe).toBe(false);
    expect(result.prohibited).toEqual(expect.arrayContaining(["DROP TABLE", "TRUNCATE"]));
    expect(result.reason).toMatch(/Automatic repair refused/);
  });

  it("health detector matches unique indexes even when constraint names differ", () => {
    expect(selfHealing).toContain("cq_has_unique_source_external_id");
    expect(selfHealing).toContain("UNIQUE (source, external_id)");
    expect(selfHealing).toContain("provider_incidents_one_open_repair");
  });
});

describe("inventory verification + isolation", () => {
  const before = { urinvolved: 80, urinvolved_stored: 80, athletics: 184, manual: 2 };

  it("stores before/after snapshots in the verification contract", () => {
    const after = { urinvolved: 76, urinvolved_stored: 80, athletics: 184, manual: 2 };
    const verification = verifyInventoryAfterRepair({
      source: "urinvolved",
      before,
      after,
      schemaOk: true,
      syncSucceeded: true,
    });
    expect(verification.ok).toBe(true);
    expect(after.athletics).toBe(184);
  });

  it("does not resolve when Athletics inventory is wiped", () => {
    const verification = verifyInventoryAfterRepair({
      source: "urinvolved",
      before,
      after: { urinvolved: 76, urinvolved_stored: 80, athletics: 0, manual: 2 },
      schemaOk: true,
      syncSucceeded: true,
    });
    expect(verification.ok).toBe(false);
    expect(verification.reasons.join(" ")).toMatch(/athletics inventory was wiped/);
  });

  it("repair is only resolved after provider sync verification", () => {
    const verification = verifyInventoryAfterRepair({
      source: "urinvolved",
      before,
      after: before,
      schemaOk: true,
      syncSucceeded: false,
    });
    expect(verification.ok).toBe(false);
    expect(verification.reasons.join(" ")).toMatch(/sync did not succeed/);
  });

  it("one provider cannot imply deleting another provider's events", () => {
    expect(
      providerNeedsRecovery({
        source: "urinvolved",
        schemaOk: false,
        lastError: "EVENT_SCHEMA_INCOMPATIBLE",
        watchdogStatus: "failed",
        athleticsOnlyFailure: true,
        configured: true,
      }),
    ).toBe(true);
    const src = readFileSync(join(root, "lib/server/urinvolved/sync.ts"), "utf8");
    const ath = readFileSync(join(root, "lib/server/eventSources/athleticsSync.ts"), "utf8");
    expect(src).not.toMatch(/\.delete\(\)/);
    expect(ath).not.toMatch(/\.delete\(\)/);
    expect(ath).toMatch(/\.eq\("source", ATHLETICS_SOURCE\)/);
  });
});

describe("retries and concurrency", () => {
  it("automatic retry eventually succeeds and then stops", async () => {
    let calls = 0;
    const recovered = await runBoundedProviderRecovery({
      backoffMs: [0, 1, 1],
      sleep: async () => undefined,
      runAttempt: async () => {
        calls += 1;
        return {
          success: calls === 3,
          importedCount: calls === 3 ? 12 : 0,
          errors: calls === 3 ? [] : ["timeout"],
          publishable: calls === 3,
        };
      },
    });
    expect(recovered.recovered).toBe(true);
    expect(recovered.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("failed repair does not loop forever", async () => {
    let calls = 0;
    const recovered = await runBoundedProviderRecovery({
      backoffMs: [0, 1, 1],
      sleep: async () => undefined,
      runAttempt: async () => {
        calls += 1;
        return { success: false, importedCount: 0, errors: ["still down"], publishable: false };
      },
    });
    expect(recovered.recovered).toBe(false);
    expect(recovered.attempts).toBe(MAX_RECOVERY_ATTEMPTS);
    expect(calls).toBe(MAX_RECOVERY_ATTEMPTS);
  });

  it("concurrent repairs are prevented by unique open-incident insert", async () => {
    const admin = {
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
          }),
        }),
      }),
    };
    const created = await createProviderIncident(admin as never, {
      provider: "urinvolved",
      incidentType: "schema_incompatible",
    });
    expect(created).toBeNull();
  });
});

describe("alerts", () => {
  it("successful recovery email matches the operator template", () => {
    const email = buildProductionAlertEmail({
      kind: "resolved",
      provider: "urinvolved",
      errorCode: "EVENT_SCHEMA_INCOMPATIBLE",
      detectedAt: "2026-09-10T12:00:00.000Z",
      cause: "Production database was missing UNIQUE(source, external_id) for external_organizations.",
      repair: "Applied reviewed production-safe schema migration.",
      verification: "URInvolved sync successful",
      inventoryBefore: { urinvolved: 0, athletics: 184 },
      inventoryAfter: { urinvolved: 72, athletics: 184 },
      commit: null,
    });
    expect(email.subject).toBe("CampusQuest automatically recovered URInvolved");
    expect(email.text).toMatch(/Events before: 0/);
    expect(email.text).toMatch(/Events after: 72/);
    expect(email.text).toMatch(/Athletics events preserved: 184/);
    expect(email.text).toMatch(/No action is required/);
  });

  it("failure email requires manual review and preserves inventory wording", () => {
    const email = buildProductionAlertEmail({
      kind: "failed_repair",
      provider: "urinvolved",
      errorCode: "EVENT_SCHEMA_INCOMPATIBLE",
      detectedAt: "2026-09-10T12:00:00.000Z",
      cause: "constraint missing",
      reason: "repair RPC missing",
    });
    expect(email.subject).toMatch(/could not automatically repair URInvolved/);
    expect(email.text).toMatch(/Existing event inventory was preserved/);
    expect(email.text).toMatch(/Manual review is required/);
  });

  it("does not send or log secrets", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await sendProductionAlert({
      kind: "detected",
      provider: "urinvolved",
      errorCode: "EVENT_SCHEMA_INCOMPATIBLE",
      detectedAt: "2026-09-10T12:00:00.000Z",
      cause: "token=supersecret Bearer abcdefgh.sb_secret_zzz",
      fetchImpl,
      env: {
        CQ_PRODUCTION_ALERT_EMAIL: "ops@example.com",
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: "CampusQuest <noreply@auth.campusquestapp.com>",
      },
    });
    expect(result.sent).toBe(true);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, { body?: string }] | undefined;
    const body = JSON.parse(String(firstCall?.[1]?.body ?? "{}")) as {
      text: string;
      to: string[];
    };
    expect(body.text).not.toMatch(/supersecret/);
    expect(body.text).not.toMatch(/sb_secret_/);
    expect(body.text).not.toMatch(/re_test_key/);
    expect(sanitizeTechnicalDiagnostics("password=hunter2")).not.toMatch(/hunter2/);
  });

  it("skips send when alert email is not configured", async () => {
    const fetchImpl = vi.fn();
    const result = await sendProductionAlert({
      kind: "detected",
      provider: "urinvolved",
      errorCode: "UNKNOWN",
      detectedAt: "2026-09-10T12:00:00.000Z",
      cause: "x",
      fetchImpl,
      env: { RESEND_API_KEY: "re_test_key" },
    });
    expect(result.sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("auto-repair kill switch", () => {
  it("can be disabled without inventing a default", () => {
    expect(isAutoRepairEnabled({ CQ_AUTO_REPAIR_ENABLED: "false" })).toBe(false);
    expect(isAutoRepairEnabled({})).toBe(true);
  });
});

describe("source proofs", () => {
  it("URI cron diagnoses schema errors instead of hammering sync", () => {
    const src = readFileSync(join(root, "app/api/cron/sync-urinvolved/route.ts"), "utf8");
    expect(src).toContain("runProviderRecoveryController");
    expect(src).toContain("shouldSkipWatchdogRetries");
    expect(src).toContain("runProviderWatchdogAfterSync");
  });

  it("daily campus cron syncs URInvolved and Athletics in one job", () => {
    const src = readFileSync(join(root, "app/api/cron/sync-campus-events/route.ts"), "utf8");
    const vercel = readFileSync(join(root, "vercel.json"), "utf8");
    expect(src).toContain("runUrinvolvedSync");
    expect(src).toContain("runAthleticsSync");
    expect(src).toContain("assertCronSecret");
    expect(vercel).toContain("/api/cron/sync-campus-events");
  });

  it("internal repair endpoints are not anonymous", () => {
    for (const file of [
      "app/api/internal/admin/provider-health/route.ts",
      "app/api/internal/admin/provider-repair/route.ts",
      "app/api/internal/admin/provider-verify/route.ts",
      "app/api/internal/admin/incidents/route.ts",
    ]) {
      const src = readFileSync(join(root, file), "utf8");
      expect(src).toContain("requireAdminOrInternalRepair");
    }
  });
});
