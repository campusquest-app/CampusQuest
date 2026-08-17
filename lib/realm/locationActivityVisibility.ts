/**
 * Pure visibility rules for the location-detail "What's Happening" block.
 * Keeps empty locations from flashing skeleton → empty → remount loops.
 */
export function shouldShowLocationActivitySection(args: {
  eventCount: number;
  questCount: number;
  eventsLoaded: boolean;
  questsLoaded: boolean;
  mapHasQuestPins: boolean;
}): { showSection: boolean; showQuestSkeleton: boolean } {
  if (args.eventCount > 0) {
    return { showSection: true, showQuestSkeleton: false };
  }

  if (!args.eventsLoaded) {
    return { showSection: false, showQuestSkeleton: false };
  }

  if (args.questCount > 0) {
    return { showSection: true, showQuestSkeleton: false };
  }

  if (!args.questsLoaded) {
    if (args.mapHasQuestPins) {
      return { showSection: true, showQuestSkeleton: true };
    }
    return { showSection: false, showQuestSkeleton: false };
  }

  return { showSection: false, showQuestSkeleton: false };
}
