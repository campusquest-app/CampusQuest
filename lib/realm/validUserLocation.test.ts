import { describe, expect, it } from "vitest";
import { trustedCampusUserLocation } from "@/lib/realm/discoverySheet";
import {
  USER_LOCATION_MAX_ACCURACY_METERS,
  USER_LOCATION_MAX_AGE_MS,
  isValidUserLocation,
  validUserLocationFromFix,
  type ValidUserLocation,
} from "@/lib/realm/validUserLocation";
import { walkingAwayLabelForUser } from "@/lib/realm/realmMapDiscovery";

const MEMORIAL_UNION = { lat: 41.4868, lng: -71.5301 };

function device(partial: Partial<ValidUserLocation> = {}): ValidUserLocation {
  return {
    lat: 41.4862,
    lng: -71.5309,
    accuracyMeters: 20,
    timestamp: Date.now(),
    source: "device",
    ...partial,
  };
}

describe("isValidUserLocation", () => {
  it("accepts a recent accurate device fix", () => {
    expect(isValidUserLocation(device())).toBe(true);
  });

  it("rejects campus-looking coords that are not a device source", () => {
    expect(
      isValidUserLocation({
        lat: 41.4871,
        lng: -71.5305,
        accuracyMeters: 15,
        timestamp: Date.now(),
        source: "campus" as ValidUserLocation["source"],
      }),
    ).toBe(false);
  });

  it("rejects missing accuracy, 0,0, and stale fixes", () => {
    expect(validUserLocationFromFix({ lat: 41.4862, lng: -71.5309 })).toBeNull();
    expect(isValidUserLocation(device({ lat: 0, lng: 0 }))).toBe(false);
    expect(
      isValidUserLocation(device({ timestamp: Date.now() - USER_LOCATION_MAX_AGE_MS - 1_000 })),
    ).toBe(false);
    expect(
      isValidUserLocation(device({ accuracyMeters: USER_LOCATION_MAX_ACCURACY_METERS + 1 })),
    ).toBe(false);
  });
});

describe("trustedCampusUserLocation", () => {
  it("accepts a valid on-campus device fix", () => {
    const loc = device();
    expect(trustedCampusUserLocation(loc)).toEqual(loc);
  });

  it("rejects a stale fix", () => {
    expect(
      trustedCampusUserLocation(
        device({ timestamp: Date.now() - USER_LOCATION_MAX_AGE_MS - 1_000 }),
      ),
    ).toBeNull();
  });

  it("rejects an off-campus fix", () => {
    expect(trustedCampusUserLocation(device({ lat: 41.824, lng: -71.4128 }))).toBeNull();
  });

  it("rejects when there is no permission / no fix", () => {
    expect(trustedCampusUserLocation(null)).toBeNull();
    expect(validUserLocationFromFix(null)).toBeNull();
  });

  it("rejects coarse / denied-quality fixes", () => {
    expect(
      trustedCampusUserLocation(device({ accuracyMeters: USER_LOCATION_MAX_ACCURACY_METERS + 1 })),
    ).toBeNull();
  });
});

describe("walkingAwayLabelForUser", () => {
  it("does not label Memorial Union as minutes away from map-center or missing GPS", () => {
    expect(walkingAwayLabelForUser(null, MEMORIAL_UNION)).toBeNull();
    expect(
      walkingAwayLabelForUser(
        {
          lat: 41.4871,
          lng: -71.5305,
          accuracyMeters: 15,
          timestamp: Date.now(),
          source: "campus" as ValidUserLocation["source"],
        },
        MEMORIAL_UNION,
      ),
    ).toBeNull();
  });

  it("does not show a walking ETA when the device is miles from campus", () => {
    const providence = device({ lat: 41.824, lng: -71.4128 });
    expect(walkingAwayLabelForUser(providence, MEMORIAL_UNION)).toBeNull();
  });

  it("shows a walking-away label only for a current on-campus device fix", () => {
    const label = walkingAwayLabelForUser(device(), MEMORIAL_UNION);
    expect(label).toMatch(/min away/);
  });
});
