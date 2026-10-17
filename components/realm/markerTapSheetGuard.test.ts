import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const marker = readFileSync(join(root, "components/realm/CampusQuestMapMarker.tsx"), "utf8");
const googleMap = readFileSync(join(root, "components/realm/GoogleRealmMap.tsx"), "utf8");
const realmMap = readFileSync(join(root, "components/realm/RealmMap.tsx"), "utf8");

describe("marker tap → sheet open guard", () => {
  it("fires onTapIntent before opening so map background clicks can be suppressed", () => {
    expect(marker).toContain("onTapIntent");
    expect(marker).toContain("onTapIntentRef.current?.()");
    expect(marker).toMatch(/onTapIntentRef\.current\?\.\(\);[\s\S]*onClickRef\.current\?\.\(\)/);
  });

  it("suppresses Maps API background clicks after marker taps", () => {
    expect(googleMap).toContain("createMapClickSuppressor");
    expect(googleMap).toContain("suppressMapClickFromMarkerTap");
    expect(googleMap).toContain("onMarkerTapIntent={suppressMapClickFromMarkerTap}");
    expect(googleMap).toContain("mapClickSuppressorRef.current.isSuppressed()");
  });

  it("keeps parent background-close from wiping a just-opened sheet", () => {
    expect(realmMap).toContain("armBackgroundCloseGuard");
    expect(realmMap).toContain("ignoreBackgroundCloseUntilRef");
    expect(realmMap).toContain("Date.now() < ignoreBackgroundCloseUntilRef.current");
    expect(realmMap).toMatch(/armBackgroundCloseGuard\(\);[\s\S]*setSheetOpen\(true\)/);
  });

  it("wires landmark, supplementary/group, and urinvolved edit markers through onTapIntent", () => {
    const intents = googleMap.match(/onTapIntent=\{onMarkerTapIntent\}/g) ?? [];
    expect(intents.length).toBeGreaterThanOrEqual(3);
    // All interactive content markers share CampusQuestMapMarker + onTapIntent.
    expect(googleMap).toContain("handleLandmarkTap");
    expect(googleMap).toContain("handleGroupTap");
  });

  it("arms the background-close guard for landmark, supplementary, and event-detail opens", () => {
    const arms = realmMap.match(/armBackgroundCloseGuard\(\)/g) ?? [];
    expect(arms.length).toBeGreaterThanOrEqual(3);
  });

  it("does not open from a click that looks like a pan", () => {
    expect(marker).toContain("shouldFireMapMarkerTap(tap, { x: e.clientX, y: e.clientY })");
    expect(marker).toContain("if (tap.t > 0 && !shouldFireMapMarkerTap");
  });
});
