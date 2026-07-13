import { describe, expect, it } from "vitest";
import {
  buildUriBuildingGeocodeQuery,
  scoreGeocodeResult,
  validateGeocodeResult,
} from "@/lib/server/geocoding/googleCampusGeocoder";
import { isRejectedRoadResult, isBroadCampusOnlyResult } from "@/lib/server/urinvolved/uriCampusBounds";

describe("googleCampusGeocoder validation", () => {
  it("builds URI-specific Google queries", () => {
    expect(buildUriBuildingGeocodeQuery("weldin hall")).toBe(
      "Weldin Hall, University of Rhode Island, Kingston, RI",
    );
  });

  it("rejects Flagg Road results", () => {
    expect(isRejectedRoadResult("123 Flagg Rd, Kingston, RI")).toBe(true);
    const validation = validateGeocodeResult({
      requestedBuilding: "weldin hall",
      formattedAddress: "123 Flagg Rd, Kingston, RI 02881",
      name: "Flagg Rd",
      latitude: 41.49135,
      longitude: -71.52814,
      confidence: scoreGeocodeResult({
        requestedBuilding: "weldin hall",
        formattedAddress: "123 Flagg Rd, Kingston, RI 02881",
        name: "Flagg Rd",
        types: ["route"],
      }),
    });
    expect(validation.accepted).toBe(false);
    expect(validation.reason).toBe("road_only_result");
  });

  it("rejects broad University of Rhode Island results for a specific building", () => {
    expect(isBroadCampusOnlyResult("University of Rhode Island", "weldin hall")).toBe(true);
    const validation = validateGeocodeResult({
      requestedBuilding: "weldin hall",
      formattedAddress: "University of Rhode Island, Kingston, RI",
      name: "University of Rhode Island",
      latitude: 41.487,
      longitude: -71.53,
      confidence: 0.8,
    });
    expect(validation.accepted).toBe(false);
    expect(validation.reason).toBe("broad_campus_result");
  });

  it("accepts a building result on campus", () => {
    const validation = validateGeocodeResult({
      requestedBuilding: "weldin hall",
      formattedAddress: "Weldin Hall, 2 Lippitt Rd, Kingston, RI 02881",
      name: "Weldin Hall",
      latitude: 41.4908,
      longitude: -71.5294,
      confidence: 0.92,
    });
    expect(validation.accepted).toBe(true);
  });
});
