import { describe, expect, it } from "vitest";
import {
  mapEventToRealmLocation,
  normalizeLocationName,
} from "@/lib/server/urinvolved/mapEventLocationMatch";

const CATALOG = [
  { slug: "weldin-hall", name: "Weldin Hall" },
  { slug: "memorial-union", name: "Memorial Union" },
  { slug: "library", name: "Library" },
  { slug: "the-quad", name: "The Quad" },
];

// Real production catalog today — no Weldin Hall entry.
const CATALOG_WITHOUT_WELDIN = CATALOG.slice(1);

function realmId(match: ReturnType<typeof mapEventToRealmLocation>): string | null {
  return match?.kind === "realm" ? match.realmLocationId : null;
}

describe("normalizeLocationName", () => {
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeLocationName("  Weldin   Hall! ")).toBe("weldin hall");
    expect(normalizeLocationName("WELDIN HALL")).toBe("weldin hall");
  });
});

describe("mapEventToRealmLocation", () => {
  it("matches exact catalog names case-insensitively", () => {
    expect(realmId(mapEventToRealmLocation({ locationName: "weldin hall" }, CATALOG))).toBe("weldin-hall");
    expect(realmId(mapEventToRealmLocation({ locationName: "Weldin Hall" }, CATALOG))).toBe("weldin-hall");
  });

  it("matches with punctuation and room suffixes", () => {
    expect(realmId(mapEventToRealmLocation({ venueName: "Weldin Hall - Lounge" }, CATALOG))).toBe(
      "weldin-hall",
    );
    expect(
      realmId(mapEventToRealmLocation({ venueName: "Weldin Hall First Floor Lounge" }, CATALOG)),
    ).toBe("weldin-hall");
  });

  it("falls back to alias coordinates when the building is not in the catalog", () => {
    const match = mapEventToRealmLocation(
      { venueName: "Weldin Hall First Floor Lounge" },
      CATALOG_WITHOUT_WELDIN,
    );
    expect(match?.kind).toBe("coords");
    if (match?.kind === "coords") {
      expect(match.locationName).toBe("Weldin Hall");
      expect(match.latitude).toBeCloseTo(41.49135, 3);
    }
  });

  it("matches lowercase 'weldin hall' via alias coordinates", () => {
    const match = mapEventToRealmLocation({ locationName: "weldin hall" }, CATALOG_WITHOUT_WELDIN);
    expect(match?.kind).toBe("coords");
  });

  it("matches via the URI alias table into the catalog", () => {
    expect(realmId(mapEventToRealmLocation({ locationName: "Carothers Library" }, CATALOG))).toBe(
      "library",
    );
    expect(
      realmId(mapEventToRealmLocation({ locationName: "Robert L Carothers Library" }, CATALOG)),
    ).toBe("library");
  });

  it("prefers venue over address", () => {
    const match = mapEventToRealmLocation(
      { venueName: "Memorial Union", address: "50 Lower College Rd" },
      CATALOG,
    );
    expect(realmId(match)).toBe("memorial-union");
  });

  it("falls back to legacy address aliases", () => {
    const match = mapEventToRealmLocation({ address: "50 Lower College Rd, Kingston RI" }, CATALOG);
    expect(realmId(match)).toBe("memorial-union");
  });

  it("returns null for unknown locations and junk", () => {
    expect(mapEventToRealmLocation({ locationName: "Narragansett Beach" }, CATALOG)).toBeNull();
    expect(mapEventToRealmLocation({ locationName: "Hall" }, CATALOG)).toBeNull();
    expect(mapEventToRealmLocation({}, CATALOG)).toBeNull();
  });
});
