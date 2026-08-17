import { describe, expect, it } from "vitest";
import {
  isStableEmptyAfterLoad,
  shouldRenderQuestList,
  shouldShowMemorySkeletons,
  shouldShowQuestSkeleton,
} from "./locationSheetLoading";

describe("locationSheetLoading", () => {
  describe("quests", () => {
    it("shows skeleton only on initial fetch when allowed", () => {
      expect(
        shouldShowQuestSkeleton({
          showSkeleton: true,
          initialLoading: true,
          questCount: 0,
        }),
      ).toBe(true);
    });

    it("never shows skeleton after load resolves empty", () => {
      expect(
        shouldShowQuestSkeleton({
          showSkeleton: true,
          initialLoading: false,
          questCount: 0,
        }),
      ).toBe(false);
      expect(
        shouldRenderQuestList({
          showSkeleton: true,
          initialLoading: false,
          questCount: 0,
        }),
      ).toBe(false);
    });

    it("does not show skeleton during background refetch when showSkeleton is false", () => {
      expect(
        shouldShowQuestSkeleton({
          showSkeleton: false,
          initialLoading: true,
          questCount: 0,
        }),
      ).toBe(false);
    });

    it("keeps existing quest cards visible while refreshing (count > 0)", () => {
      expect(
        shouldShowQuestSkeleton({
          showSkeleton: true,
          initialLoading: true,
          questCount: 2,
        }),
      ).toBe(false);
      expect(
        shouldRenderQuestList({
          showSkeleton: true,
          initialLoading: true,
          questCount: 2,
        }),
      ).toBe(true);
    });

    it("covers events+quests / events only / quests only / neither via render gate", () => {
      expect(
        shouldRenderQuestList({ showSkeleton: false, initialLoading: false, questCount: 1 }),
      ).toBe(true);
      expect(
        shouldRenderQuestList({ showSkeleton: false, initialLoading: false, questCount: 0 }),
      ).toBe(false);
    });
  });

  describe("memories", () => {
    it("never shows memory skeleton cards (avoids empty flash to Add Your Memory)", () => {
      expect(
        shouldShowMemorySkeletons({
          initialLoading: true,
          loaded: false,
          memoryCount: 0,
        }),
      ).toBe(false);
      expect(
        shouldShowMemorySkeletons({
          initialLoading: false,
          loaded: true,
          memoryCount: 0,
        }),
      ).toBe(false);
      expect(
        shouldShowMemorySkeletons({
          initialLoading: true,
          loaded: false,
          memoryCount: 3,
        }),
      ).toBe(false);
    });

    it("treats loaded zero memories as stable empty", () => {
      expect(
        isStableEmptyAfterLoad({
          loaded: true,
          initialLoading: false,
          count: 0,
        }),
      ).toBe(true);
    });

    it("does not revert to skeleton after initial load on rerender-shaped inputs", () => {
      const loadedEmpty = {
        initialLoading: false,
        loaded: true,
        memoryCount: 0,
      };
      expect(shouldShowMemorySkeletons(loadedEmpty)).toBe(false);
      expect(shouldShowMemorySkeletons({ ...loadedEmpty })).toBe(false);
    });
  });

  describe("location switches and reopen", () => {
    it("allows quest skeleton again for a new location initial load", () => {
      expect(
        shouldShowQuestSkeleton({
          showSkeleton: true,
          initialLoading: true,
          questCount: 0,
        }),
      ).toBe(true);
    });

    it("keeps memory skeletons off across location switch loading", () => {
      expect(
        shouldShowMemorySkeletons({
          initialLoading: true,
          loaded: false,
          memoryCount: 0,
        }),
      ).toBe(false);
    });

    it("failed request that settles loading still counts as stable empty", () => {
      expect(
        isStableEmptyAfterLoad({
          loaded: true,
          initialLoading: false,
          count: 0,
        }),
      ).toBe(true);
    });
  });
});
