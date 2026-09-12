import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideSoftDeactivateMissingEvents,
  filterSafeDeactivationIds,
  idsMissingFromSeen,
} from "@/lib/server/urinvolved/syncSafety";
import { EXTERNAL_SOURCE_ID_CONFLICT } from "@/lib/server/eventSources/upsertBySourceExternalId";
import { canonicalEventCategory } from "@/lib/eventSources/categories";

const root = join(__dirname, "../../..");

/**
 * Regression dataset: multi-source inventory that must never collapse to Athletics-only
 * because of sync isolation bugs.
 */
function seedInventory() {
  return [
    { source: "athletics", external_id: "a1", is_active: true, title: "URI vs RIC" },
    { source: "athletics", external_id: "a2", is_active: true, title: "URI vs Providence" },
    { source: "athletics", external_id: "a3", is_active: true, title: "URI vs UMass" },
    { source: "urinvolved", external_id: "u1", is_active: true, title: "Club Fair" },
    { source: "urinvolved", external_id: "u2", is_active: true, title: "Bingo Night" },
    { source: "urinvolved", external_id: "u3", is_active: true, title: "Career Mixer" },
    { source: "manual", external_id: "manual:1", is_active: true, title: "Verified Meetup" },
    { source: "manual", external_id: "manual:2", is_active: true, title: "Verified Panel" },
  ];
}

function applySourceScopedSoftDeactivate(
  rows: ReturnType<typeof seedInventory>,
  source: string,
  seenExternalIds: string[],
  opts: { eventsFetched: number; successfulImports: number },
) {
  const activeForSource = rows.filter((r) => r.source === source && r.is_active);
  const decision = decideSoftDeactivateMissingEvents({
    fetchAttempted: true,
    fetchSucceeded: true,
    eventsFetched: opts.eventsFetched,
    existingUpcomingActiveCount: activeForSource.length,
    successfulImports: opts.successfulImports,
  });
  if (!decision.shouldDeactivate) return { rows, decision, deactivated: [] as string[] };

  const missing = idsMissingFromSeen(
    activeForSource.map((r) => r.external_id),
    seenExternalIds,
  );
  const safe = filterSafeDeactivationIds({
    missingIds: missing,
    activeCount: activeForSource.length,
  });
  if (safe.blocked) return { rows, decision: { ...decision, shouldDeactivate: false }, deactivated: [] };

  const deactivated = new Set(safe.ids);
  const next = rows.map((r) =>
    r.source === source && deactivated.has(r.external_id) ? { ...r, is_active: false } : r,
  );
  return { rows: next, decision, deactivated: Array.from(deactivated) };
}

describe("Events multi-source regression dataset (A–F inventory)", () => {
  it("All => 8 active across athletics + urinvolved + manual", () => {
    const rows = seedInventory();
    expect(rows.filter((r) => r.is_active)).toHaveLength(8);
    expect(rows.filter((r) => r.source === "athletics")).toHaveLength(3);
    expect(rows.filter((r) => r.source === "urinvolved")).toHaveLength(3);
    expect(rows.filter((r) => r.source === "manual")).toHaveLength(2);
  });

  it("Athletics filter => 3; Clubs candidate pool includes URInvolved", () => {
    const rows = seedInventory();
    const athletics = rows.filter((r) => canonicalEventCategory({ source: r.source, title: r.title }) === "Athletics");
    const clubs = rows.filter((r) => canonicalEventCategory({ source: r.source, title: r.title }) === "Clubs");
    expect(athletics).toHaveLength(3);
    expect(clubs.length).toBeGreaterThan(0);
    expect(clubs.every((r) => r.source === "urinvolved")).toBe(true);
  });

  it("For You candidate pool contains multiple sources", () => {
    const sources = new Set(seedInventory().map((r) => r.source));
    expect(sources.has("athletics")).toBe(true);
    expect(sources.has("urinvolved")).toBe(true);
    expect(sources.has("manual")).toBe(true);
  });
});

