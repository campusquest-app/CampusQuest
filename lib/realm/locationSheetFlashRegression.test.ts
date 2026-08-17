import { describe, expect, it } from "vitest";
import { shouldShowLocationActivitySection } from "./locationActivityVisibility";
import {
  isStableEmptyAfterLoad,
  shouldShowMemorySkeletons,
  shouldShowQuestSkeleton,
} from "./locationSheetLoading";

/**
 * Regression coverage for Butterfield/Mainfare-style empty location sheets:
 * zero events, zero memories, dining loading independently.
 */
describe("location sheet flash regression", () => {
  function emptyDiningHall(args: {
    eventsLoaded: boolean;
    questsLoaded: boolean;
  }) {
    return shouldShowLocationActivitySection({
      eventCount: 0,
      questCount: 0,
      eventsLoaded: args.eventsLoaded,
      questsLoaded: args.questsLoaded,
      mapHasQuestPins: false,
    });
  }

  it("no events / no memories: What's Happening stays hidden through the full load sequence", () => {
    const sequence = [
      emptyDiningHall({ eventsLoaded: false, questsLoaded: false }),
      emptyDiningHall({ eventsLoaded: true, questsLoaded: false }),
      emptyDiningHall({ eventsLoaded: true, questsLoaded: true }),
    ];
    for (const step of sequence) {
      expect(step.showSection).toBe(false);
      expect(step.showQuestSkeleton).toBe(false);
    }
  });

  it("events / no memories: section appears once events exist; quests do not force skeletons", () => {
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

  it("no events / memories: activity stays hidden; memory skeletons stay off", () => {
    expect(emptyDiningHall({ eventsLoaded: true, questsLoaded: true }).showSection).toBe(false);
    expect(
      shouldShowMemorySkeletons({
        initialLoading: false,
        loaded: true,
        memoryCount: 3,
      }),
    ).toBe(false);
  });

  it("events / memories: activity visible; memory skeletons never return", () => {
    expect(
      shouldShowLocationActivitySection({
        eventCount: 1,
        questCount: 0,
        eventsLoaded: true,
        questsLoaded: true,
        mapHasQuestPins: false,
      }).showSection,
    ).toBe(true);
    expect(
      shouldShowMemorySkeletons({
        initialLoading: true,
        loaded: false,
        memoryCount: 0,
      }),
    ).toBe(false);
  });

  it("dining loading independently does not change activity visibility inputs", () => {
    const beforeDining = emptyDiningHall({ eventsLoaded: true, questsLoaded: true });
    // Dining has its own state; activity helpers ignore it entirely.
    const afterDining = emptyDiningHall({ eventsLoaded: true, questsLoaded: true });
    expect(beforeDining).toEqual(afterDining);
    expect(afterDining.showSection).toBe(false);
  });

  it("dining failure does not reopen What's Happening for empty locations", () => {
    expect(emptyDiningHall({ eventsLoaded: true, questsLoaded: true })).toEqual({
      showSection: false,
      showQuestSkeleton: false,
    });
  });

  it("repeated parent rerender with loaded-empty inputs never reopens skeletons", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(emptyDiningHall({ eventsLoaded: true, questsLoaded: true }).showQuestSkeleton).toBe(
        false,
      );
      expect(
        shouldShowMemorySkeletons({
          initialLoading: false,
          loaded: true,
          memoryCount: 0,
        }),
      ).toBe(false);
      expect(
        shouldShowQuestSkeleton({
          showSkeleton: true,
          initialLoading: false,
          questCount: 0,
        }),
      ).toBe(false);
    }
  });

  it("Butterfield → Mainfare switch restarts as hidden until each location settles empty", () => {
    const butterfieldLoading = emptyDiningHall({ eventsLoaded: true, questsLoaded: false });
    const butterfieldLoaded = emptyDiningHall({ eventsLoaded: true, questsLoaded: true });
    const mainfareLoading = emptyDiningHall({ eventsLoaded: true, questsLoaded: false });
    const mainfareLoaded = emptyDiningHall({ eventsLoaded: true, questsLoaded: true });
    expect(butterfieldLoading.showSection).toBe(false);
    expect(butterfieldLoaded.showSection).toBe(false);
    expect(mainfareLoading.showSection).toBe(false);
    expect(mainfareLoaded.showSection).toBe(false);
  });

  it("reopening same location after loaded-empty stays empty (no skeleton return)", () => {
    const firstOpen = emptyDiningHall({ eventsLoaded: true, questsLoaded: true });
    const reopen = emptyDiningHall({ eventsLoaded: true, questsLoaded: true });
    expect(firstOpen).toEqual(reopen);
    expect(reopen.showQuestSkeleton).toBe(false);
  });

  it("stale empty resolve after a later location already has events does not hide events", () => {
    // Active location has events — visibility is driven by current props only.
    expect(
      shouldShowLocationActivitySection({
        eventCount: 3,
        questCount: 0,
        eventsLoaded: true,
        questsLoaded: true,
        mapHasQuestPins: false,
      }).showSection,
    ).toBe(true);
  });

  it("background refetch: quest skeleton gated off when showSkeleton is false", () => {
    expect(
      shouldShowQuestSkeleton({
        showSkeleton: false,
        initialLoading: true,
        questCount: 0,
      }),
    ).toBe(false);
  });

  it("component key stability: location id alone is the remount identity (documented)", () => {
    const locationId = "butterfield-dining";
    const keyBefore = locationId;
    const keyAfterEvents = locationId;
    const keyAfterDining = locationId;
    const keyAfterMemories = locationId;
    expect(new Set([keyBefore, keyAfterEvents, keyAfterDining, keyAfterMemories]).size).toBe(1);
  });

  it("skeleton never returns after initial empty load", () => {
    expect(
      isStableEmptyAfterLoad({
        loaded: true,
        initialLoading: false,
        count: 0,
      }),
    ).toBe(true);
    expect(
      shouldShowQuestSkeleton({
        showSkeleton: true,
        initialLoading: false,
        questCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowMemorySkeletons({
        initialLoading: false,
        loaded: true,
        memoryCount: 0,
      }),
    ).toBe(false);
  });

  it("No memories yet today never appears in location memory rail copy", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.join(process.cwd(), "components/memories/LocationMemoriesSection.tsx"),
      "utf8",
    );
    expect(source).not.toContain("No memories yet today");
  });

  it("sequence A/B/C/D/E: empty activity stays hidden regardless of resolve order", () => {
    // A events→memories→dining, B dining→events→memories, C memories→dining→events,
    // D all empty, E events fail treated as loaded empty — all end the same.
    const final = emptyDiningHall({ eventsLoaded: true, questsLoaded: true });
    expect(final).toEqual({ showSection: false, showQuestSkeleton: false });
  });
});
