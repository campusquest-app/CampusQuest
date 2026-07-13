import { describe, expect, it } from "vitest";
import {
  mapEventToRealmLocation,
  matchEventLocationWithMeta,
  normalizeEventLocationText,
} from "@/lib/server/urinvolved/mapEventLocationMatch";

const CATALOG = [
  { slug: "weldin-hall", name: "Weldin Hall" },
  { slug: "memorial-union", name: "Memorial Union" },
  { slug: "library", name: "Library" },
  { slug: "the-quad", name: "The Quad" },
  { slug: "rec-center", name: "Rec Center" },
];

const CATALOG_WITHOUT_WELDIN = CATALOG.filter((c) => c.slug !== "weldin-hall");

function realmId(match: ReturnType<typeof mapEventToRealmLocation>): string | null {
  return match?.kind === "realm" ? match.realmLocationId : null;
}

describe("normalizeEventLocationText", () => {
  it("strips room numbers for matching", () => {
    expect(normalizeEventLocationText("Memorial Union Room 318")).toBe("memorial union");
    expect(normalizeEventLocationText("Weldin Hall - Lounge")).toBe("weldin hall");
  });
});

describe("mapEventToRealmLocation", () => {
  it("matches exact catalog names case-insensitively", () => {
    expect(realmId(mapEventToRealmLocation({ locationName: "weldin hall" }, CATALOG))).toBe("weldin-hall");
    expect(realmId(mapEventToRealmLocation({ locationName: "Weldin Hall" }, CATALOG))).toBe("weldin-hall");
  });

  it("matches memorial union with room suffix", () => {
    expect(
      realmId(mapEventToRealmLocation({ venueName: "Memorial Union Room 318" }, CATALOG)),
    ).toBe("memorial-union");
  });

  it("matches uri library alias to library", () => {
    expect(realmId(mapEventToRealmLocation({ locationName: "URI Library" }, CATALOG))).toBe("library");
  });

  it("matches mackal field house to rec center", () => {
    expect(realmId(mapEventToRealmLocation({ locationName: "Mackal Field House" }, CATALOG))).toBe(
      "rec-center",
    );
  });

  it("returns confidence metadata for fuzzy matches", () => {
    const result = matchEventLocationWithMeta({ locationName: "Carothers Library" }, CATALOG);
    expect(result?.meta.confidence).toBeGreaterThan(0.8);
    expect(realmId(result?.match ?? null)).toBe("library");
  });

  it("falls back to alias coordinates when the building is not in the catalog", () => {
    const match = mapEventToRealmLocation(
      { venueName: "Weldin Hall First Floor Lounge" },
      CATALOG_WITHOUT_WELDIN,
    );
    expect(match?.kind).toBe("coords");
    if (match?.kind === "coords") {
      expect(match.locationName).toBe("Weldin Hall");
      expect(match.latitude).toBeCloseTo(41.4908, 3);
    }
  });

  it("returns null for unknown locations and junk", () => {
    expect(mapEventToRealmLocation({ locationName: "Narragansett Beach" }, CATALOG)).toBeNull();
    expect(mapEventToRealmLocation({ locationName: "Hall" }, CATALOG)).toBeNull();
    expect(mapEventToRealmLocation({}, CATALOG)).toBeNull();
  });
});
