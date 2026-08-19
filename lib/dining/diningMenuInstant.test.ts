import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client/dashboardApi", () => ({
  fetchAuthed: vi.fn(),
  isMissingSessionError: vi.fn(() => false),
}));

vi.mock("@/lib/client/apiSession", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("./netNutritionClient", () => ({
  NetNutritionError: class NetNutritionError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
  createNetNutritionSession: vi.fn(async () => ({ cookieHeader: "x=1" })),
  selectParentUnit: vi.fn(async () => ({
    session: { cookieHeader: "x=1" },
    data: {},
  })),
  selectChildUnit: vi.fn(),
  selectMenu: vi.fn(),
  fetchHoursMarkup: vi.fn(),
  panelHtml: vi.fn(() => ""),
  NET_NUTRITION_FETCH_TIMEOUT_MS: 20_000,
}));

vi.mock("./netNutritionParse", () => ({
  parseChildUnits: vi.fn(() => [{ unitOid: 2, name: "Homestyle" }]),
  parseMenuListPanel: vi.fn(() => []),
  parseItemPanel: vi.fn(() => ({ courses: [] })),
  parseHoursMarkup: vi.fn(() => ({ summary: "", days: [] })),
  menuDateLabelMatchesIso: vi.fn(() => true),
  parseNutritionLabelHtml: vi.fn(),
}));

import {
  clearDiningMenuCache,
  diningCacheKey,
  getOrStartDiningMenuFetch,
  hasDiningMenuInflight,
  peekDiningMenuCache,
  setCachedDiningMenu,
  todayMenuTtlMs,
  upcomingMenuTtlMs,
} from "./diningCache";
import {
  DINING_SLOW_LOADING_HINT_MS,
  shouldPreserveDiningMenuDuringLoad,
  shouldShowDiningSlowLoadingHint,
  shouldShowDiningSkeleton,
} from "./diningMenuClientState";
import {
  clearDiningMenuSessionCache,
  fetchDiningMenuSession,
  getDiningMenuSessionCache,
  setDiningMenuSessionCache,
} from "./diningMenuSessionCache";
import { fetchUriDiningMenu } from "./uriDining";
import { URI_DINING_LOCATIONS } from "./uriDiningLocations";
import type { DiningMenu } from "./types";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { createNetNutritionSession } from "./netNutritionClient";

function sampleMenu(date = "2026-08-19"): DiningMenu {
  return {
    location: URI_DINING_LOCATIONS.butterfield,
    date,
    fetchedAt: new Date().toISOString(),
    source: "netnutrition",
    mealPeriods: [
      {
        id: "lunch",
        name: "Lunch",
        externalMealOid: 4,
        stations: [
          {
            id: "nn-unit-2",
            name: "Homestyle",
            externalUnitOid: 2,
            items: [
              {
                id: "1",
                name: "Pasta",
                dietaryTags: [],
                allergens: [],
                externalDetailOid: "9",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("dining menu server cache SWR", () => {
  afterEach(() => {
    clearDiningMenuCache();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("uses a 10–30 minute TTL for today and longer for upcoming days", () => {
    expect(todayMenuTtlMs()).toBeGreaterThanOrEqual(10 * 60_000);
    expect(todayMenuTtlMs()).toBeLessThanOrEqual(30 * 60_000);
    expect(upcomingMenuTtlMs()).toBeGreaterThan(todayMenuTtlMs());
  });

  it("returns fresh cache immediately without upstream", async () => {
    setCachedDiningMenu(sampleMenu(), 60_000);
    const menu = await fetchUriDiningMenu({
      locationId: "butterfield",
      isoDate: "2026-08-19",
      fetchImpl: async () => {
        throw new Error("upstream should not run");
      },
    });
    expect(menu.source).toBe("cache");
    expect(menu.stale).toBeFalsy();
    expect(menu.mealPeriods[0]?.stations[0]?.items[0]?.name).toBe("Pasta");
  });

  it("returns stale cache immediately and refreshes in background (SWR)", async () => {
    vi.useFakeTimers();
    setCachedDiningMenu(sampleMenu(), 1);
    await vi.advanceTimersByTimeAsync(5);
    expect(peekDiningMenuCache("butterfield", "2026-08-19")?.fresh).toBe(false);

    let upstreamCalls = 0;
    vi.mocked(createNetNutritionSession).mockImplementation(async () => {
      upstreamCalls += 1;
      return { cookieHeader: "x=1" } as never;
    });

    const first = await fetchUriDiningMenu({
      locationId: "butterfield",
      isoDate: "2026-08-19",
    });
    expect(first.stale).toBe(true);
    expect(first.source).toBe("cache");
    expect(hasDiningMenuInflight(diningCacheKey("butterfield", "2026-08-19"))).toBe(true);

    await vi.waitFor(() => expect(upstreamCalls).toBeGreaterThan(0));
  });

  it("dedupes concurrent upstream fetches for the same key", async () => {
    let starts = 0;
    const shared = getOrStartDiningMenuFetch("butterfield:2026-08-19", async () => {
      starts += 1;
      await new Promise((r) => setTimeout(r, 20));
      return sampleMenu();
    });
    const shared2 = getOrStartDiningMenuFetch("butterfield:2026-08-19", async () => {
      starts += 1;
      return sampleMenu();
    });
    const [a, b] = await Promise.all([shared, shared2]);
    expect(starts).toBe(1);
    expect(a.date).toBe(b.date);
  });
});

describe("dining menu client session cache", () => {
  beforeEach(() => {
    clearDiningMenuSessionCache();
    vi.mocked(fetchAuthed).mockReset();
  });

  afterEach(() => {
    clearDiningMenuSessionCache();
  });

  it("survives module-level get/set across logical remounts", () => {
    setDiningMenuSessionCache("butterfield", "2026-08-19", {
      location: { id: "butterfield", name: "Butterfield Dining Hall" },
      date: "2026-08-19",
      mealPeriods: [],
      fetchedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      disclaimer: "x",
    });
    expect(getDiningMenuSessionCache("butterfield", "2026-08-19")?.location.id).toBe("butterfield");
  });

  it("dedupes concurrent client fetches", async () => {
    let calls = 0;
    vi.mocked(fetchAuthed).mockImplementation(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return {
        location: { id: "butterfield", name: "Butterfield Dining Hall" },
        date: "2026-08-19",
        mealPeriods: [],
        fetchedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        disclaimer: "x",
      };
    });

    const [a, b] = await Promise.all([
      fetchDiningMenuSession({ locationId: "butterfield", isoDate: "2026-08-19", forceNetwork: true }),
      fetchDiningMenuSession({ locationId: "butterfield", isoDate: "2026-08-19", forceNetwork: true }),
    ]);
    expect(calls).toBe(1);
    expect(a.date).toBe(b.date);
  });
});

describe("dining menu loading UX helpers", () => {
  it("shows skeleton only when no menu exists yet", () => {
    expect(
      shouldShowDiningSkeleton({ initialLoading: true, loaded: false, menu: null }),
    ).toBe(true);
    expect(
      shouldShowDiningSkeleton({
        initialLoading: false,
        loaded: true,
        menu: {
          location: { id: "butterfield", name: "Butterfield" },
          date: "2026-08-19",
          mealPeriods: [],
          fetchedAt: "",
          lastUpdated: "",
          disclaimer: "",
        },
      }),
    ).toBe(false);
  });

  it("replaces indefinite skeleton with a slow-loading hint after ~2.5s", () => {
    expect(DINING_SLOW_LOADING_HINT_MS).toBeGreaterThanOrEqual(2_000);
    expect(DINING_SLOW_LOADING_HINT_MS).toBeLessThanOrEqual(3_500);
    expect(shouldShowDiningSlowLoadingHint({ showSkeleton: true, slowLoading: true })).toBe(true);
    expect(shouldShowDiningSlowLoadingHint({ showSkeleton: true, slowLoading: false })).toBe(false);
  });

  it("preserves rendered menu during soft refresh / date switch", () => {
    expect(
      shouldPreserveDiningMenuDuringLoad({ hasMenu: true, hasSessionCacheForTarget: false }),
    ).toBe(true);
    expect(
      shouldPreserveDiningMenuDuringLoad({ hasMenu: false, hasSessionCacheForTarget: true }),
    ).toBe(true);
    expect(
      shouldPreserveDiningMenuDuringLoad({ hasMenu: false, hasSessionCacheForTarget: false }),
    ).toBe(false);
  });
});
