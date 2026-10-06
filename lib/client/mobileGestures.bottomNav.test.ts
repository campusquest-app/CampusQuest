import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_SWIPE_TABS, getAdjacentBottomNavTab } from "@/lib/client/mobileGestures";

describe("bottom nav swipe order", () => {
  it("is Home, Partners, Map, Events, Profile", () => {
    expect(BOTTOM_NAV_SWIPE_TABS).toEqual([
      "quad",
      "partners",
      "realm",
      "events",
      "character",
    ]);
  });

  it("keeps Map centered between Partners and Events", () => {
    expect(BOTTOM_NAV_SWIPE_TABS[2]).toBe("realm");
    expect(getAdjacentBottomNavTab("partners", "forward")).toBe("realm");
    expect(getAdjacentBottomNavTab("realm", "forward")).toBe("events");
    expect(getAdjacentBottomNavTab("realm", "back")).toBe("partners");
  });
});
