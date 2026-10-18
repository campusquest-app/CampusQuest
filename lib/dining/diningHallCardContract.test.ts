import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unified dining hall map cards", () => {
  const sheet = readFileSync("components/realm/RealmLocationSheet.tsx", "utf8");
  const card = readFileSync(
    "components/realm/locationDetail/DiningHallLocationCard.tsx",
    "utf8",
  );
  const menuSection = readFileSync(
    "components/realm/locationDetail/LocationDiningMenuSection.tsx",
    "utf8",
  );
  const preview = readFileSync("lib/dining/diningMenuPreview.ts", "utf8");

  it("routes both dining halls through one shared card component", () => {
    expect(sheet).toContain("DiningHallLocationCard");
    expect(sheet).toContain("isDiningMapLocation");
    expect(sheet).toContain("cq-loc-sheet--dining");
    expect(sheet).toMatch(/key=\{locationId\}/);
    expect(card).toContain("data-cq-dining-card");
    expect(card).toContain("diningHallShortDescription");
    expect(card).toContain("buildDiningMenuPreview");
    expect(card).toContain("View Full Menu");
    expect(card).toContain("Add Memory");
    expect(card).not.toContain("Walk Here");
  });

  it("never falls back to another dining hall's menu", () => {
    expect(menuSection).not.toContain('?? ("butterfield"');
    expect(menuSection).not.toContain('?? "butterfield"');
    expect(menuSection).not.toContain('?? ("butterfield" as DiningLocationId)');
    expect(menuSection).toContain("Never fall back to another dining hall");
    expect(menuSection).toContain("hall-mismatch");
    expect(menuSection).toContain('data-cq-dining-hall={hallId}');
    expect(card).toContain("data.location.id !== activeHall");
    expect(card).toContain('data-cq-dining-hall={hallId ?? "unresolved"}');
  });

  it("keeps Mainfare and Butterfield preview copy parallel but distinct", () => {
    expect(preview).toContain("All-you-care-to-eat on Butterfield Road.");
    expect(preview).toContain("Hope Commons dining with Mainfare stations.");
    expect(preview).not.toMatch(/butterfield[\s\S]*mainfare[\s\S]*Butterfield Road/i);
  });
});
