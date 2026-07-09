import { describe, expect, it } from "vitest";
import { buildUrinvolvedEditPinsFromGroups } from "@/lib/realm/urinvolvedEditPins";

describe("buildUrinvolvedEditPinsFromGroups", () => {
  it("extracts URInvolved events with coordinates from map groups", () => {
    const pins = buildUrinvolvedEditPinsFromGroups([
      {
        groupKey: "memorial-union",
        locationKey: "memorial_union",
        realmLocationId: "memorial-union",
        locationName: "Memorial Union",
        locationAddress: null,
        x: 47,
        y: 54,
        lat: 41.4868,
        lng: -71.5301,
        attachToLandmark: true,
        qrCodes: [],
        quests: [],
        events: [
          {
            id: "ext:abc",
            externalEventId: "abc",
            title: "Karaoke Night",
            startsAt: "2026-07-09T18:00:00.000Z",
            endsAt: null,
            organizationName: "Talent Dev",
            eventUrl: null,
            source: "urinvolved",
            placementStatus: "auto_matched",
          },
        ],
      },
    ]);

    expect(pins).toHaveLength(1);
    expect(pins[0]?.externalEventId).toBe("abc");
    expect(pins[0]?.lat).toBeCloseTo(41.4868, 4);
  });
});
