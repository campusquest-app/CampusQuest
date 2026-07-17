import { describe, expect, it, vi } from "vitest";
import {
  URI_MAP_CINEMATIC_TILT,
  URI_MAP_FALLBACK_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  apply3dBuildingView,
  applyTiltCamera,
  centerToLiteral,
  moveMapCamera,
  rotateMapHeading,
  trySetMapTilt,
  waitForMapIdle,
} from "@/lib/realm/googleMapPose";

function createMockMap(overrides: Partial<google.maps.Map> = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const map = {
    getCenter: vi.fn(() => ({ lat: 41.48, lng: -71.53 })),
    getZoom: vi.fn(() => 17),
    getTilt: vi.fn(() => 0),
    getHeading: vi.fn(() => 0),
    setHeading: vi.fn(),
    panTo: vi.fn(),
    setZoom: vi.fn(),
    setTilt: vi.fn(),
    moveCamera: vi.fn(),
    addListener: vi.fn((event: string, handler: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(handler);
      return { remove: vi.fn() };
    }),
    ...overrides,
  } as unknown as google.maps.Map & { _fire: (event: string) => void };

  (map as { _fire: (event: string) => void })._fire = (event: string) => {
    for (const handler of listeners[event] ?? []) handler();
  };

  return map as google.maps.Map & { _fire: (event: string) => void };
}

describe("googleMapPose camera helpers", () => {
  it("centerToLiteral normalizes LatLng objects", () => {
    const latLng = {
      lat: () => 41.5,
      lng: () => -71.5,
    } as google.maps.LatLng;

    expect(centerToLiteral(latLng)).toEqual({ lat: 41.5, lng: -71.5 });
  });

  it("rotateMapHeading wraps around 360", () => {
    const map = createMockMap({
      getHeading: vi.fn(() => 350),
    });

    rotateMapHeading(map, URI_MAP_ROTATE_STEP_DEG);
    expect(map.moveCamera).toHaveBeenCalledWith(
      expect.objectContaining({ heading: (350 + URI_MAP_ROTATE_STEP_DEG) % 360 }),
    );
  });

  it("apply3dBuildingView requests zoom 18.5 and tilt 60", async () => {
    const map = createMockMap({
      getTilt: vi.fn(() => 60),
      getZoom: vi.fn(() => 17),
    });
    // Fire idle immediately so waitForMapIdle resolves.
    const resultPromise = apply3dBuildingView(map);
    queueMicrotask(() => map._fire("idle"));
    const tilt = await resultPromise;
    expect(map.moveCamera).toHaveBeenCalledWith(
      expect.objectContaining({ tilt: 60, zoom: 18.5 }),
    );
    expect(tilt).toBe(60);
  });

  it("moveMapCamera uses moveCamera when available", () => {
    const map = createMockMap();

    moveMapCamera(map, { tilt: URI_MAP_CINEMATIC_TILT, zoom: 18 });
    expect(map.moveCamera).toHaveBeenCalledWith(
      expect.objectContaining({ tilt: URI_MAP_CINEMATIC_TILT, zoom: 18 }),
    );
  });

  it("trySetMapTilt returns true when map accepts tilt", () => {
    const map = createMockMap({
      getTilt: vi.fn(() => URI_MAP_CINEMATIC_TILT),
    });

    expect(trySetMapTilt(map, URI_MAP_CINEMATIC_TILT)).toBe(true);
  });

  it("trySetMapTilt returns false when map stays flat", () => {
    const map = createMockMap();

    expect(trySetMapTilt(map, URI_MAP_CINEMATIC_TILT)).toBe(false);
  });

  it("waitForMapIdle resolves on idle event", async () => {
    vi.useFakeTimers();
    const map = createMockMap();
    const promise = waitForMapIdle(map, 5000);
    map._fire("idle");
    await promise;
    vi.useRealTimers();
  });

  it("applyTiltCamera waits for idle and returns accepted tilt", async () => {
    vi.useFakeTimers();
    let tilt = 0;
    const map = createMockMap({
      getTilt: vi.fn(() => tilt),
      getZoom: vi.fn(() => 18),
    });

    const promise = applyTiltCamera(map, { preserveCenter: true, preserveHeading: true });
    tilt = URI_MAP_FALLBACK_TILT;
    map._fire("idle");
    await vi.runAllTimersAsync();

    const actual = await promise;
    expect(actual).toBe(URI_MAP_FALLBACK_TILT);
    expect(map.moveCamera).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

