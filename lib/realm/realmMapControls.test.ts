import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const controls = readFileSync(join(root, "components/realm/RealmMapControls.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

describe("Realm map control placement", () => {
  it("uses a single RIGHT_TOP stack instead of the lower-right slot", () => {
    expect(controls).toContain("ControlPosition.RIGHT_TOP");
    expect(controls).not.toContain("ControlPosition.RIGHT_BOTTOM");
    expect(controls.match(/<MapControl /g)?.length ?? 0).toBe(1);
    expect(controls).toContain("cq-realm-map-controls-stack");
  });

  it("keeps layers, highlights, campus home, and locate on the same stack", () => {
    expect(controls).toContain("toggleLayer");
    expect(controls).toContain("Rhody Highlights");
    expect(controls).toContain("Back to campus");
    expect(controls).toContain("Center map on my location");
    expect(controls).toContain("camera.toggleTilt");
    expect(controls).toContain("camera.toggleBuildings");
    const layersAt = controls.indexOf("aria-label={mapLayer === \"campus\"");
    const highlightsAt = controls.indexOf("Rhody Highlights");
    const campusAt = controls.indexOf("Back to campus");
    const locateAt = controls.indexOf("Center map on my location");
    expect(layersAt).toBeGreaterThan(-1);
    expect(layersAt).toBeLessThan(highlightsAt);
    expect(highlightsAt).toBeLessThan(campusAt);
    expect(campusAt).toBeLessThan(locateAt);
  });

  it("offsets the stack below top chrome with safe-area-aware CSS", () => {
    expect(css).toContain("--cq-realm-map-controls-clearance");
    expect(css).toContain("env(safe-area-inset-top");
    expect(css).toContain("env(safe-area-inset-right");
    expect(css).toContain("transform-origin: top right");
  });
});
