import { describe, expect, it } from "vitest";
import { buildCampusQuestScanUrl } from "@/lib/server/qrCodeAdmin";

describe("buildCampusQuestScanUrl", () => {
  it("encodes secure scan URLs with token codes, not quest titles", () => {
    const url = buildCampusQuestScanUrl("CQ_ABC123XYZ", "https://campusquestapp.com");
    expect(url).toBe("https://campusquestapp.com/scan?code=CQ_ABC123XYZ");
    expect(url).not.toContain("Visit");
  });
});

describe("campusLocationFormToPayload", () => {
  it("uses camelCase keys for admin quest API payloads", async () => {
    const { campusLocationFormToPayload } = await import("@/lib/campusLocations");
    expect(
      campusLocationFormToPayload({
        locationKey: "library",
        locationName: "Library",
        locationAddress: "",
        locationLat: "",
        locationLng: "",
      }),
    ).toEqual({
      locationKey: "library",
      locationId: "library",
      locationName: "Library",
    });
  });
});
