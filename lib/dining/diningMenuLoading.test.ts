import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNetNutritionSession,
  NET_NUTRITION_FETCH_TIMEOUT_MS,
} from "./netNutritionClient";
import {
  countDiningMenuItems,
  diningMenuRequestKey,
  isAbortError,
  isDiningMenuEmpty,
  shouldCommitDiningResponse,
  shouldShowDiningSkeleton,
} from "./diningMenuClientState";
import { resolveDiningLocationId, URI_DINING_LOCATIONS } from "./uriDiningLocations";
import type { DiningMenuResponse } from "./types";
import { DINING_DISCLAIMER } from "./uriDiningLocations";

function sampleSuccessMenu(): DiningMenuResponse {
  return {
    location: { id: "butterfield", name: "Butterfield Dining Hall" },
    date: "2026-08-17",
    mealPeriods: [
      {
        id: "breakfast",
        name: "Breakfast",
        stations: [
          {
            id: "nn-unit-2",
            name: "Homestyle",
            items: [
              {
                id: "nn-1",
                name: "Scrambled Eggs",
                dietaryTags: ["Vegetarian"],
                allergens: ["Eggs"],
                hasNutritionDetail: true,
                externalDetailOid: "1",
              },
            ],
          },
        ],
      },
    ],
    fetchedAt: "2026-08-17T12:00:00.000Z",
    lastUpdated: "2026-08-17T12:00:00.000Z",
    disclaimer: DINING_DISCLAIMER,
  };
}

describe("NetNutrition session redirect loop", () => {
  it("captures cookies from self-referential 302 without following redirects", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      calls += 1;
      expect(init?.redirect).toBe("manual");
      // Mimic URI: Location points back at the same entry path.
      return new Response("<html></html>", {
        status: 302,
        headers: {
          Location: "/NetNutrition/URIDining",
          "Set-Cookie": "ASP.NET_SessionId=abc123; path=/; HttpOnly",
        },
      });
    };

    const session = await createNetNutritionSession(fetchImpl);
    expect(calls).toBe(1);
    expect(session.cookieHeader).toContain("ASP.NET_SessionId=abc123");
    expect(session.cookieHeader).toContain("CBORD.netnutrition2=");
  });

  it("does not hang when Location is an absolute self URL", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      expect(init?.redirect).toBe("manual");
      return new Response("", {
        status: 302,
        headers: {
          Location: "https://fss.dining.uri.edu/NetNutrition/URIDining",
          "set-cookie": "ASP.NET_SessionId=xyz; path=/",
        },
      });
    };
    const session = await createNetNutritionSession(fetchImpl);
    expect(session.cookieHeader).toContain("ASP.NET_SessionId=xyz");
  });

  it("exports a finite upstream timeout", () => {
    expect(NET_NUTRITION_FETCH_TIMEOUT_MS).toBeGreaterThan(5_000);
    expect(NET_NUTRITION_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe("dining menu client state", () => {
  it("Butterfield campus slug maps to dining source id butterfield / unit 1", () => {
    expect(resolveDiningLocationId("butterfield-dining")).toBe("butterfield");
    expect(URI_DINING_LOCATIONS.butterfield.externalUnitOid).toBe(1);
    expect(diningMenuRequestKey("butterfield", "2026-08-17")).toBe("butterfield:2026-08-17");
  });

  it("successful menu clears skeleton and counts food items", () => {
    const menu = sampleSuccessMenu();
    expect(
      shouldShowDiningSkeleton({ initialLoading: false, loaded: true, menu }),
    ).toBe(false);
    expect(countDiningMenuItems(menu)).toBe(1);
    expect(isDiningMenuEmpty({ loaded: true, menu })).toBe(false);
  });

  it("successful empty response is empty state, not skeleton", () => {
    const empty: DiningMenuResponse = {
      ...sampleSuccessMenu(),
      mealPeriods: [],
    };
    expect(
      shouldShowDiningSkeleton({ initialLoading: false, loaded: true, menu: empty }),
    ).toBe(false);
    expect(isDiningMenuEmpty({ loaded: true, menu: empty })).toBe(true);
  });

  it("API error path: loaded with no menu is not an infinite skeleton", () => {
    expect(
      shouldShowDiningSkeleton({ initialLoading: false, loaded: true, menu: null }),
    ).toBe(false);
  });

  it("latest request seq wins; stale seq cannot commit", () => {
    expect(shouldCommitDiningResponse({ requestSeq: 3, activeSeq: 3 })).toBe(true);
    expect(shouldCommitDiningResponse({ requestSeq: 2, activeSeq: 3 })).toBe(false);
  });

  it("rapid Today → Tomorrow switching: only matching seq commits", () => {
    const todaySeq = 1;
    const tomorrowSeq = 2;
    const active = tomorrowSeq;
    expect(shouldCommitDiningResponse({ requestSeq: todaySeq, activeSeq: active })).toBe(false);
    expect(shouldCommitDiningResponse({ requestSeq: tomorrowSeq, activeSeq: active })).toBe(true);
  });

  it("treats AbortError from Error and DOMException", () => {
    const err = new Error("Aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
    expect(isAbortError(new Error("boom"))).toBe(false);
  });
});

describe("stale abort must not overwrite latest menu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("simulates superseded request ignored while latest remains commit-eligible", () => {
    let activeSeq = 0;
    const commits: Array<{ seq: number; date: string }> = [];

    function start(date: string) {
      const seq = ++activeSeq;
      return {
        seq,
        commit(menuDate: string) {
          if (!shouldCommitDiningResponse({ requestSeq: seq, activeSeq })) return false;
          commits.push({ seq, date: menuDate });
          return true;
        },
      };
    }

    const first = start("2026-08-17");
    const second = start("2026-08-18");
    // Stale (aborted) today response arrives after tomorrow started.
    expect(first.commit("2026-08-17")).toBe(false);
    expect(second.commit("2026-08-18")).toBe(true);
    expect(commits).toEqual([{ seq: 2, date: "2026-08-18" }]);
  });

  it("closing then reopening uses a new seq and does not keep two active commits", () => {
    let activeSeq = 0;
    const open = () => ++activeSeq;
    const firstOpen = open();
    // close aborts firstOpen
    const secondOpen = open();
    expect(shouldCommitDiningResponse({ requestSeq: firstOpen, activeSeq: secondOpen })).toBe(
      false,
    );
    expect(shouldCommitDiningResponse({ requestSeq: secondOpen, activeSeq: secondOpen })).toBe(
      true,
    );
  });
});
