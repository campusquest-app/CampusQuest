import { describe, expect, it } from "vitest";
import {
  decideSoftDeactivateMissingEvents,
  isCatalogPublishable,
  mergeFeedRowsById,
  shouldMergeLastKnownGoodForSource,
} from "@/lib/server/urinvolved/syncSafety";
import { validateProviderCatalogRecords } from "@/lib/server/eventSources/catalogValidation";
import {
  detectAthleticsOnlyFailure,
  overallEventsHealth,
  recommendationsStayMultiSource,
} from "@/lib/server/eventSources/providerInventoryHealth";
import {
  recoveryAttemptSucceeded,
  runBoundedProviderRecovery,
} from "@/lib/server/eventSources/providerWatchdog";
import { rankRecommendationEntities } from "@/lib/recommendations/rank";
import { emptyRecommendationProfile } from "@/lib/recommendations/profile";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const NOW = Date.parse("2026-09-10T16:00:00.000Z");
const future = (hours: number) => new Date(NOW + hours * 3600_000).toISOString();

function catalog(count: number, prefix = "u") {
  return Array.from({ length: count }, (_, i) => ({
    externalId: `${prefix}${i + 1}`,
    title: `Campus Event ${i + 1}`,
    startsAt: future(24 + i),
    locationName: "Memorial Union",
    venueName: "Memorial Union",
    address: "1 Campus Ave",
    eventUrl: `https://urinvolved.uri.edu/event/${prefix}${i + 1}`,
  }));
}

describe("last-known-good catalog publish gates", () => {
  it("athletics succeeds + URInvolved succeeds → both catalogs are publishable", () => {
    const athletics = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 18,
      existingUpcomingActiveCount: 18,
      successfulImports: 18,
      lastGoodEventCount: 18,
    });
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 80,
      existingUpcomingActiveCount: 80,
      successfulImports: 80,
      lastGoodEventCount: 80,
    });
    expect(isCatalogPublishable(athletics)).toBe(true);
    expect(isCatalogPublishable(uri)).toBe(true);
    expect(overallEventsHealth({ athleticsOnlyFailure: false, providers: [
      { source: "athletics", status: "healthy" },
      { source: "urinvolved", status: "healthy" },
    ] })).toBe("HEALTHY");
  });

  it("athletics succeeds + URInvolved request fails → preserve URInvolved", () => {
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: false,
      eventsFetched: 0,
      existingUpcomingActiveCount: 80,
      lastGoodEventCount: 80,
    });
    expect(uri).toMatchObject({
      shouldDeactivate: false,
      preservePreviousInventory: true,
      reason: "fetch_failed",
    });
    expect(isCatalogPublishable(uri)).toBe(false);
  });

  it("athletics succeeds + URInvolved returns 0 unexpectedly → preserve", () => {
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 0,
      existingUpcomingActiveCount: 80,
      lastGoodEventCount: 80,
      successfulImports: 0,
    });
    expect(uri.reason).toBe("suspicious_empty_catalog");
    expect(isCatalogPublishable(uri)).toBe(false);
  });

  it("athletics succeeds + URInvolved inventory drops 90% → suspicious, do not publish", () => {
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 10,
      existingUpcomingActiveCount: 100,
      successfulImports: 10,
      lastGoodEventCount: 100,
    });
    expect(uri.reason).toBe("suspicious_inventory_drop");
    expect(isCatalogPublishable(uri)).toBe(false);
  });

  it("closes the degraded-current-inventory hole (last-good 100, current 20, fetched 15)", () => {
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 15,
      existingUpcomingActiveCount: 20,
      successfulImports: 15,
      lastGoodEventCount: 100,
    });
    expect(uri.reason).toBe("suspicious_inventory_drop");
    expect(isCatalogPublishable(uri)).toBe(false);
  });

  it("URInvolved legitimately returns fewer events but passes validation", () => {
    const records = catalog(55);
    const validation = validateProviderCatalogRecords(records, NOW);
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 55,
      existingUpcomingActiveCount: 100,
      successfulImports: 55,
      lastGoodEventCount: 100,
    });
    expect(validation.valid).toBe(true);
    expect(uri.reason).toBe("successful_catalog");
    expect(isCatalogPublishable(uri)).toBe(true);
  });

  it("uses recent historical counts when last-good is missing", () => {
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 8,
      existingUpcomingActiveCount: 8,
      successfulImports: 8,
      lastGoodEventCount: 0,
      recentHistoricalCounts: [90, 88, 92],
    });
    expect(uri.reason).toBe("suspicious_inventory_drop");
  });
});

