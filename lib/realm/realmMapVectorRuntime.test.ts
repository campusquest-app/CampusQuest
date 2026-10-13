import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const vectorInit = stripComments(read("components/realm/RealmMapVectorInit.tsx"));
const diagnostics = stripComments(read("components/realm/RealmMapVectorDiagnostics.tsx"));
const gestures = stripComments(read("components/realm/RealmMapCameraGestures.tsx"));
const googleMap = stripComments(read("components/realm/GoogleRealmMap.tsx"));

describe("Realm vector map runtime", () => {
  it("never changes renderingType after the map is created (Maps JS 3.66+ throws)", () => {
    for (const source of [vectorInit, diagnostics, gestures]) {
      expect(source).not.toMatch(/setRenderingType\s*\(/);
      expect(source).not.toMatch(/setOptions\(\s*\{[^}]*renderingType/);
    }
    expect(googleMap).toMatch(/renderingType=\{useVectorMapId \? "VECTOR" : undefined\}/);
  });

  it("keeps dev diagnostics read-only so they cannot flatten the user's camera", () => {
    expect(diagnostics).not.toMatch(/moveCamera\s*\(/);
    expect(diagnostics).not.toMatch(/set(Tilt|Heading|Zoom)\s*\(/);
  });

  it("falls back to the map error card when Google rejects the key or referrer", () => {
    expect(googleMap).toContain("gm_authFailure");
    expect(googleMap).toMatch(/gm_authFailure = \(\) => \{[\s\S]*?setApiError\(true\)/);
  });

  it("keeps the swipe lock while any finger remains on the map", () => {
    expect(gestures).toContain("setPanningAttr(event.touches.length > 0)");
  });
});
