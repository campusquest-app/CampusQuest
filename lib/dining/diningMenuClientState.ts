import type { DiningMenuResponse } from "@/lib/dining/types";

/** Client dining-menu request timeout (must exceed server upstream timeout slightly). */
export const DINING_MENU_CLIENT_TIMEOUT_MS = 55_000;

export function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function shouldShowDiningSkeleton(args: {
  initialLoading: boolean;
  loaded: boolean;
  menu: DiningMenuResponse | null;
}): boolean {
  return args.initialLoading && !args.loaded && !args.menu;
}

/** After this delay, replace an empty skeleton with a compact status line. */
export const DINING_SLOW_LOADING_HINT_MS = 2_500;

export function shouldShowDiningSlowLoadingHint(args: {
  showSkeleton: boolean;
  slowLoading: boolean;
}): boolean {
  return args.showSkeleton && args.slowLoading;
}

/**
 * Soft refresh: keep rendered menu visible while a background/date fetch runs.
 */
export function shouldPreserveDiningMenuDuringLoad(args: {
  hasMenu: boolean;
  hasSessionCacheForTarget: boolean;
}): boolean {
  return args.hasMenu || args.hasSessionCacheForTarget;
}

export function isDiningMenuEmpty(args: {
  loaded: boolean;
  menu: DiningMenuResponse | null;
}): boolean {
  return args.loaded && (!args.menu || args.menu.mealPeriods.length === 0);
}

export function countDiningMenuItems(menu: DiningMenuResponse | null | undefined): number {
  if (!menu) return 0;
  let total = 0;
  for (const meal of menu.mealPeriods) {
    for (const station of meal.stations) total += station.items.length;
  }
  return total;
}

/**
 * Decide whether a resolved response may commit into React state.
 * Stale seq must never overwrite the latest request; the latest seq always may.
 */
export function shouldCommitDiningResponse(args: {
  requestSeq: number;
  activeSeq: number;
}): boolean {
  return args.requestSeq === args.activeSeq;
}

export function diningMenuRequestKey(hallId: string, date: string): string {
  return `${hallId}:${date}`;
}
