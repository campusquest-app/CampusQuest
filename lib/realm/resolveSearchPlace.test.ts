import { describe, expect, it } from "vitest";
import { resolveSearchPlaceMatch } from "@/lib/realm/resolveSearchPlace";
import type { PlaceSearchResult } from "@/lib/realm/placesSearch";

const weldinPlace: PlaceSearchResult = {
  placeId: "ChIJ-test-weldin",
  name: "Weldin Hall",
  description: "Weldin Hall, Kingston, RI",
  lat: 41.4865,
  lng: -71.5312,
  formattedAddress: "Weldin Hall, Kingston, RI 02881",
};

describe("resolveSearchPlaceMatch", () => {
  it("matches landmark by name", () => {
    const match = resolveSearchPlaceMatch({
      place: weldinPlace,
      landmarks: [{ id: "engineering-hall", name: "Engineering Hall", shortLabel: "Eng" }],
      supplementaryPins: [
        {
          groupKey: "ext-event:weldin-hall",
          locationKey: null,
          realmLocationId: null,
          locationName: "Weldin Hall",
          locationAddress: null,
          x: 50,
          y: 50,
          lat: 41.4865,
          lng: -71.5312,
          attachToLandmark: false,
          qrCodes: [],
          quests: [],
          events: [{ id: "e1" } as never],
        },
      ],
    });
    expect(match.kind).toBe("group");
    if (match.kind === "group") {
      expect(match.group.groupKey).toBe("ext-event:weldin-hall");
    }
  });

  it("creates synthetic place when no catalog match", () => {
    const match = resolveSearchPlaceMatch({
      place: weldinPlace,
      landmarks: [],
      supplementaryPins: [],
    });
    expect(match.kind).toBe("place");
    if (match.kind === "place") {
      expect(match.group.groupKey).toBe(`search:${weldinPlace.placeId}`);
      expect(match.group.lat).toBe(weldinPlace.lat);
    }
  });
});
