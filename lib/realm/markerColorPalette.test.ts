import { describe, expect, it, beforeEach } from "vitest";
import {
  MARKER_COLOR_PALETTE,
  assignVisibleMarkerColors,
  createMarkerColorStore,
  resetMarkerColorAssignments,
} from "@/lib/realm/markerColorPalette";

describe("markerColorPalette", () => {
  beforeEach(() => {
    resetMarkerColorAssignments();
  });

  it("assigns distinct colors to visible markers within palette size", () => {
    const store = createMarkerColorStore();
    const markers = MARKER_COLOR_PALETTE.slice(0, 8).map((c, i) => ({
      id: `m${i}`,
      lat: 41.48 + i * 0.002,
      lng: -71.53,
      hint: "default" as const,
    }));
    const colors = assignVisibleMarkerColors(markers, store);
    const unique = new Set(colors.values());
    expect(unique.size).toBe(markers.length);
  });

  it("keeps colors stable across reassignment for the same IDs", () => {
    const store = createMarkerColorStore();
    const markers = [
      { id: "library", lat: 41.486, lng: -71.53, hint: "academic" as const },
      { id: "quad", lat: 41.487, lng: -71.531, hint: "important" as const, preferGold: true },
      { id: "union", lat: 41.488, lng: -71.529, hint: "creative" as const },
    ];
    const first = assignVisibleMarkerColors(markers, store);
    const second = assignVisibleMarkerColors(markers, store);
    expect(second.get("library")).toBe(first.get("library"));
    expect(second.get("quad")).toBe(first.get("quad"));
    expect(second.get("union")).toBe(first.get("union"));
  });

  it("prefers gold for the marked important marker", () => {
    const store = createMarkerColorStore();
    const colors = assignVisibleMarkerColors(
      [
        { id: "a", lat: 41.48, lng: -71.53, hint: "academic" },
        { id: "b", lat: 41.481, lng: -71.531, hint: "important", preferGold: true },
      ],
      store,
    );
    expect(colors.get("b")).toBe("gold");
    expect(colors.get("a")).not.toBe("gold");
  });

  it("frees colors when markers leave the visible set", () => {
    const store = createMarkerColorStore();
    assignVisibleMarkerColors(
      [
        { id: "a", lat: 41.48, lng: -71.53 },
        { id: "b", lat: 41.49, lng: -71.53 },
      ],
      store,
    );
    const next = assignVisibleMarkerColors([{ id: "c", lat: 41.5, lng: -71.53 }], store);
    expect(next.has("a")).toBe(false);
    expect(next.has("b")).toBe(false);
    expect(next.has("c")).toBe(true);
  });

  it("avoids identical colors on neighboring markers when reusing", () => {
    const store = createMarkerColorStore();
    // Force palette exhaustion with many nearby markers.
    const markers = Array.from({ length: MARKER_COLOR_PALETTE.length + 3 }, (_, i) => ({
      id: `n${i}`,
      lat: 41.486 + i * 0.00005,
      lng: -71.53,
    }));
    const colors = assignVisibleMarkerColors(markers, store);
    // Check consecutive neighbors are not the same color.
    for (let i = 0; i < markers.length - 1; i += 1) {
      expect(colors.get(markers[i]!.id)).not.toBe(colors.get(markers[i + 1]!.id));
    }
  });
});
