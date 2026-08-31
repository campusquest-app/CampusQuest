import { describe, expect, it } from "vitest";
import {
  estimateNextDailyCronUtc,
  formatAdminSyncErrorSummary,
  resolveProviderHealth,
} from "@/lib/eventSources/providerHealth";
import {
  EXTERNAL_SOURCE_ID_CONFLICT,
  isMissingOnConflictTargetError,
} from "@/lib/server/eventSources/upsertBySourceExternalId";

describe("provider health status", () => {
  const now = Date.parse("2026-08-31T12:00:00.000Z");

  it("does not label Athletics Not Connected when imported data exists", () => {
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
    // 184 events with success 4 days ago (>48h) → stale, not not_connected
    expect(health.status).toBe("stale");
    expect(health.label).not.toBe("Not Connected");
  });

  it("marks recent successful configured feed as Connected", () => {
    const health = resolveProviderHealth({
      source: "athletics",
      configured: true,
      activeEventsCount: 184,
      lastSuccessfulSync: "2026-08-31T08:00:00.000Z",
      lastAttemptedSync: "2026-08-31T08:00:00.000Z",
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
      lastAttemptedSync: "2026-08-31T03:45:00.000Z",
      lastStatus: "failed",
      lastError: "Org 379938: there is no unique or exclusion constraint matching the ON CONFLICT specification",
      nowMs: now,
    });
    expect(health.status).toBe("failed");
    expect(health.label).toBe("Failed");
  });

  it("reports Not Connected only when no feed and no inventory", () => {
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
  it("summarizes ON CONFLICT failures without dumping raw SQL as the primary message", () => {
    const summary = formatAdminSyncErrorSummary(
      "Org 379938: there is no unique or exclusion constraint matching the ON CONFLICT specification",
    );
    expect(summary.title).toBe("URInvolved Sync Failed");
    expect(summary.summary).toMatch(/could not be imported/i);
    expect(summary.technical).toMatch(/ON CONFLICT/i);
  });
});

describe("next cron estimate", () => {
  it("does not return a past timestamp as next sync", () => {
    const next = estimateNextDailyCronUtc({
      scheduled: true,
      cronHourUtc: 3,
      cronMinuteUtc: 0,
      nowMs: Date.parse("2026-08-31T12:00:00.000Z"),
    });
    expect(next).toBe("2026-09-01T03:00:00.000Z");
  });

  it("returns null when not scheduled", () => {
    expect(estimateNextDailyCronUtc({ scheduled: false })).toBeNull();
  });
});

describe("upsert conflict helpers", () => {
  it("uses the composite source,external_id conflict target", () => {
    expect(EXTERNAL_SOURCE_ID_CONFLICT).toBe("source,external_id");
  });

  it("detects missing ON CONFLICT target errors", () => {
    expect(
      isMissingOnConflictTargetError({
        code: "42P10",
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      }),
    ).toBe(true);
    expect(isMissingOnConflictTargetError({ code: "23505", message: "duplicate" })).toBe(false);
  });
});
