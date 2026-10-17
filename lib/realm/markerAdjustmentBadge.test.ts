import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("manual adjustment badge visibility", () => {
  const marker = readFileSync(join(process.cwd(), "components/realm/RealmMapMarker.tsx"), "utf8");
  const google = readFileSync(join(process.cwd(), "components/realm/GoogleRealmMap.tsx"), "utf8");
  const realm = readFileSync(join(process.cwd(), "components/realm/RealmMap.tsx"), "utf8");

  it("shows Adjusted only while edit mode is on", () => {
    expect(marker).toContain("editMode && locationAdjusted");
    expect(marker).not.toMatch(/\{locationAdjusted \? \([\s\S]*Adjusted/);
  });

  it("does not paint Adjusted on normal-mode supplementary pins", () => {
    const supplementary = realm.slice(realm.indexOf("function SupplementaryLocationPin"));
    const body = supplementary.slice(0, supplementary.indexOf("function round2"));
    expect(body).not.toContain("Adjusted");
  });

  it("still shows Adjusted on edit-mode event pins", () => {
    expect(google).toContain("locationAdjusted={pin.locationManuallyAdjusted || Boolean(pin.unsaved)}");
    expect(realm).toContain("cq-realm-marker-adjusted--canvas");
  });
});
