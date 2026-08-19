import type { DiningMealPeriodId, DiningMenuResponse } from "./types";

const PREFERRED_DIET_FILTERS = ["Gluten", "Vegan", "Vegetarian"] as const;

/** Case-insensitive dedupe; preserves first-seen casing/order. */
export function dedupeDietaryLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function itemDietaryLabels(item: {
  dietaryTags?: string[];
  allergens?: string[];
}): string[] {
  return dedupeDietaryLabels([...(item.dietaryTags ?? []), ...(item.allergens ?? [])]);
}

export function itemMatchesDietFilter(
  item: { dietaryTags?: string[]; allergens?: string[] },
  filter: string | null,
): boolean {
  if (!filter) return true;
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return itemDietaryLabels(item).some((label) => label.toLowerCase() === needle);
}

export function dietFilterOptionsForMeal(
  meal: DiningMenuResponse["mealPeriods"][number] | null | undefined,
): string[] {
  if (!meal) return [];
  const present = new Set<string>();
  for (const station of meal.stations) {
    for (const item of station.items) {
      for (const label of itemDietaryLabels(item)) {
        present.add(label.toLowerCase());
      }
    }
  }
  return PREFERRED_DIET_FILTERS.filter((tag) => present.has(tag.toLowerCase()));
}

export type CollapsedStationView = {
  id: string;
  name: string;
  itemCount: number;
  items: Array<{
    id: string;
    name: string;
    labels: string[];
    hasNutritionDetail: boolean;
    externalDetailOid?: string;
  }>;
};

export function buildFilteredStations(args: {
  meal: DiningMenuResponse["mealPeriods"][number] | null | undefined;
  dietFilter: string | null;
}): CollapsedStationView[] {
  if (!args.meal) return [];
  return args.meal.stations
    .map((station) => {
      const items = station.items
        .filter((item) => itemMatchesDietFilter(item, args.dietFilter))
        .map((item) => ({
          id: item.id,
          name: item.name,
          labels: itemDietaryLabels(item),
          hasNutritionDetail: item.hasNutritionDetail,
          externalDetailOid: item.externalDetailOid,
        }));
      return {
        id: station.id,
        name: station.name,
        itemCount: items.length,
        items,
      };
    })
    .filter((station) => station.itemCount > 0);
}

export function stationsCollapsedByDefault(expandedStationId: string | null): boolean {
  return expandedStationId == null;
}

export function nextExpandedStationId(
  current: string | null,
  tappedStationId: string,
): string | null {
  return current === tappedStationId ? null : tappedStationId;
}

export function shouldResetStationExpansion(args: {
  previousMealId: DiningMealPeriodId | null;
  nextMealId: DiningMealPeriodId | null;
  previousDate: string;
  nextDate: string;
}): boolean {
  return args.previousMealId !== args.nextMealId || args.previousDate !== args.nextDate;
}
