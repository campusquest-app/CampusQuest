import { describe, expect, it } from "vitest";
import {
  applyMarkerPositionsToLocations,
  resolveMarkerPositions,
  type MarkerPositionMap,
} from "@/lib/realm/markerPositionsStore";
import type { RealmLocation } from "@/lib/realm/locations";

const CATALOG: RealmLocation[] = [
  {
    id: "the-quad",
    name: "The Quad",
    shortLabel: "Quad",
    x: 50,
    y: 50,
    major: true,
    category: "landmark",
  } as RealmLocation,
  {
    id: "library",
    name: "Library",
    shortLabel: "Lib",
    x: 40,
    y: 40,
    major: true,
    category: "building",
  } as RealmLocation,
];

describe("marker position persistence", () => {
  it("keeps saved lat/lng after merge with catalog defaults", () => {
    const saved: MarkerPositionMap = {
      library: { x: 42.1, y: 38.5, lat: 41.491, lng: -71.528 },
    };
    const resolved = resolveMarkerPositions(saved, CATALOG);
    expect(resolved.library?.lat).toBeCloseTo(41.491, 5);
    expect(resolved.library?.lng).toBeCloseTo(-71.528, 5);
    expect(resolved.library?.x).toBeCloseTo(42.1, 1);
  });

  it("does not revert saved coords when resolving again after an exit", () => {
    const afterSave: MarkerPositionMap = {
      "the-quad": { x: 55, y: 48, lat: 41.485, lng: -71.531 },
      library: { x: 40, y: 40 },
    };
    const onExit = resolveMarkerPositions(afterSave, CATALOG);
    const afterReload = resolveMarkerPositions(onExit, CATALOG);
    expect(afterReload["the-quad"]?.lat).toBeCloseTo(41.485, 5);
    expect(afterReload["the-quad"]?.lng).toBeCloseTo(-71.531, 5);
  });

  it("applies percent overrides onto location list without dropping ids", () => {
    const positions: MarkerPositionMap = {
      library: { x: 33, y: 44, lat: 41.49, lng: -71.53 },
    };
    const applied = applyMarkerPositionsToLocations(CATALOG, positions);
    expect(applied.map((l) => l.id)).toEqual(["the-quad", "library"]);
    expect(applied.find((l) => l.id === "library")?.x).toBe(33);
  });
});
