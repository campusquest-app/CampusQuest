import { describe, expect, it } from "vitest";
import { matchCampusLocation } from "@/lib/server/urinvolved/locationAliases";

describe("matchCampusLocation", () => {
  it("matches Memorial Union aliases", () => {
    const match = matchCampusLocation("Memorial Union");
    expect(match).not.toBeNull();
    expect(match?.realmLocationId).toBe("memorial-union");
    expect(match?.latitude).toBeGreaterThan(41);
  });

  it("matches library aliases", () => {
    const match = matchCampusLocation("Carothers Library");
    expect(match?.realmLocationId).toBe("library");
  });

  it("matches Ryan Center without guessing unrelated pins", () => {
    const match = matchCampusLocation("Thomas M. Ryan Center");
    expect(match).not.toBeNull();
    expect(match?.realmLocationId).toBeUndefined();
    expect(match?.latitude).toBeCloseTo(41.4865, 2);
  });

  it("matches Barlow Hall and MSSC aliases", () => {
    expect(matchCampusLocation("Barlow Hall-Lounge")?.latitude).toBeCloseTo(41.4818, 2);
    expect(matchCampusLocation("Multicultural Student Services Center-Hardge Forum")?.latitude).toBeCloseTo(
      41.4869,
      2,
    );
  });

  it("matches Donigan Park for off-campus URInvolved events", () => {
    expect(matchCampusLocation("Donigan Park")?.latitude).toBeCloseTo(41.4372, 2);
  });

  it("returns null for unknown locations", () => {
    expect(matchCampusLocation("")).toBeNull();
  });
});
