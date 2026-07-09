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

describe("normalizeLocationName", () => {
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeLocationName("  Weldin   Hall! ")).toBe("weldin hall");
    expect(normalizeLocationName("WELDIN HALL")).toBe("weldin hall");
  });
});

describe("mapEventToRealmLocation", () => {
  it("matches exact catalog names case-insensitively", () => {
    expect(
      mapEventToRealmLocation({ locationName: "weldin hall" }, CATALOG)?.realmLocationId,
    ).toBe("weldin-hall");
    expect(
      mapEventToRealmLocation({ locationName: "Weldin Hall" }, CATALOG)?.realmLocationId,
    ).toBe("weldin-hall");
  });

  it("matches with punctuation and room suffixes", () => {
    expect(
      mapEventToRealmLocation({ venueName: "Weldin Hall - Lounge" }, CATALOG)?.realmLocationId,
    ).toBe("weldin-hall");
  });

  it("matches via the URI alias table", () => {
    expect(
      mapEventToRealmLocation({ locationName: "Carothers Library" }, CATALOG)?.realmLocationId,
    ).toBe("library");
  });

  it("prefers venue over address", () => {
    const match = mapEventToRealmLocation(
      { venueName: "Memorial Union", address: "50 Lower College Rd" },
      CATALOG,
    );
    expect(match?.realmLocationId).toBe("memorial-union");
  });

  it("falls back to legacy address aliases", () => {
    const match = mapEventToRealmLocation({ address: "50 Lower College Rd, Kingston RI" }, CATALOG);
    expect(match?.realmLocationId).toBe("memorial-union");
  });

  it("returns null for unknown locations and junk", () => {
    expect(mapEventToRealmLocation({ locationName: "Narragansett Beach" }, CATALOG)).toBeNull();
    expect(mapEventToRealmLocation({ locationName: "Hall" }, CATALOG)).toBeNull();
    expect(mapEventToRealmLocation({}, CATALOG)).toBeNull();
  });
});
