import { describe, expect, it } from "vitest";
import {
  countEventsToday,
  locationSheetTypeLabel,
  resolveLocationSheetType,
} from "./resolveLocationSheetType";

describe("resolveLocationSheetType", () => {
  it("prefers quest when active quests exist", () => {
    expect(
      resolveLocationSheetType({
        activeQuestCount: 2,
        activeEventCount: 1,
        momentCount: 5,
      }),
    ).toBe("quest");
  });

  it("prefers quest when QR codes exist", () => {
    expect(
      resolveLocationSheetType({
        activeQuestCount: 0,
        activeEventCount: 0,
        momentCount: 0,
        hasQr: true,
      }),
    ).toBe("quest");
  });

  it("returns event when only events are active", () => {
    expect(
      resolveLocationSheetType({
        activeQuestCount: 0,
        activeEventCount: 1,
        momentCount: 0,
      }),
    ).toBe("event");
  });

  it("returns memory when moments exist without quests/events", () => {
    expect(
      resolveLocationSheetType({
        activeQuestCount: 0,
        activeEventCount: 0,
        momentCount: 3,
      }),
    ).toBe("memory");
  });

  it("defaults to location", () => {
    expect(
      resolveLocationSheetType({
        activeQuestCount: 0,
        activeEventCount: 0,
        momentCount: 0,
      }),
    ).toBe("location");
  });
});

describe("locationSheetTypeLabel", () => {
  it("maps types to display labels", () => {
    expect(locationSheetTypeLabel("quest")).toBe("Quest");
    expect(locationSheetTypeLabel("event")).toBe("Event");
    expect(locationSheetTypeLabel("memory")).toBe("Memory");
    expect(locationSheetTypeLabel("location")).toBe("Location");
  });
});

describe("countEventsToday", () => {
  it("counts events starting today only", () => {
    const today = new Date();
    today.setHours(14, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stubEvent = (startsAt: string) => ({
      id: "evt-1",
      title: "Test",
      startsAt,
      endsAt: startsAt,
      organizationName: "Org",
      eventUrl: null,
    });

    expect(
      countEventsToday({
        events: [stubEvent(today.toISOString()), stubEvent(tomorrow.toISOString())],
      }),
    ).toBe(1);
  });
});
