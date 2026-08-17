/**
 * Pure helpers for location-sheet loading vs empty UI decisions.
 * Kept separate so regressions don't depend on mounting React trees.
 */

export function shouldShowQuestSkeleton(args: {
  showSkeleton: boolean;
  initialLoading: boolean;
  questCount: number;
}): boolean {
  return args.showSkeleton && args.initialLoading && args.questCount === 0;
}

export function shouldRenderQuestList(args: {
  showSkeleton: boolean;
  initialLoading: boolean;
  questCount: number;
}): boolean {
  if (shouldShowQuestSkeleton(args)) return true;
  return args.questCount > 0;
}

export function shouldShowMemorySkeletons(args: {
  initialLoading: boolean;
  loaded: boolean;
  memoryCount: number;
}): boolean {
  return args.initialLoading && !args.loaded && args.memoryCount === 0;
}

/** After a successful load, empty must never look like "still loading". */
export function isStableEmptyAfterLoad(args: {
  loaded: boolean;
  initialLoading: boolean;
  count: number;
}): boolean {
  return args.loaded && !args.initialLoading && args.count === 0;
}
