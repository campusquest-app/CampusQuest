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
