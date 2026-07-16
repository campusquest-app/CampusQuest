import { describe, expect, it, vi } from "vitest";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import {
  createMarkerTapGate,
  getMarkerUnavailableMessage,
  isValidMarkerId,
  normalizeGroupedMapContent,
  resolveLandmarkTap,
  resolveSupplementaryTap,
} from "@/lib/realm/safeMarkerClick";

const baseGroup = (partial: Partial<GroupedMapLocation> = {}): GroupedMapLocation => ({
  groupKey: "supp-1",
  locationKey: null,
  realmLocationId: null,
  locationName: "Pop-up Spot",
  locationAddress: null,
  x: 40,
  y: 50,
  lat: 41.49,
  lng: -71.53,
  attachToLandmark: false,
  quests: [],
  events: [],
  qrCodes: [],
  ...partial,
});

describe("safeMarkerClick", () => {
  it("opens a valid landmark marker", () => {
    const result = resolveLandmarkTap({
      markerId: "weldin-hall",
      locations: [{ id: "weldin-hall" }, { id: "library" }],
    });
    expect(result).toEqual({ ok: true, id: "weldin-hall" });
  });

  it("rejects a deleted / missing landmark without throwing", () => {
    const result = resolveLandmarkTap({
      markerId: "gone-hall",
      locations: [{ id: "library" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing");
      expect(result.message).toBe(getMarkerUnavailableMessage());
    }
  });

  it("rejects invalid marker ids", () => {
    expect(isValidMarkerId(null)).toBe(false);
    expect(isValidMarkerId("")).toBe(false);
    expect(resolveLandmarkTap({ markerId: null, locations: [] }).ok).toBe(false);
  });

  it("rejects supplementary markers with null coordinates", () => {
    const result = resolveSupplementaryTap({
      group: baseGroup({ lat: null, lng: null, x: Number.NaN, y: Number.NaN }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("null_coords");
  });

  it("allows duplicate logical groups that still have a valid key/coords", () => {
    const a = resolveSupplementaryTap({ group: baseGroup({ groupKey: "dup-a" }) });
    const b = resolveSupplementaryTap({ group: baseGroup({ groupKey: "dup-a" }) });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("debounces rapid double taps on the same marker", () => {
    const gate = createMarkerTapGate(400);
    expect(gate.tryOpen("weldin-hall", 1000)).toBe(true);
    expect(gate.tryOpen("weldin-hall", 1100)).toBe(false);
    expect(gate.tryOpen("weldin-hall", 1500)).toBe(true);
    expect(gate.tryOpen("library", 1550)).toBe(true);
  });

  it("normalizes stale / partial map content arrays", () => {
    const normalized = normalizeGroupedMapContent({
      ...baseGroup(),
      // @ts-expect-error intentional stale cache shape
      quests: undefined,
      // @ts-expect-error intentional stale cache shape
      events: null,
    });
    expect(normalized?.quests).toEqual([]);
    expect(normalized?.events).toEqual([]);
    expect(normalized?.qrCodes).toEqual([]);
  });

  it("treats sync-in-progress empty groups as invalid when key is missing", () => {
    const result = resolveSupplementaryTap({ group: undefined });
    expect(result.ok).toBe(false);
  });

  it("logs network-style failures through the unavailable message path", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = resolveLandmarkTap({
      markerId: "offline-pin",
      locations: [],
      source: "network_failure_simulation",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("temporarily unavailable");
    spy.mockRestore();
  });
});
