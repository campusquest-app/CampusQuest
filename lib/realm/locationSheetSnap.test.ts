import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCATION_SHEET_EXPANDED_RATIO,
  LOCATION_SHEET_PEEK_RATIO,
  locationSheetAvailableHeight,
  locationSheetDragIntent,
  locationSheetDragOffset,
  locationSheetHeightPx,
  locationSheetRestingOffset,
  markerContainerY,
  nextLocationSheetSnap,
  revealMarkerPanY,
} from "@/lib/realm/locationSheetSnap";

describe("location sheet snaps", () => {
  it("opens near 43% and expands near 88% of the space above the nav", () => {
    const available = locationSheetAvailableHeight(844, 83, 47);
    expect(available).toBe(844 - 83 - 47);
    const peek = locationSheetHeightPx(available, "peek");
    const expanded = locationSheetHeightPx(available, "expanded");
    expect(peek / available).toBeCloseTo(LOCATION_SHEET_PEEK_RATIO, 2);
    expect(expanded / available).toBeCloseTo(LOCATION_SHEET_EXPANDED_RATIO, 2);
    expect(peek).toBeGreaterThan(250);
    expect(expanded).toBeGreaterThan(peek);
    expect(expanded).toBeLessThan(available);
  });

  it("fits a compact peek on a small phone", () => {
    const available = locationSheetAvailableHeight(667, 83, 20);
    const peek = locationSheetHeightPx(available, "peek");
    expect(peek).toBeGreaterThanOrEqual(220);
    expect(peek).toBeLessThan(available * 0.5);
  });

  it("expands upward, collapses, then dismisses", () => {
    expect(nextLocationSheetSnap("peek", -60)).toBe("expanded");
    expect(nextLocationSheetSnap("expanded", 70)).toBe("peek");
    expect(nextLocationSheetSnap("peek", 90)).toBe("closed");
    expect(nextLocationSheetSnap("expanded", 180)).toBe("closed");
    expect(nextLocationSheetSnap("peek", 10)).toBe("peek");
    expect(nextLocationSheetSnap("expanded", 12)).toBe("expanded");
    expect(nextLocationSheetSnap("peek", Number.NaN)).toBe("peek");
  });

  it("shifts the full sheet down to the peek and follows the finger without leaving the screen", () => {
    const height = 600;
    const peek = locationSheetRestingOffset(height, "peek");
    const expanded = locationSheetRestingOffset(height, "expanded");
    expect(expanded).toBe(0);
    expect(peek / height).toBeCloseTo(1 - LOCATION_SHEET_PEEK_RATIO / LOCATION_SHEET_EXPANDED_RATIO, 2);
    expect(locationSheetDragOffset(peek, -80, height)).toBe(peek - 80);
    expect(locationSheetDragOffset(0, 40, height)).toBe(40);
    expect(locationSheetDragOffset(0, -30, height)).toBe(0);
    expect(locationSheetDragOffset(peek, 5000, height)).toBe(height);
    expect(locationSheetDragOffset(peek, Number.NaN, height)).toBe(peek);
  });

  it("lets the handle drag, and leaves scrolling and buttons alone", () => {
    expect(
      locationSheetDragIntent({
        interactive: false,
        onHandle: true,
        scrollTop: 40,
        dx: 0,
        dy: 20,
        canScroll: true,
      }),
    ).toBe("drag");
    expect(
      locationSheetDragIntent({
        interactive: true,
        onHandle: false,
        scrollTop: 0,
        dx: 0,
        dy: 30,
        canScroll: false,
      }),
    ).toBe("ignore");
    expect(
      locationSheetDragIntent({
        interactive: false,
        onHandle: false,
        scrollTop: 12,
        dx: 0,
        dy: 30,
        canScroll: true,
      }),
    ).toBe("ignore");
    expect(
      locationSheetDragIntent({
        interactive: false,
        onHandle: false,
        scrollTop: 0,
        dx: 24,
        dy: 4,
        canScroll: false,
      }),
    ).toBe("cancel");
    expect(
      locationSheetDragIntent({
        interactive: false,
        onHandle: false,
        scrollTop: 0,
        dx: 0,
        dy: -20,
        canScroll: true,
      }),
    ).toBe("cancel");
    expect(
      locationSheetDragIntent({
        interactive: false,
        onHandle: false,
        scrollTop: 0,
        dx: 2,
        dy: 4,
        canScroll: false,
      }),
    ).toBe("wait");
  });

  it("pans only when the marker sits behind the sheet and never invents a zoom", () => {
    const y = markerContainerY({
      lat: 41.486,
      lng: -71.53,
      centerLat: 41.486,
      centerLng: -71.53,
      zoom: 17,
      width: 390,
      height: 700,
    });
    expect(y).toBeCloseTo(350, 0);
    expect(revealMarkerPanY(620, 390, 28)).toBe(620 - (390 - 28));
    expect(revealMarkerPanY(300, 390, 28)).toBe(0);
    expect(revealMarkerPanY(Number.NaN, 390)).toBe(0);
  });
});

describe("location sheet source contract", () => {
  const sheet = readFileSync("components/realm/RealmLocationSheet.tsx", "utf8");
  const actions = readFileSync("components/realm/locationDetail/LocationPrimaryActions.tsx", "utf8");
  const hero = readFileSync("components/realm/locationDetail/LocationHero.tsx", "utf8");
  const fly = readFileSync("components/realm/RealmMapFlyTo.tsx", "utf8");

  it("docks over the map with peek and expanded snaps", () => {
    expect(sheet).toContain("cq-loc-sheet--dock");
    expect(sheet).toContain('data-cq-location-sheet');
    expect(sheet).toContain("nextLocationSheetSnap");
    expect(sheet).toContain("passive: false");
    expect(sheet).toContain("data-realm-sheet-dragging");
    expect(sheet).toContain("translate3d");
    expect(sheet).toContain('aria-label="Close location details"');
    expect(sheet).toContain("onAddMemory");
    expect(sheet).not.toContain("RealmDirectionsPanel");
    expect(sheet).not.toContain("document.body.style.overflow");
  });

  it("removes Walk Here from the location sheet", () => {
    expect(sheet).not.toContain("Walk Here");
    expect(sheet).not.toContain("cq-loc-action--walk");
    expect(actions).not.toContain("Walk Here");
    expect(actions).not.toContain("cq-loc-action--walk");
    expect(actions).toContain("Add Memory");
  });

  it("keeps a compact hero with an image fallback", () => {
    expect(hero).toContain("onError");
    expect(hero).toContain("cq-loc-hero-fallback");
  });

  it("does not change zoom when the sheet opens", () => {
    expect(fly).toContain("revealMarkerPanY");
    expect(fly).toContain("panBy");
    const reveal = fly.slice(fly.lastIndexOf("revealMarkerPanY"));
    expect(reveal).not.toContain("setZoom");
    expect(fly).toContain("if (force)");
  });
});
