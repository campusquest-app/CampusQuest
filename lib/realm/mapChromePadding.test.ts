import { describe, expect, it } from "vitest";
import {
  GOOGLE_ATTRIBUTION_BAND_PX,
  MAP_CHROME_LEFT_INSET_PX,
  MAP_CHROME_RIGHT_INSET_PX,
  MAP_CHROME_TOP_INSET_PX,
  computeMapChromePadding,
} from "@/lib/realm/mapChromePadding";

describe("computeMapChromePadding", () => {
  it("keeps a dedicated attribution band above the dock clearance", () => {
    const padding = computeMapChromePadding({
      navClearancePx: 100,
      safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
      attributionBandPx: GOOGLE_ATTRIBUTION_BAND_PX,
    });

    expect(padding.bottom).toBe(100 + GOOGLE_ATTRIBUTION_BAND_PX);
    expect(padding.top).toBe(MAP_CHROME_TOP_INSET_PX);
    expect(padding.left).toBe(MAP_CHROME_LEFT_INSET_PX);
    expect(padding.right).toBe(MAP_CHROME_RIGHT_INSET_PX);
  });

  it("honors larger safe-area side insets on notched devices", () => {
    const padding = computeMapChromePadding({
      navClearancePx: 90,
      safeArea: { top: 59, right: 44, bottom: 21, left: 44 },
    });

    expect(padding.left).toBe(44);
    expect(padding.right).toBe(44);
    // Top safe-area is absorbed by the Realm header outside the map.
    expect(padding.top).toBe(MAP_CHROME_TOP_INSET_PX);
  });

  it("never lets bottom padding fall below the attribution band alone", () => {
    const padding = computeMapChromePadding({
      navClearancePx: 0,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(padding.bottom).toBe(GOOGLE_ATTRIBUTION_BAND_PX);
  });
});
