import { describe, expect, it } from "vitest";
import { matchCampusLocation, normalizeAddressForMatching } from "@/lib/server/urinvolved/locationAliases";
import { resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";

describe("normalizeAddressForMatching", () => {
  it("normalizes glued city text and road abbreviations", () => {
    expect(normalizeAddressForMatching("15 Lippitt RoadKingston, RI 02881")).toBe(
      "15 lippitt rd kingston ri 02881",
    );
    expect(normalizeAddressForMatching("50 Lower College Road, Kingston RI")).toBe(
      "50 lower college rd kingston ri",
    );
  });
});

describe("address-based campus location matching", () => {
  it.each([
    ["5 Lippitt Rd, Kingston, RI 02881", "the-quad"],
    ["5 Lippitt Road", "the-quad"],
    ["15 Lippitt RoadKingston, RI 02881", "library"],
    ["15 Lippitt Rd", "library"],
    ["50 Lower College Rd", "memorial-union"],
    ["50 Lower College Road, Kingston RI", "memorial-union"],
    ["18 Butterfield Road", "rec-center"],
    ["18 Butterfield Rd, Kingston, RI 02881", "rec-center"],
  ] as const)("matches %s to %s", (address, realmLocationId) => {
    const match = matchCampusLocation(address);
    expect(match).not.toBeNull();
    expect(match?.realmLocationId).toBe(realmLocationId);
    expect(match?.mapPinAvailable).toBe(true);
    expect(match?.latitude).toBeGreaterThan(41);
  });
});

describe("resolveUrinvolvedEventLocation priority", () => {
  it("matches by location_name when venue is unknown but address is known", () => {
    const resolved = resolveUrinvolvedEventLocation({
      venueName: null,
      address: "5 Lippitt Rd, Kingston, RI 02881",
    });

    expect(resolved.matchedBy).toBe("location_name");
    expect(resolved.locationMatch?.realmLocationId).toBe("the-quad");
    expect(resolved.mapPinAvailable).toBe(true);
  });

  it("prefers venue match before address", () => {
    const resolved = resolveUrinvolvedEventLocation({
      venueName: "Memorial Union",
      address: "5 Lippitt Rd, Kingston, RI 02881",
    });

    expect(resolved.matchedBy).toBe("venue");
    expect(resolved.locationMatch?.realmLocationId).toBe("memorial-union");
  });

  it("does not guess coordinates for unknown addresses", () => {
    const resolved = resolveUrinvolvedEventLocation({
      venueName: null,
      address: "123 Unknown Street, Providence, RI",
    });

    expect(resolved.locationMatch).toBeNull();
    expect(resolved.aliasMatched).toBe(false);
  });
});
