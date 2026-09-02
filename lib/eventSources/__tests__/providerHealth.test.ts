import { describe, expect, it } from "vitest";
import {
  estimateNextDailyCronUtc,
  formatAdminSyncErrorSummary,
  resolveProviderHealth,
} from "@/lib/eventSources/providerHealth";
import { EXTERNAL_SOURCE_ID_CONFLICT } from "@/lib/server/eventSources/upsertBySourceExternalId";

describe("provider health status", () => {
  const now = Date.parse("2026-09-02T12:00:00.000Z");

  it("shows Configuration Required for Athletics when feed env is missing", () => {
    const health = resolveProviderHealth({
      source: "athletics",
      configured: false,
      activeEventsCount: 184,
      lastSuccessfulSync: "2026-08-27T00:29:14.000Z",
      lastAttemptedSync: "2026-08-27T00:29:14.000Z",
      lastStatus: "success",
      lastError: "feed_not_configured",
      nowMs: now,
      staleAfterMs: 48 * 60 * 60 * 1000,
    });
    expect(health.status).toBe("configuration_required");
    expect(health.label).toBe("Configuration Required");
    expect(health.label).not.toBe("Stale");
    expect(health.message).toMatch(/URI_ATHLETICS_FEED_URL/);
  });

  it("marks recent successful configured feed as Connected", () => {
    const health = resolveProviderHealth({
      source: "athletics",
      configured: true,
      activeEventsCount: 184,
      lastSuccessfulSync: "2026-09-02T08:00:00.000Z",
      lastAttemptedSync: "2026-09-02T08:00:00.000Z",
      lastStatus: "success",
      lastError: null,
      nowMs: now,
    });
    expect(health).toMatchObject({ status: "connected", label: "Connected" });
  });

  it("reports Failed for failed sync attempts", () => {
    const health = resolveProviderHealth({
      source: "urinvolved",
      configured: true,
      activeEventsCount: 0,
      lastSuccessfulSync: "2026-08-25T03:45:00.000Z",
      lastAttemptedSync: "2026-09-02T03:45:00.000Z",
      lastStatus: "failed",
      lastError:
        "Org 379938 [external_organizations conflict target source,external_id]: there is no unique or exclusion constraint matching the ON CONFLICT specification",
      nowMs: now,
    });
    expect(health.status).toBe("failed");
    expect(health.label).toBe("Failed");
  });

  it("reports stale when configured but success is old", () => {
    const health = resolveProviderHealth({
      source: "athletics",
      configured: true,
      activeEventsCount: 184,
      lastSuccessfulSync: "2026-08-27T00:29:14.000Z",
      lastAttemptedSync: "2026-08-27T00:29:14.000Z",
      lastStatus: "success",
      lastError: null,
      nowMs: now,
      staleAfterMs: 48 * 60 * 60 * 1000,
    });
    expect(health.status).toBe("stale");
  });

  it("reports Not Connected only when no feed and no athletics inventory path", () => {
    const health = resolveProviderHealth({
      source: "fine_arts",
      configured: false,
      activeEventsCount: 0,
      lastSuccessfulSync: null,
      lastAttemptedSync: null,
      lastStatus: null,
      lastError: null,
      nowMs: now,
    });
    expect(health).toMatchObject({ status: "not_connected", label: "Not Connected" });
  });
});

describe("sync error presentation", () => {
  it("identifies failing table and conflict target for ON CONFLICT failures", () => {
    const summary = formatAdminSyncErrorSummary(
      "Org 379938 [external_organizations conflict target source,external_id]: there is no unique or exclusion constraint matching the ON CONFLICT specification",
    );
    expect(summary.title).toBe("URInvolved Sync Failed");
    expect(summary.summary).toMatch(/external_organizations/);
    expect(summary.summary).toMatch(/source,external_id/);
    expect(summary.technical).toMatch(/ON CONFLICT/i);
  });

  it("infers organization table from Org-prefixed legacy errors", () => {
    const summary = formatAdminSyncErrorSummary(
      "Org 379938: there is no unique or exclusion constraint matching the ON CONFLICT specification",
    );
    expect(summary.summary).toMatch(/external_organizations/);
    expect(summary.summary).toMatch(/source,external_id/);
  });
});

describe("next cron estimate", () => {
  it("does not return a past timestamp as next sync", () => {
    const next = estimateNextDailyCronUtc({
      scheduled: true,
      cronHourUtc: 3,
      cronMinuteUtc: 0,
      nowMs: Date.parse("2026-09-02T12:00:00.000Z"),
    });
    expect(next).toBe("2026-09-03T03:00:00.000Z");
  });
});

describe("conflict target constant", () => {
  it("matches the composite unique identity", () => {
    expect(EXTERNAL_SOURCE_ID_CONFLICT).toBe("source,external_id");
  });
});
