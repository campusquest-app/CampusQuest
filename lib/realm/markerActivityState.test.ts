import { describe, expect, it } from "vitest";
import {
  getLocationActivityState,
  groupActivityCounts,
  landmarkActivityCounts,
} from "@/lib/realm/markerActivityState";

describe("markerActivityState", () => {
  it("returns idle when nothing is happening", () => {
    expect(getLocationActivityState(
      { activeQuestCount: 0, activeEventCount: 0, activeMemoryCount: 0, activeQrCount: 0 },
      false,
    )).toEqual({ state: "idle", activityCount: 0 });
  });

  it("returns active for a single activity type", () => {
    expect(getLocationActivityState(
      { activeQuestCount: 1, activeEventCount: 0, activeMemoryCount: 0, activeQrCount: 0 },
      false,
    )).toEqual({ state: "active", activityCount: 1 });
  });

  it("returns hot for multiple activity types", () => {
    expect(getLocationActivityState(
      { activeQuestCount: 1, activeEventCount: 1, activeMemoryCount: 0, activeQrCount: 0 },
      false,
    )).toEqual({ state: "hot", activityCount: 2 });
  });

  it("returns hot for 3+ memories", () => {
    expect(getLocationActivityState(
      { activeQuestCount: 0, activeEventCount: 0, activeMemoryCount: 3, activeQrCount: 0 },
      false,
    )).toEqual({ state: "hot", activityCount: 3 });
  });

  it("selected overrides activity tier", () => {
    expect(getLocationActivityState(
      { activeQuestCount: 1, activeEventCount: 1, activeMemoryCount: 0, activeQrCount: 0 },
      true,
    )).toEqual({ state: "selected", activityCount: 2 });
  });

  it("derives landmark counts from map content", () => {
    const counts = landmarkActivityCounts({
      activeQuests: 0,
      upcomingEvents: 1,
      activeMomentCount: 2,
      mapContent: { quests: [{ id: "q1" }], events: [], qrCodes: [] },
    });
    expect(counts).toEqual({
      activeQuestCount: 1,
      activeEventCount: 1,
      activeMemoryCount: 2,
      activeQrCount: 0,
    });
  });

  it("derives group counts", () => {
    expect(groupActivityCounts({ quests: [1], events: [], qrCodes: [1] })).toEqual({
      activeQuestCount: 1,
      activeEventCount: 0,
      activeMemoryCount: 0,
      activeQrCount: 1,
    });
  });
});
