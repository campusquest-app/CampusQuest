import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compactRecommendationSecondaryLine } from "@/lib/realm/forYouRailCopy";

describe("compactRecommendationSecondaryLine", () => {
  it("omits a location that repeats the title", () => {
    expect(
      compactRecommendationSecondaryLine({
        title: "Rec Center",
        locationName: "Rec Center",
        timeLabel: null,
      }),
    ).toBeNull();
  });

  it("omits a generic Campus place suffix after the title", () => {
    expect(
      compactRecommendationSecondaryLine({
        title: "Rec Center",
        locationName: "Rec Center · Campus place",
        timeLabel: null,
      }),
    ).toBeNull();
  });

  it("keeps meaningful location metadata such as Campus-wide", () => {
    expect(
      compactRecommendationSecondaryLine({
        title: "Butterfield Dining Hall",
        locationName: "Campus-wide",
        timeLabel: null,
      }),
    ).toBe("Campus-wide");
  });

  it("keeps event time labels even when location is redundant", () => {
    expect(
      compactRecommendationSecondaryLine({
        title: "Ram Rally",
        locationName: "Ram Rally",
        timeLabel: "Tonight 6:00 PM",
      }),
    ).toBe("Tonight 6:00 PM");
  });

  it("combines distinct location and time", () => {
    expect(
      compactRecommendationSecondaryLine({
        title: "Movie Night",
        locationName: "Memorial Union",
        timeLabel: "Fri 8:00 PM",
      }),
    ).toBe("Memorial Union · Fri 8:00 PM");
  });
});

describe("For You rail layout contracts", () => {
  it("does not place Edit Map in the recommendation rail", () => {
    const railSrc = readFileSync(join(process.cwd(), "components/realm/RealmForYouRail.tsx"), "utf8");
    expect(railSrc).toContain("Recommended around campus");
    expect(railSrc).not.toContain("Edit Map");
    expect(railSrc).toContain("onView");
    expect(railSrc).toContain("onWalkHere");
    expect(railSrc).toContain("item.reasonLabel");
  });

  it("keeps Edit Map as a top-left admin map control", () => {
    const editorSrc = readFileSync(join(process.cwd(), "components/realm/RealmMarkerEditorPanel.tsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(editorSrc).toContain("Edit Map");
    expect(editorSrc).toContain("cq-realm-float-btn--edit");
    expect(css).toMatch(/\.cq-realm-float-btn--edit\s*\{[\s\S]*top:/);
    expect(css).toMatch(/\.cq-realm-float-btn--edit\s*\{[\s\S]*bottom:\s*auto/);
  });
});
