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

/**
 * Never flash gray memory cards for the empty case — that mounts skeletons
 * then swaps to "Add Your Memory" and looks like a layout flash.
 * Keep the Add CTA mounted from first paint; cards appear when data arrives.
 * Background refetch must also keep skeletons off (count preserved or empty).
 */
export function shouldShowMemorySkeletons(_args: {
  initialLoading: boolean;
  loaded: boolean;
  memoryCount: number;
}): boolean {
  return false;
}

/** After a successful load, empty must never look like "still loading". */
export function isStableEmptyAfterLoad(args: {
  loaded: boolean;
  initialLoading: boolean;
  count: number;
}): boolean {
  return args.loaded && !args.initialLoading && args.count === 0;
}
