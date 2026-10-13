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

  it("keeps layers, locate, and camera actions on the same stack", () => {
    expect(controls).toContain("toggleLayer");
    expect(controls).toContain("Center map on my location");
    expect(controls).toContain("camera.toggleTilt");
    expect(controls).toContain("camera.toggleBuildings");
  });

  it("offsets the stack below top chrome with safe-area-aware CSS", () => {
    expect(css).toContain("--cq-realm-map-controls-clearance");
    expect(css).toContain("env(safe-area-inset-top");
    expect(css).toContain("env(safe-area-inset-right");
    expect(css).toContain("transform-origin: top right");
  });
});
