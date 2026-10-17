import { describe, expect, it } from "vitest";
import { basicEntitlement, unknownBasicEntitlement, type BasicAccessRow } from "@/lib/basic/entitlement";
import { forYouSurface, shouldPersonalizeForYouEvents } from "@/lib/basic/forYouAccess";
import { loadOwnBasicEntitlement } from "@/lib/server/basicEntitlement";

const NOW = new Date("2026-10-05T12:00:00.000Z");

function row(overrides: Partial<BasicAccessRow> = {}): BasicAccessRow {
  return {
    starts_at: "2026-10-01T00:00:00.000Z",
    ends_at: "2026-11-01T00:00:00.000Z",
    early_access: false,
    ...overrides,
  };
}

function client(result: { data: BasicAccessRow | null; error: { message: string } | null }) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      return {
        select() {
          return {
            eq(column: string, value: string) {
              calls.push(`${column}=${value}`);
              return { maybeSingle: async () => result };
            },
          };
        },
      };
    },
  };
}

describe("basicEntitlement leftover table helper", () => {
  it("still parses an in-window row without granting product access", () => {
    const entitlement = basicEntitlement(row({ early_access: true }), NOW);
    expect(entitlement).toMatchObject({ active: true, earlyAccess: true, known: true });
  });

  it("treats a missing row as known and inactive", () => {
    expect(basicEntitlement(null, NOW)).toMatchObject({ active: false, known: true, earlyAccess: false });
  });

  it("treats an expired window as inactive", () => {
    const entitlement = basicEntitlement(row({ ends_at: "2026-10-05T12:00:00.000Z" }), NOW);
    expect(entitlement.active).toBe(false);
    expect(entitlement.known).toBe(true);
  });

  it("treats a future window as inactive", () => {
    const entitlement = basicEntitlement(row({ starts_at: "2026-10-06T00:00:00.000Z" }), NOW);
    expect(entitlement.active).toBe(false);
  });

  it("keeps a failed read unknown", () => {
    expect(unknownBasicEntitlement().known).toBe(false);
    expect(unknownBasicEntitlement().active).toBe(false);
  });
});

describe("loadOwnBasicEntitlement leftover helper", () => {
  it("reads only the signed-in user's cq_basic_access row", async () => {
    const supabase = client({ data: row(), error: null });
    const entitlement = await loadOwnBasicEntitlement(supabase, "user-1", NOW);
    expect(supabase.calls).toEqual(["cq_basic_access", "user_id=user-1"]);
    expect(entitlement.active).toBe(true);
  });

  it("does not invent access when the read fails", async () => {
    const supabase = client({ data: null, error: { message: "unavailable" } });
    const entitlement = await loadOwnBasicEntitlement(supabase, "user-1", NOW);
    expect(entitlement.known).toBe(false);
    expect(entitlement.active).toBe(false);
  });
});

describe("For You is free for every signed-in user", () => {
  it("personalizes For You from the existing recommendation path without an entitlement", () => {
    expect(shouldPersonalizeForYouEvents({ timeframe: "for_you", searching: false })).toBe(true);
    expect(shouldPersonalizeForYouEvents({ timeframe: "today", searching: false })).toBe(false);
    expect(shouldPersonalizeForYouEvents({ timeframe: "this_weekend", searching: false })).toBe(false);
    expect(shouldPersonalizeForYouEvents({ timeframe: "all", searching: false })).toBe(false);
    expect(shouldPersonalizeForYouEvents({ timeframe: "for_you", searching: true })).toBe(false);
  });

  it("never opens an upgrade, checking, or locked For You surface", () => {
    expect(forYouSurface({ timeframe: "for_you", searching: false })).toBe("browse");
    expect(forYouSurface({ timeframe: "for_you", searching: true })).toBe("browse");
    expect(forYouSurface({ timeframe: "today", searching: false })).toBe("browse");
    expect(forYouSurface({ timeframe: "this_weekend", searching: false })).toBe("browse");
  });
});
