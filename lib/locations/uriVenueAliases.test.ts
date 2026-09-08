import { describe, expect, it } from "vitest";
import {
  canonicalVenueCoordinates,
  canonicalVenueGeocodeQuery,
  listUriCanonicalVenues,
  resolveUriCanonicalVenue,
  resolveUriCanonicalVenueFromFields,
} from "@/lib/locations/uriVenueAliases";
import { mapEventToRealmLocation, matchEventLocationWithMeta } from "@/lib/server/urinvolved/mapEventLocationMatch";
import { matchCanonicalSafeRegistryEntry, type CampusBuildingRegistryEntry } from "@/lib/server/urinvolved/campusBuildingRegistry";
import { validateGeocodeResult } from "@/lib/server/geocoding/googleCampusGeocoder";
import {
  isImpreciseGeocodeResult,
  isPlaceholderCampusCoordinate,
  isWithinUriCampusBounds,
} from "@/lib/server/urinvolved/uriCampusBounds";

const CATALOG = [
  { slug: "memorial-union", name: "Memorial Union" },
  { slug: "library", name: "Library" },
  { slug: "the-quad", name: "The Quad" },
  { slug: "rec-center", name: "Rec Center" },
];

function registryEntry(partial: Partial<CampusBuildingRegistryEntry> & Pick<CampusBuildingRegistryEntry, "slug" | "canonicalName">): CampusBuildingRegistryEntry {
  return {
    aliases: [],
    latitude: 41.4871,
    longitude: -71.5305,
    googlePlaceId: null,
    formattedAddress: null,
    verified: false,
    geocodeSource: null,
    updatedAt: "2026-09-07T00:00:00.000Z",
    ...partial,
  };
}

describe("canonical URI venue registry", () => {
  it("resolves known venue names, including athletics feed formatting", () => {
    expect(resolveUriCanonicalVenue("URI Soccer Complex")?.venue.id).toBe("uri-soccer-complex");
    expect(resolveUriCanonicalVenue("Kingston, R.I., URI Soccer Complex")?.venue.id).toBe("uri-soccer-complex");
    expect(resolveUriCanonicalVenue("Meade Stadium")?.venue.id).toBe("meade-stadium");
    expect(resolveUriCanonicalVenue("Kingston, RI, Thomas M. Ryan Center")?.venue.id).toBe("ryan-center");
    expect(resolveUriCanonicalVenue("Boss Ice Arena")?.venue.id).toBe("boss-ice-arena");
    expect(resolveUriCanonicalVenue("Keaney Gymnasium")?.venue.id).toBe("keaney-gymnasium");
    expect(resolveUriCanonicalVenue("Memorial Union Room 318")?.venue.id).toBe("memorial-union");
    expect(resolveUriCanonicalVenue("Robert L. Carothers Library")?.venue.id).toBe("carothers-library");
  });

  it("collapses soccer aliases onto one canonical venue with one set of coordinates", () => {
    const aliases = [
      "URI Soccer Complex",
      "Soccer Complex",
      "URI Soccer Field",
      "Soccer Field",
      "Rhode Island Soccer Complex",
    ];
    const ids = new Set(aliases.map((alias) => resolveUriCanonicalVenue(alias)?.venue.id));
    expect(ids).toEqual(new Set(["uri-soccer-complex"]));

    const coords = canonicalVenueCoordinates(resolveUriCanonicalVenue("Soccer Field")!.venue);
    expect(coords).toEqual({ latitude: 41.4838, longitude: -71.5348 });
    expect(isWithinUriCampusBounds(coords!.latitude, coords!.longitude)).toBe(true);
  });

  it("does not match on a bare sport name or an unrelated venue", () => {
    expect(resolveUriCanonicalVenue("Soccer")).toBeNull();
    expect(resolveUriCanonicalVenue("University of Rhode Island")).toBeNull();
    expect(resolveUriCanonicalVenue("Pawtucket, RI, Centreville Bank Stadium")).toBeNull();
    expect(resolveUriCanonicalVenue("North Andover, MA")).toBeNull();
  });

  it("canonicalizes venues we have no coordinates for instead of inventing a position", () => {
    const softball = resolveUriCanonicalVenue("Softball Complex");
    expect(softball?.venue.id).toBe("uri-softball-complex");
    expect(canonicalVenueCoordinates(softball!.venue)).toBeNull();
    expect(canonicalVenueGeocodeQuery(softball!.venue)).toBe(
      "URI Softball Complex, University of Rhode Island, Kingston, RI",
    );
  });

  it("keeps every venue that carries coordinates inside the Kingston campus bounds", () => {
    for (const venue of listUriCanonicalVenues()) {
      const coords = canonicalVenueCoordinates(venue);
      if (!coords || !venue.onKingstonCampus) continue;
      expect(isWithinUriCampusBounds(coords.latitude, coords.longitude)).toBe(true);
      expect(isPlaceholderCampusCoordinate(coords.latitude, coords.longitude)).toBe(false);
    }
  });
});

