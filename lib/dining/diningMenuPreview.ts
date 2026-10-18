import type { DiningMealPeriodId, DiningMenuResponse } from "./types";
import { pickInitialSelectedMeal } from "./diningServiceStatus";

export type DiningMenuPreviewItem = {
  id: string;
  name: string;
  stationName: string;
};

export type DiningMenuPreview = {
  mealId: DiningMealPeriodId;
  mealName: string;
  items: DiningMenuPreviewItem[];
  totalItemCount: number;
  truncated: boolean;
};

const DEFAULT_PREVIEW_LIMIT = 6;

/**
 * Compact "Today's Menu" preview for map dining cards.
 * Uses real menu items only — never invents placeholders.
 */
export function buildDiningMenuPreview(
  menu: DiningMenuResponse | null | undefined,
  opts?: {
    preferredMealId?: DiningMealPeriodId | null;
    limit?: number;
    now?: Date;
  },
): DiningMenuPreview | null {
  if (!menu?.mealPeriods?.length) return null;

  const available = menu.mealPeriods.map((period) => period.id);
  const mealId =
    opts?.preferredMealId && available.includes(opts.preferredMealId)
      ? opts.preferredMealId
      : pickInitialSelectedMeal({
          availableMealIds: available,
          currentMealId: null,
          now: opts?.now ?? new Date(),
        });

  const meal = menu.mealPeriods.find((period) => period.id === mealId) ?? menu.mealPeriods[0];
  if (!meal) return null;

  const limit = Math.max(1, opts?.limit ?? DEFAULT_PREVIEW_LIMIT);
  const flat: DiningMenuPreviewItem[] = [];
  for (const station of meal.stations) {
    for (const item of station.items) {
      const name = item.name?.trim();
      if (!name) continue;
      flat.push({
        id: item.id,
        name,
        stationName: station.name,
      });
    }
  }

  if (flat.length === 0) return null;

  return {
    mealId: meal.id,
    mealName: meal.name,
    items: flat.slice(0, limit),
    totalItemCount: flat.length,
    truncated: flat.length > limit,
  };
}

/** Short blurbs for dining map cards — keep both halls parallel. */
export function diningHallShortDescription(campusQuestLocationId: string): string {
  switch (campusQuestLocationId) {
    case "butterfield-dining":
    case "butterfield":
    case "dining-hall":
      return "All-you-care-to-eat on Butterfield Road.";
    case "mainfare-dining":
    case "mainfare":
    case "hope-commons":
      return "Hope Commons dining with Mainfare stations.";
    default:
      return "Campus dining hall.";
  }
}
