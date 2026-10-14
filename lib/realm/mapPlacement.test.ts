import { describe, expect, it } from "vitest";
import {
  beginMarkerPlacement,
  latLngFromMapClick,
  previewMarkerPlacement,
  repositionMarkerPlacement,
  resetMarkerPlacement,
} from "@/lib/realm/mapPlacement";

describe("map marker placement", () => {
  it("starts placement without a marker and cancel restores an empty editor", () => {
    const placing = beginMarkerPlacement();
    expect(placing).toEqual({ placing: true, preview: null });
    expect(resetMarkerPlacement()).toEqual({ placing: false, preview: null });
  });

  it("turns a map tap into one preview and leaves placement mode", () => {
    const next = previewMarkerPlacement(beginMarkerPlacement(), 41.4862, -71.5309);
    expect(next.placing).toBe(false);
    expect(next.preview).toMatchObject({ lat: 41.4862, lng: -71.5309 });
  });

  it("ignores taps while dragging, outside placement mode, or without coordinates", () => {
    const placing = beginMarkerPlacement();
    expect(previewMarkerPlacement(placing, 41.4862, -71.5309, { dragged: true })).toBe(placing);
    expect(previewMarkerPlacement({ placing: false, preview: null }, 41.4862, -71.5309).preview).toBeNull();
    expect(previewMarkerPlacement(placing, Number.NaN, -71.53)).toBe(placing);
    expect(latLngFromMapClick({ detail: { latLng: null } })).toBeNull();
    expect(latLngFromMapClick({ detail: { latLng: { lat: 41.4862, lng: -71.5309 } } })).toEqual({
      lat: 41.4862,
      lng: -71.5309,
    });
  });

  it("repositions the same preview instead of creating another marker", () => {
    const previewed = previewMarkerPlacement(beginMarkerPlacement(), 41.4862, -71.5309);
    const repositioning = repositionMarkerPlacement(previewed);
    expect(repositioning.placing).toBe(true);
    expect(repositioning.preview).toBe(previewed.preview);
    const moved = previewMarkerPlacement(repositioning, 41.487, -71.531);
    expect(moved.preview?.lat).toBe(41.487);
    expect(moved.preview).not.toBe(previewed.preview);
  });
});