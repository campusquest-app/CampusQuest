import { describe, expect, it } from "vitest";
import {
  buildExternalEventLocationName,
  externalEventHasLocationData,
  externalEventLocationLines,
} from "@/lib/externalEventLocation";
import { buildUrinvolvedAddressString, resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";

describe("buildExternalEventLocationName", () => {
  it("combines venue and address when both exist", () => {
    expect(
      buildExternalEventLocationName("Memorial Union Ballroom", "50 Lower College Rd, Kingston, RI"),
    ).toBe("Memorial Union Ballroom, 50 Lower College Rd, Kingston, RI");
  });

  it("uses venue only when address is missing", () => {
    expect(buildExternalEventLocationName("Memorial Union", null)).toBe("Memorial Union");
  });

  it("uses address only when venue is missing", () => {
    expect(buildExternalEventLocationName(null, "50 Lower College Rd, Kingston, RI")).toBe(
      "50 Lower College Rd, Kingston, RI",
    );
  });

  it("falls back to Location TBA", () => {
    expect(buildExternalEventLocationName(null, null)).toBe("Location TBA");
  });
});

describe("externalEventLocationLines", () => {
  it("returns separate venue and address lines", () => {
    expect(
      externalEventLocationLines("Memorial Union Ballroom", "50 Lower College Rd, Kingston, RI"),
    ).toEqual({
      venue: "Memorial Union Ballroom",
      address: "50 Lower College Rd, Kingston, RI",
    });
  });
});

describe("externalEventHasLocationData", () => {
  it("detects missing location data", () => {
    expect(externalEventHasLocationData(null, null, "Location TBA")).toBe(false);
    expect(externalEventHasLocationData("Memorial Union", null, "Memorial Union")).toBe(true);
  });
});

describe("buildUrinvolvedAddressString", () => {
  it("prefers the full address string from URInvolved", () => {
    expect(
      buildUrinvolvedAddressString({
        name: "Memorial Union",
        address: "74 Lower College Road, Kingston, Rhode Island",
        line1: "74 Lower College Road",
        line2: null,
        city: "Kingston",
        state: "Rhode Island",
        zip: null,
        latitude: 41.48587,
        longitude: -71.52937,
      }),
    ).toBe("74 Lower College Road, Kingston, Rhode Island");
  });
});

describe("resolveUrinvolvedEventLocation", () => {
  it("matches campus coordinates from venue name, not address", () => {
    const resolved = resolveUrinvolvedEventLocation({
      venueName: "Multicultural Student Services Center-Hardge Forum",
      address: "74 Lower College Road, Kingston, Rhode Island",
    });

    expect(resolved.venueName).toBe("Multicultural Student Services Center-Hardge Forum");
    expect(resolved.address).toBe("74 Lower College Road, Kingston, Rhode Island");
    expect(resolved.locationMatch).not.toBeNull();
    expect(resolved.locationMatch?.latitude).toBeTruthy();
  });

  it("does not guess coordinates when venue is unknown", () => {
    const resolved = resolveUrinvolvedEventLocation({
      venueName: null,
      address: "123 Unknown Street, Providence, RI",
    });

    expect(resolved.locationMatch).toBeNull();
  });
});
