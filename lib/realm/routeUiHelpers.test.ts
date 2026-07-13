import { describe, expect, it } from "vitest";
import type { RealmDirectionsDestination, RealmDirectionsStatus } from "@/lib/realm/realmDirectionsTypes";
import { isDirectionsLoadingForDestination } from "@/lib/realm/routeUiHelpers";

describe("isDirectionsLoadingForDestination", () => {
  const destination: RealmDirectionsDestination = {
    id: "library",
    label: "Library",
    lat: 41.4871,
    lng: -71.5305,
  };

  it("returns true only for the loading destination", () => {
    const loading: RealmDirectionsStatus = {
      status: "loading",
      travelMode: "WALKING",
      destinationLabel: "Library",
      destinationId: "library",
    };
    expect(isDirectionsLoadingForDestination(destination, loading)).toBe(true);
    expect(
      isDirectionsLoadingForDestination(
        { ...destination, id: "gym", label: "Gym" },
        loading,
      ),
    ).toBe(false);
  });

  it("returns false for idle and ready states", () => {
    expect(isDirectionsLoadingForDestination(destination, { status: "idle" })).toBe(false);
    expect(
      isDirectionsLoadingForDestination(destination, {
        status: "ready",
        travelMode: "WALKING",
        destinationLabel: "Library",
        summary: {
          durationText: "5 min",
          distanceText: "0.2 mi",
          distanceMeters: 320,
          durationSeconds: 300,
        },
        origin: {
          lat: 41.4862,
          lng: -71.5309,
          label: "You",
          usedFallback: false,
          hint: null,
        },
      }),
    ).toBe(false);
  });
});
