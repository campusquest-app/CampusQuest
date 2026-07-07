import { describe, expect, it } from "vitest";
import { buildGoogleMapsDirectionsUrl } from "./googleMapsNavigationUrl";

describe("buildGoogleMapsDirectionsUrl", () => {
  it("builds a walking directions URL", () => {
    const url = buildGoogleMapsDirectionsUrl({
      origin: { lat: 41.4871, lng: -71.5305 },
      destination: { lat: 41.4876, lng: -71.5312 },
      travelMode: "WALKING",
    });
    expect(url).toContain("travelmode=walking");
    expect(url).toContain("origin=41.4871%2C-71.5305");
    expect(url).toContain("destination=41.4876%2C-71.5312");
  });

  it("builds a driving directions URL", () => {
    const url = buildGoogleMapsDirectionsUrl({
      origin: { lat: 1, lng: 2 },
      destination: { lat: 3, lng: 4 },
      travelMode: "DRIVING",
    });
    expect(url).toContain("travelmode=driving");
  });
});
