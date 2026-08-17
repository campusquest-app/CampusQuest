import { describe, expect, it } from "vitest";
import { resolveUrinvolvedEventLocation } from "@/lib/server/urinvolved/eventLocation";
import {
  matchCampusLocation,
  resolveCampusLocationFromEventFields,
} from "@/lib/server/urinvolved/locationAliases";
import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";

describe("URInvolved location coordinate safety", () => {
  it("rejects undefined or incomplete coordinate objects", () => {
    expect(hasValidCoordinates(undefined)).toBe(false);
    expect(hasValidCoordinates(null)).toBe(false);
    expect(hasValidCoordinates({ latitude: 41.49 })).toBe(false);
    expect(hasValidCoordinates({ latitude: Number.NaN, longitude: -71.5 })).toBe(false);
    expect(hasValidCoordinates({ latitude: 41.49, longitude: -71.53 })).toBe(true);
  });

  it("resolves Weldin Hall without throwing (missing REALM_LOCATION_GEO regression)", () => {
    expect(() => matchCampusLocation("Weldin Hall First Floor Lounge")).not.toThrow();
    const match = matchCampusLocation("Weldin Hall First Floor Lounge");
    expect(hasValidCoordinates(match)).toBe(true);
    if (match) {
      expect(match.latitude).toBeCloseTo(41.4908, 3);
      expect(match.longitude).toBeCloseTo(-71.5294, 3);
    }
  });

  it("returns null for unknown venues without throwing", () => {
    expect(() => matchCampusLocation("Completely Unknown Venue XYZ")).not.toThrow();
    expect(matchCampusLocation("Completely Unknown Venue XYZ")).toBeNull();
    expect(
      resolveCampusLocationFromEventFields({ venueName: "Completely Unknown Venue XYZ" }).locationMatch,
    ).toBeNull();
  });

  it("continues importing remaining events when one location lookup is unresolved", () => {
    const events = [
      { externalId: "evt-unresolved", venueName: "Mystery Barn Off Campus", address: null as string | null },
      { externalId: "evt-matched", venueName: "Memorial Union", address: null as string | null },
      { externalId: "evt-weldin", venueName: "Weldin Hall", address: null as string | null },
    ];

    const imported: Array<{ id: string; lat: number | null; lng: number | null }> = [];
    const failed: string[] = [];

    for (const event of events) {
      try {
        // Mirrors sync.ts: unresolved locations still import; only thrown errors fail the event.
        const location = resolveUrinvolvedEventLocation({
          venueName: event.venueName,
          address: event.address,
        });
        const matched = hasValidCoordinates(location.locationMatch) ? location.locationMatch : null;
        imported.push({
          id: event.externalId,
          lat: matched?.latitude ?? null,
          lng: matched?.longitude ?? null,
        });
      } catch {
        failed.push(event.externalId);
      }
    }

    expect(failed).toEqual([]);
    expect(imported.map((row) => row.id)).toEqual(["evt-unresolved", "evt-matched", "evt-weldin"]);
    expect(imported[0]?.lat).toBeNull();
    expect(imported[0]?.lng).toBeNull();
    expect(imported[1]?.lat).toEqual(expect.any(Number));
    expect(imported[2]?.lat).toEqual(expect.any(Number));
  });

  it("never reads .latitude on an undefined locationMatch object", () => {
    const locationMatch: unknown = undefined;
    // Unsafe historical pattern: (locationMatch as any).latitude throws when undefined.
    // Guarded pattern used by sync:
    expect(hasValidCoordinates(locationMatch)).toBe(false);
    const matched = hasValidCoordinates(locationMatch) ? locationMatch : null;
    expect(matched).toBeNull();
  });
});