describe("event location resolution priority", () => {
  it("places a URI soccer game at the Soccer Complex, not a generic campus landmark", () => {
    const match = mapEventToRealmLocation(
      { venueName: "Kingston, R.I., URI Soccer Complex", locationName: "Kingston, R.I., URI Soccer Complex" },
      CATALOG,
    );
    expect(match?.kind).toBe("coords");
    if (match?.kind !== "coords") throw new Error("expected coords match");
    expect(match.locationName).toBe("URI Soccer Complex");
    expect(match.latitude).toBe(41.4838);
    expect(match.longitude).toBe(-71.5348);
  });

  it("resolves Meade and Ryan athletics venues to their own coordinates", () => {
    const meade = mapEventToRealmLocation({ venueName: "Kingston, R.I., Meade Stadium" }, CATALOG);
    expect(meade).toMatchObject({ kind: "coords", latitude: 41.4844, longitude: -71.5328 });

    const ryan = mapEventToRealmLocation({ venueName: "Kingston, RI, Ryan Center" }, CATALOG);
    expect(ryan).toMatchObject({ kind: "coords", latitude: 41.4865, longitude: -71.5298 });
  });

  it("attaches a canonical venue to its existing landmark when it is the same place", () => {
    const match = mapEventToRealmLocation({ venueName: "Memorial Union Room 318" }, CATALOG);
    expect(match).toMatchObject({ kind: "realm", realmLocationId: "memorial-union" });
  });

  it("reports the canonical venue as the highest-confidence match reason", () => {
    const result = matchEventLocationWithMeta({ venueName: "URI Soccer Complex" }, CATALOG);
    expect(result?.meta.matchReason).toBe("canonical_venue");
    expect(result?.meta.confidence).toBeGreaterThan(0.95);
    expect(result?.meta.needsReview).toBe(false);
  });

  it("leaves an unrecognized venue unmatched rather than falling back to a nearby pin", () => {
    expect(mapEventToRealmLocation({ venueName: "Brambleweft Pavilion" }, CATALOG)).toBeNull();
    expect(mapEventToRealmLocation({ venueName: "TBD" }, CATALOG)).toBeNull();
  });
});

describe("registry matching cannot relocate a canonical venue", () => {
  // A sloppy "complex" alias is exactly what used to drag soccer games onto
  // the Rec Center through fuzzy containment matching.
  const registry = [
    registryEntry({
      slug: "rec-center",
      canonicalName: "Rec Center",
      aliases: ["complex"],
      latitude: 41.4849,
      longitude: -71.5288,
      verified: true,
    }),
  ];

  it("ignores a registry row that disagrees with the named canonical venue", () => {
    expect(matchCanonicalSafeRegistryEntry("Kingston, R.I., URI Soccer Complex", registry)).toBeNull();
  });

  it("still accepts a registry row that is the same canonical venue", () => {
    expect(matchCanonicalSafeRegistryEntry("Rec Center", registry)?.slug).toBe("rec-center");
  });

  it("leaves non-canonical location text on the normal registry path", () => {
    const withHall = [...registry, registryEntry({ slug: "swan-hall", canonicalName: "Swan Hall" })];
    expect(matchCanonicalSafeRegistryEntry("Swan Hall", withHall)?.slug).toBe("swan-hall");
  });
});

describe("coordinate and geocode validation", () => {
  it("rejects null island and the campus centroid as placeholder coordinates", () => {
    expect(isPlaceholderCampusCoordinate(0, 0)).toBe(true);
    expect(isPlaceholderCampusCoordinate(41.4875, -71.5305)).toBe(true);
    expect(isPlaceholderCampusCoordinate(Number.NaN, -71.53)).toBe(true);
    expect(isPlaceholderCampusCoordinate(41.4838, -71.5348)).toBe(false);
  });

  it("treats city / postal-code granularity as too coarse for a venue pin", () => {
    expect(isImpreciseGeocodeResult(["locality", "political"])).toBe(true);
    expect(isImpreciseGeocodeResult(["postal_code"])).toBe(true);
    expect(isImpreciseGeocodeResult([])).toBe(true);
    expect(isImpreciseGeocodeResult(["establishment", "point_of_interest"])).toBe(false);
    expect(isImpreciseGeocodeResult(["premise"])).toBe(false);
    expect(isImpreciseGeocodeResult(["street_address"])).toBe(false);
  });

  it("refuses geocode results that are off campus, imprecise, or the campus centroid", () => {
    const base = {
      requestedBuilding: "softball complex",
      formattedAddress: "URI Softball Complex, Kingston, RI 02881",
      name: "URI Softball Complex",
      latitude: 41.482,
      longitude: -71.533,
      confidence: 0.9,
      types: ["establishment", "point_of_interest"],
    };

    expect(validateGeocodeResult(base).accepted).toBe(true);

    expect(
      validateGeocodeResult({ ...base, latitude: 42.3601, longitude: -71.0589 }).reason,
    ).toBe("outside_campus_bounds");

    expect(
      validateGeocodeResult({ ...base, latitude: 41.4875, longitude: -71.5305 }).reason,
    ).toBe("placeholder_coordinates");

    expect(
      validateGeocodeResult({ ...base, types: ["locality", "political"] }).reason,
    ).toBe("imprecise_result_type");
  });
});

describe("venue/address changes re-resolve to the new venue", () => {
  it("moves an event from one canonical venue to another when its venue text changes", () => {
    const before = resolveUriCanonicalVenueFromFields({ venueName: "Kingston, R.I., Meade Stadium" });
    const after = resolveUriCanonicalVenueFromFields({ venueName: "Kingston, R.I., URI Soccer Complex" });

    expect(before?.venue.id).toBe("meade-stadium");
    expect(after?.venue.id).toBe("uri-soccer-complex");
    expect(canonicalVenueCoordinates(before!.venue)).not.toEqual(canonicalVenueCoordinates(after!.venue));
  });
});
