import { describe, expect, it } from "vitest";
import { campusLocationFormToPayload, resolveCampusLocation } from "@/lib/campusLocations";
import { createQrCodeSchema } from "@/lib/server/qrCodeInput";

describe("resolveCampusLocation", () => {
  it("resolves memorial union preset with coordinates", () => {
    const resolved = resolveCampusLocation({ location_key: "memorial_union" });
    expect(resolved.locationName).toBe("Memorial Union");
    expect(resolved.locationAddress).toContain("50 Lower College Rd");
    expect(resolved.locationLat).toBeCloseTo(41.4868, 3);
    expect(resolved.showOnMap).toBe(true);
    expect(resolved.mapPinX).not.toBeNull();
  });

  it("allows other without coordinates for admin only", () => {
    const resolved = resolveCampusLocation({
      location_key: "other",
      location_name: "Secret Garden",
      location_address: "Behind the chapel",
    });
    expect(resolved.locationKey).toBe("other");
    expect(resolved.showOnMap).toBe(false);
  });
});

describe("createQrCodeSchema location payload", () => {
  it("accepts quest QR payload with preset location", () => {
    const parsed = createQrCodeSchema.parse({
      name: "Quest QR Code",
      qr_type: "quest_completion",
      location_key: "memorial_union",
      xp_reward: 50,
      is_active: true,
    });
    expect(parsed.locationKey).toBe("memorial_union");
    expect(parsed.locationLat).not.toBeNull();
  });
});

describe("campusLocationFormToPayload", () => {
  it("serializes preset location_key only", () => {
    expect(
      campusLocationFormToPayload({
        locationKey: "quad",
        locationName: "Quad",
        locationAddress: "",
        locationLat: "",
        locationLng: "",
      }),
    ).toEqual({ locationKey: "quad" });
  });

  it("emits explicit nulls when clearing location on edit", () => {
    expect(
      campusLocationFormToPayload(
        {
          locationKey: "",
          locationName: "",
          locationAddress: "",
          locationLat: "",
          locationLng: "",
        },
        { clearWhenEmpty: true },
      ),
    ).toEqual({
      locationKey: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      mapPinX: null,
      mapPinY: null,
    });
  });
});
