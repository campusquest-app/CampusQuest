import { describe, expect, it, vi } from "vitest";
import {
  URI_MAP_CINEMATIC_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  moveMapCamera,
  rotateMapHeading,
  trySetMapTilt,
} from "@/lib/realm/googleMapPose";

describe("googleMapPose camera helpers", () => {
  it("rotateMapHeading wraps around 360", () => {
    const map = {
      getHeading: vi.fn(() => 350),
      getCenter: vi.fn(() => ({ lat: 41.48, lng: -71.53 })),
      getZoom: vi.fn(() => 18),
      getTilt: vi.fn(() => 0),
      setHeading: vi.fn(),
      panTo: vi.fn(),
      setZoom: vi.fn(),
      setTilt: vi.fn(),
    } as unknown as google.maps.Map;

    rotateMapHeading(map, URI_MAP_ROTATE_STEP_DEG);
    expect(map.setHeading).toHaveBeenCalledWith(5);
  });

  it("moveMapCamera uses moveCamera when available", () => {
    const moveCamera = vi.fn();
    const map = {
      getCenter: vi.fn(() => ({ lat: 41.48, lng: -71.53 })),
      getZoom: vi.fn(() => 17),
      getTilt: vi.fn(() => 0),
      getHeading: vi.fn(() => 0),
      moveCamera,
    } as unknown as google.maps.Map;

    moveMapCamera(map, { tilt: URI_MAP_CINEMATIC_TILT, zoom: 18 });
    expect(moveCamera).toHaveBeenCalled();
  });

  it("trySetMapTilt returns true when map accepts tilt", () => {
    const map = {
      getCenter: vi.fn(() => ({ lat: 41.48, lng: -71.53 })),
      getZoom: vi.fn(() => 18),
      getHeading: vi.fn(() => 0),
      setTilt: vi.fn(),
      getTilt: vi.fn(() => URI_MAP_CINEMATIC_TILT),
      panTo: vi.fn(),
      setZoom: vi.fn(),
      setHeading: vi.fn(),
    } as unknown as google.maps.Map;

    expect(trySetMapTilt(map, URI_MAP_CINEMATIC_TILT)).toBe(true);
  });

  it("trySetMapTilt returns false when map stays flat", () => {
    const map = {
      getCenter: vi.fn(() => ({ lat: 41.48, lng: -71.53 })),
      getZoom: vi.fn(() => 18),
      getHeading: vi.fn(() => 0),
      setTilt: vi.fn(),
      getTilt: vi.fn(() => 0),
      panTo: vi.fn(),
      setZoom: vi.fn(),
      setHeading: vi.fn(),
    } as unknown as google.maps.Map;

    expect(trySetMapTilt(map, URI_MAP_CINEMATIC_TILT)).toBe(false);
  });
});
