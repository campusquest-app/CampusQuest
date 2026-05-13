import { describe, expect, it } from "vitest";
import {
  appendIdentityWeeklyEvents,
  countWeeklyByKind,
  enrichProfileRowForApiClient,
  hasWeeklyIdentityBudget,
  parseIdentityWeeklyEvents,
  publicWeeklyBudgetFromEvents,
} from "@/lib/identityWeeklyBudget";

describe("identityWeeklyBudget", () => {
  it("recognizes allowlisted email", () => {
    expect(hasWeeklyIdentityBudget("nicklockhart22@uri.edu")).toBe(true);
    expect(hasWeeklyIdentityBudget("  NickLockhart22@URI.EDU  ")).toBe(true);
    expect(hasWeeklyIdentityBudget("other@uri.edu")).toBe(false);
  });

  it("parses, counts, and appends display + username in the rolling window", () => {
    const now = Date.parse("2026-05-22T12:00:00.000Z");
    const nowIso = new Date(now).toISOString();
    const pruned = parseIdentityWeeklyEvents([]);
    const next = appendIdentityWeeklyEvents(pruned, {
      display: true,
      username: true,
      nowIso,
    });
    const c = countWeeklyByKind(next, now, 7 * 24 * 60 * 60 * 1000);
    expect(c.display_used).toBe(1);
    expect(c.username_used).toBe(1);
    expect(c.pruned.length).toBe(2);
  });

  it("enrichProfileRowForApiClient adds weekly_identity_budget only when the column exists on the row", () => {
    const noCol = enrichProfileRowForApiClient(
      { id: "x", display_name: "Test" } as Record<string, unknown>,
      "nicklockhart22@uri.edu",
    );
    expect(noCol.weekly_identity_budget).toBeUndefined();

    const withCol = enrichProfileRowForApiClient(
      {
        id: "x",
        display_name: "Test",
        identity_weekly_change_events: [],
      } as Record<string, unknown>,
      "nicklockhart22@uri.edu",
    );
    expect(withCol.weekly_identity_budget).toEqual(
      publicWeeklyBudgetFromEvents([]),
    );
  });

  it("drops events older than the rolling window", () => {
    const now = Date.parse("2026-05-22T12:00:00.000Z");
    const oldIso = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const raw = [{ at: oldIso, k: "display" as const }];
    const events = parseIdentityWeeklyEvents(raw);
    const c = countWeeklyByKind(events, now, 7 * 24 * 60 * 60 * 1000);
    expect(c.display_used).toBe(0);
    expect(c.pruned.length).toBe(0);
  });
});
