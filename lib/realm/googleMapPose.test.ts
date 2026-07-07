import { describe, expect, it, vi } from "vitest";
import {
  URI_MAP_CINEMATIC_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  rotateMapHeading,
  trySetMapTilt,
} from "@/lib/realm/googleMapPose";

describe("googleMapPose camera helpers", () => {
  it("rotateMapHeading wraps around 360", () => {
    const map = {
      getHeading: vi.fn(() => 350),
      setHeading: vi.fn(),
    } as unknown as google.maps.Map;

    rotateMapHeading(map, URI_MAP_ROTATE_STEP_DEG);
    expect(map.setHeading).toHaveBeenCalledWith(5);
  });

  it("trySetMapTilt returns true when map accepts tilt", () => {
    const map = {
      setTilt: vi.fn(),
      getTilt: vi.fn(() => URI_MAP_CINEMATIC_TILT),
    } as unknown as google.maps.Map;

    expect(trySetMapTilt(map, URI_MAP_CINEMATIC_TILT)).toBe(true);
  });

  it("trySetMapTilt returns false when map stays flat", () => {
    const map = {
      setTilt: vi.fn(),
      getTilt: vi.fn(() => 0),
    } as unknown as google.maps.Map;

    expect(trySetMapTilt(map, URI_MAP_CINEMATIC_TILT)).toBe(false);
  });
});
