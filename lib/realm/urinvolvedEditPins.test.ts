import { describe, expect, it } from "vitest";
import { applyEventEditDrafts, buildUrinvolvedEditPinsFromGroups } from "@/lib/realm/urinvolvedEditPins";

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

  it("keeps athletics events that the normal map shows, at the same coordinates", () => {
    const pins = buildUrinvolvedEditPinsFromGroups([
      {
        groupKey: "uri-soccer-complex",
        locationKey: null,
        realmLocationId: null,
        locationName: "URI Soccer Complex",
        locationAddress: null,
        x: 40,
        y: 60,
        lat: 41.4838,
        lng: -71.5348,
        attachToLandmark: false,
        qrCodes: [],
        quests: [],
        events: [
          {
            id: "ath:soccer",
            externalEventId: "soccer-1",
            title: "URI vs Opponent",
            startsAt: "2026-10-17T18:00:00.000Z",
            endsAt: null,
            organizationName: "Athletics",
            eventUrl: null,
            source: "athletics",
            locationText: "URI Soccer Complex",
          },
        ],
      },
    ]);

    expect(pins).toEqual([
      expect.objectContaining({
        externalEventId: "soccer-1",
        source: "athletics",
        sourceVenue: "URI Soccer Complex",
        lat: 41.4838,
        lng: -71.5348,
      }),
    ]);
  });

  it("applies a drag draft and drops it on cancel", () => {
    const base = buildUrinvolvedEditPinsFromGroups([
      {
        groupKey: "keaney",
        locationKey: null,
        realmLocationId: null,
        locationName: "Keaney Gym",
        locationAddress: null,
        x: 50,
        y: 50,
        lat: 41.48,
        lng: -71.53,
        attachToLandmark: false,
        qrCodes: [],
        quests: [],
        events: [
          {
            id: "ath:keaney",
            externalEventId: "keaney-1",
            title: "Keeney event",
            startsAt: "2026-10-17T18:00:00.000Z",
            endsAt: null,
            organizationName: null,
            eventUrl: null,
            source: "athletics",
            locationText: "Keeney Gym",
          },
        ],
      },
    ]);
    const drafted = applyEventEditDrafts(base, { "keaney-1": { lat: 41.4853, lng: -71.526 } });
    expect(drafted[0]?.lat).toBeCloseTo(41.4853, 4);
    expect(drafted[0]?.unsaved).toBe(true);
    expect(applyEventEditDrafts(base, {})[0]?.lat).toBeCloseTo(41.48, 4);
  });
});