describe("provider sync isolation", () => {
  it("after Athletics sync soft-deactivate, URInvolved + manual remain active", () => {
    const seeded = seedInventory();
    // Athletics sync only saw a1,a2 — would try to deactivate a3
    const { rows } = applySourceScopedSoftDeactivate(seeded, "athletics", ["a1", "a2"], {
      eventsFetched: 3,
      successfulImports: 3,
    });
    // With activeCount=3 and missing=1, ratio 1/3 < 0.5 → a3 may deactivate
    expect(rows.filter((r) => r.source === "urinvolved" && r.is_active)).toHaveLength(3);
    expect(rows.filter((r) => r.source === "manual" && r.is_active)).toHaveLength(2);
  });

  it("after URInvolved sync, Athletics records remain", () => {
    const seeded = seedInventory();
    const { rows } = applySourceScopedSoftDeactivate(seeded, "urinvolved", ["u1", "u2", "u3"], {
      eventsFetched: 3,
      successfulImports: 3,
    });
    expect(rows.filter((r) => r.source === "athletics" && r.is_active)).toHaveLength(3);
  });

  it("failed/zero-import URInvolved sync cannot erase working event data", () => {
    const seeded = seedInventory();
    // Classic regression: fetch returned IDs but every upsert failed → seen=[], imports=0
    const { rows, decision } = applySourceScopedSoftDeactivate(seeded, "urinvolved", [], {
      eventsFetched: 40,
      successfulImports: 0,
    });
    expect(decision.shouldDeactivate).toBe(false);
    expect(decision.reason).toBe("zero_successful_imports");
    expect(rows.filter((r) => r.source === "urinvolved" && r.is_active)).toHaveLength(3);
    expect(rows.filter((r) => r.source === "athletics" && r.is_active)).toHaveLength(3);
  });

  it("empty catalog with stored inventory preserves URInvolved", () => {
    const decision = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 0,
      existingUpcomingActiveCount: 27,
      successfulImports: 0,
    });
    expect(decision).toMatchObject({
      shouldDeactivate: false,
      reason: "suspicious_empty_catalog",
    });
  });

  it("suspicious partial catalog preserves inventory", () => {
    const decision = decideSoftDeactivateMissingEvents({
      fetchAttempted: true,
      fetchSucceeded: true,
      eventsFetched: 5,
      existingUpcomingActiveCount: 100,
      successfulImports: 5,
    });
    expect(decision.shouldDeactivate).toBe(false);
    expect(decision.reason).toBe("suspicious_partial_catalog");
  });

  it("refuses mass soft-deactivate when missing ratio is excessive", () => {
    const safe = filterSafeDeactivationIds({
      missingIds: Array.from({ length: 80 }, (_, i) => `u${i}`),
      activeCount: 100,
    });
    expect(safe.blocked).toBe(true);
    expect(safe.ids).toEqual([]);
  });

  it("same external_id may coexist across providers (identity is source+external_id)", () => {
    expect(EXTERNAL_SOURCE_ID_CONFLICT).toBe("source,external_id");
    const rows = [
      { source: "urinvolved", external_id: "123" },
      { source: "athletics", external_id: "123" },
    ];
    const keys = new Set(rows.map((r) => `${r.source}:${r.external_id}`));
    expect(keys.size).toBe(2);
  });
});

describe("writer source-isolation contracts (source proofs)", () => {
  it("URInvolved soft-deactivate updates are source-scoped", () => {
    const sync = readFileSync(join(root, "lib/server/urinvolved/sync.ts"), "utf8");
    expect(sync).toMatch(/\.eq\("source", URINVOLVED_SOURCE\)/);
    expect(sync).toContain("successfulImports: eventsCreated + eventsUpdated");
    expect(sync).toContain("filterSafeDeactivationIds");
    expect(sync).toContain("lastGoodEventCount");
    expect(sync).not.toMatch(/\.delete\(\)/);
  });

  it("Athletics soft-deactivate updates are source-scoped and import-gated", () => {
    const sync = readFileSync(join(root, "lib/server/eventSources/athleticsSync.ts"), "utf8");
    expect(sync).toMatch(/\.eq\("source", ATHLETICS_SOURCE\)/);
    expect(sync).toContain("filterSafeDeactivationIds");
    expect(sync).toContain("eventsCreated + eventsUpdated > 0");
    expect(sync).toContain("catalogPublishable");
    expect(sync).not.toMatch(/\.delete\(\)/);
  });

  it("runtime upsert path does not use PostgREST onConflict for external_events", () => {
    const upsert = readFileSync(join(root, "lib/server/eventSources/upsertBySourceExternalId.ts"), "utf8");
    expect(upsert).not.toMatch(/\.upsert\(/);
    expect(upsert).toContain('.eq("source", source)');
    expect(upsert).toContain('.eq("external_id", externalId)');
  });

  it("named DB invariant migration enforces UNIQUE(source, external_id)", () => {
    const migration = readFileSync(
      join(root, "supabase/migrations/20260905190000_external_events_identity_invariant.sql"),
      "utf8",
    );
    expect(migration).toContain("external_events_source_external_id_key");
    expect(migration).toMatch(/UNIQUE \(source, external_id\)/);
  });

  it("database guard refuses a mass source deactivation in one statement", () => {
    const migration = readFileSync(
      join(root, "supabase/migrations/20260912160000_guard_mass_event_deactivate.sql"),
      "utf8",
    );
    expect(migration).toContain("cq_guard_external_event_mass_deactivate");
    expect(migration).toContain("CQ_REFUSE_MASS_DEACTIVATE");
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration).not.toMatch(/drop table public/i);
    expect(migration).not.toMatch(/disable row level security/i);
  });
});

describe("Events API path does not hard-filter to athletics", () => {
  it("listExternalEventsFeed queries is_active without source=athletics", () => {
    const src = readFileSync(join(root, "lib/server/externalContent.ts"), "utf8");
    expect(src).toContain('eq("is_active", true)');
    expect(src).not.toMatch(/eq\(["']source["'],\s*["']athletics["']\)/);
  });

  it("EventsFeed loads /api/external/events", () => {
    const feed = readFileSync(join(root, "components/EventsFeed.tsx"), "utf8");
    expect(feed).toContain("/api/external/events");
  });
});

describe("decideSoftDeactivateMissingEvents — successful catalog still allowed", () => {
  it("allows deactivate after a healthy non-empty catalog near inventory size", () => {
    expect(
      decideSoftDeactivateMissingEvents({
        fetchAttempted: true,
        fetchSucceeded: true,
        eventsFetched: 12,
        existingUpcomingActiveCount: 12,
        successfulImports: 12,
      }),
    ).toEqual({ shouldDeactivate: true, preservePreviousInventory: false, reason: "successful_catalog" });
  });
});
