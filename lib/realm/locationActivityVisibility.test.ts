import { describe, expect, it } from "vitest";
import { shouldShowLocationActivitySection } from "./locationActivityVisibility";

describe("shouldShowLocationActivitySection", () => {
  it("hides the section while events are still loading and there are none yet", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 0,
        questCount: 0,
        eventsLoaded: false,
        questsLoaded: false,
        mapHasQuestPins: false,
      }),
    ).toEqual({ showSection: false, showQuestSkeleton: false });
  });

  it("shows events immediately without quest skeletons", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 2,
        questCount: 0,
        eventsLoaded: true,
        questsLoaded: false,
        mapHasQuestPins: false,
      }),
    ).toEqual({ showSection: true, showQuestSkeleton: false });
  });

  it("shows section when quests exist after load (no events)", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 0,
        questCount: 1,
        eventsLoaded: true,
        questsLoaded: true,
        mapHasQuestPins: false,
      }),
    ).toEqual({ showSection: true, showQuestSkeleton: false });
  });

  it("hides the section when loaded empty (Dining Hall style)", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 0,
        questCount: 0,
        eventsLoaded: true,
        questsLoaded: true,
        mapHasQuestPins: false,
      }),
    ).toEqual({ showSection: false, showQuestSkeleton: false });
  });

  it("does not show skeletons after empty resolve, even if map had no pins", () => {
    const loadedEmpty = shouldShowLocationActivitySection({
      eventCount: 0,
      questCount: 0,
      eventsLoaded: true,
      questsLoaded: true,
      mapHasQuestPins: false,
    });
    expect(loadedEmpty.showQuestSkeleton).toBe(false);
    expect(loadedEmpty.showSection).toBe(false);
  });

  it("shows skeleton only while quests load when map already has quest/QR pins", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 0,
        questCount: 0,
        eventsLoaded: true,
        questsLoaded: false,
        mapHasQuestPins: true,
      }),
    ).toEqual({ showSection: true, showQuestSkeleton: true });
  });

  it("hides while quests load when map has no pins (avoid Dining Hall flash)", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 0,
        questCount: 0,
        eventsLoaded: true,
        questsLoaded: false,
        mapHasQuestPins: false,
      }),
    ).toEqual({ showSection: false, showQuestSkeleton: false });
  });

  it("keeps section visible with events while quests are still loading", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 1,
        questCount: 0,
        eventsLoaded: true,
        questsLoaded: false,
        mapHasQuestPins: true,
      }),
    ).toEqual({ showSection: true, showQuestSkeleton: false });
  });

  it("stays empty after load on rerender inputs (no revert to skeleton)", () => {
    const once = shouldShowLocationActivitySection({
      eventCount: 0,
      questCount: 0,
      eventsLoaded: true,
      questsLoaded: true,
      mapHasQuestPins: false,
    });
    const again = shouldShowLocationActivitySection({
      eventCount: 0,
      questCount: 0,
      eventsLoaded: true,
      questsLoaded: true,
      mapHasQuestPins: false,
    });
    expect(once).toEqual(again);
    expect(again.showQuestSkeleton).toBe(false);
  });
});