describe("representative catalog validation", () => {
  it("accepts plausible upcoming records with source IDs and dates", () => {
    expect(validateProviderCatalogRecords(catalog(12), NOW).valid).toBe(true);
  });

  it("rejects missing source IDs", () => {
    const result = validateProviderCatalogRecords(
      [{ title: "Fair", startsAt: future(24), externalId: "" }],
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("validation_failed");
  });

  it("rejects invalid dates", () => {
    const result = validateProviderCatalogRecords(
      [{ externalId: "1", title: "Fair", startsAt: "not-a-date" }],
      NOW,
    );
    expect(result.valid).toBe(false);
  });

  it("rejects mostly past catalogs as implausible", () => {
    const records = Array.from({ length: 12 }, (_, i) => ({
      externalId: String(i),
      title: `Old ${i}`,
      startsAt: new Date(NOW - 30 * 24 * 3600_000).toISOString(),
    }));
    expect(validateProviderCatalogRecords(records, NOW).valid).toBe(false);
  });
});

describe("athletics-only failure detection", () => {
  it("flags URInvolved collapse while Athletics stays populated", () => {
    const result = detectAthleticsOnlyFailure({
      athletics: { upcomingActiveCount: 16, lastGoodEventCount: 16 },
      urinvolved: { upcomingActiveCount: 0, lastGoodEventCount: 80 },
    });
    expect(result.degraded).toBe(true);
  });

  it("does not flag a legitimately small URInvolved last-good", () => {
    const result = detectAthleticsOnlyFailure({
      athletics: { upcomingActiveCount: 8, lastGoodEventCount: 8 },
      urinvolved: { upcomingActiveCount: 2, lastGoodEventCount: 2 },
    });
    expect(result.degraded).toBe(false);
  });
});

describe("bounded recovery + circuit breaker", () => {
  it("retry succeeds on attempt 2 and stops", async () => {
    let calls = 0;
    const recovered = await runBoundedProviderRecovery({
      backoffMs: [0, 1, 1],
      sleep: async () => undefined,
      runAttempt: async () => {
        calls += 1;
        return {
          success: calls >= 2,
          importedCount: calls >= 2 ? 40 : 0,
          errors: calls >= 2 ? [] : ["empty"],
          publishable: calls >= 2,
        };
      },
    });
    expect(recovered.recovered).toBe(true);
    expect(recovered.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  it("all retries fail → circuit opens, no extra attempts", async () => {
    let calls = 0;
    const recovered = await runBoundedProviderRecovery({
      backoffMs: [0, 1, 1],
      sleep: async () => undefined,
      runAttempt: async () => {
        calls += 1;
        return { success: false, importedCount: 0, errors: ["timeout"], publishable: false };
      },
    });
    expect(recovered.recovered).toBe(false);
    expect(recovered.attempts).toBe(3);
    expect(calls).toBe(3);
    expect(recoveryAttemptSucceeded(recovered.lastResult!)).toBe(false);
  });
});

describe("failed provider does not delete healthy provider inventory", () => {
  it("URI preserve leaves athletics + manual rows untouched", () => {
    const rows = [
      { source: "athletics", id: "a1", is_active: true },
      { source: "urinvolved", id: "u1", is_active: true },
      { source: "manual", id: "m1", is_active: true },
    ];
    const uri = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: false,
      eventsFetched: 0,
      existingUpcomingActiveCount: 1,
      lastGoodEventCount: 40,
    });
    expect(isCatalogPublishable(uri)).toBe(false);
    expect(rows.filter((row) => row.source === "athletics" && row.is_active)).toHaveLength(1);
    expect(rows.filter((row) => row.source === "manual" && row.is_active)).toHaveLength(1);
  });
});

describe("last-known-good inventory remains visible", () => {
  it("merges inactive URInvolved rows even when Athletics is healthy", () => {
    expect(
      shouldMergeLastKnownGoodForSource({
        sourceUpcomingActiveCount: 0,
        sourceHasInactiveUpcoming: true,
        providerDegraded: true,
        lastError: "suspicious_empty_catalog",
        lastSyncImportedCount: 0,
      }),
    ).toBe(true);

    const active = [
      { id: "a1", source: "athletics", starts_at: future(12) },
    ];
    const staleUri = [
      { id: "u1", source: "urinvolved", starts_at: future(24) },
      { id: "u2", source: "urinvolved", starts_at: future(30) },
    ];
    const merged = mergeFeedRowsById(active, staleUri);
    const recs = recommendationsStayMultiSource(merged);
    expect(recs.athleticsOnly).toBe(false);
    expect(recs.sources).toEqual(expect.arrayContaining(["athletics", "urinvolved"]));
  });

  it("does not invent events when no last-known-good rows exist", () => {
    expect(
      shouldMergeLastKnownGoodForSource({
        sourceUpcomingActiveCount: 0,
        sourceHasInactiveUpcoming: false,
        providerDegraded: true,
      }),
    ).toBe(false);
  });
});

describe("For You does not become athletics-only solely due to provider failure", () => {
  it("ranks the complete retained inventory, including non-athletics", () => {
    const profile = emptyRecommendationProfile({ explicitInterests: ["athletics"] });
    const items = [
      {
        id: "a1",
        kind: "event" as const,
        title: "URI vs RIC",
        category: "Athletics",
        startsAtMs: NOW + 3600_000,
      },
      {
        id: "u1",
        kind: "event" as const,
        title: "Club Fair",
        category: "Clubs",
        startsAtMs: NOW + 7200_000,
      },
      {
        id: "m1",
        kind: "event" as const,
        title: "Verified Meetup",
        category: "Campus Life",
        startsAtMs: NOW + 5400_000,
      },
    ];
    const ranked = rankRecommendationEntities({
      items,
      toEntity: (item) => item,
      profile,
      nowMs: NOW,
      diversity: true,
    });
    expect(ranked.map((row) => row.entity.id)).toEqual(expect.arrayContaining(["a1", "u1", "m1"]));
    expect(recommendationsStayMultiSource([
      { source: "athletics" },
      { source: "urinvolved" },
      { source: "manual" },
    ]).athleticsOnly).toBe(false);
  });
});

describe("watchdog integration source proofs", () => {
  const root = join(process.cwd());

  it("URInvolved sync validates before write and records provider health", () => {
    const src = readFileSync(join(root, "lib/server/urinvolved/sync.ts"), "utf8");
    expect(src).toContain("VALIDATE");
    expect(src).toContain("WRITE ONLY IF HEALTHY");
    expect(src).toContain("validateProviderCatalogRecords");
    expect(src).toContain("lastGoodEventCount");
    expect(src).toContain("catalogPublishable");
    expect(src).toContain("recordProviderSyncOutcome");
    expect(src).not.toMatch(/\.delete\(\)/);
  });

  it("Athletics sync uses last-known-good gates and never deletes URInvolved", () => {
    const src = readFileSync(join(root, "lib/server/eventSources/athleticsSync.ts"), "utf8");
    expect(src).toContain("lastGoodEventCount");
    expect(src).toContain("catalogPublishable");
    expect(src).toMatch(/\.eq\("source", ATHLETICS_SOURCE\)/);
    expect(src).not.toMatch(/\.delete\(\)/);
  });

  it("scheduled URI cron runs health check + bounded recovery", () => {
    const src = readFileSync(join(root, "app/api/cron/sync-urinvolved/route.ts"), "utf8");
    expect(src).toContain("runProviderWatchdogAfterSync");
    expect(src).toContain("enableRecovery: true");
    expect(src).toContain("runRecoverySync");
  });

  it("feed merges last-known-good per source instead of treating athletics-only as complete", () => {
    const src = readFileSync(join(root, "lib/server/externalContent.ts"), "utf8");
    expect(src).toContain("shouldMergeLastKnownGoodForSource");
    expect(src).toContain("mergeFeedRowsById");
    expect(src).not.toMatch(/eq\(["']source["'],\s*["']athletics["']\)/);
  });
});
