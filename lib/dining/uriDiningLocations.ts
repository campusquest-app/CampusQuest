import type { DiningLocation, DiningLocationId, DiningMealPeriodId } from "./types";

/**
 * Explicit CampusQuest ↔ URI NetNutrition unit mapping.
 * Parent unitOids from https://fss.dining.uri.edu/NetNutrition/URIDining
 */
export const URI_DINING_LOCATIONS: Record<DiningLocationId, DiningLocation> = {
  butterfield: {
    id: "butterfield",
    name: "Butterfield Dining Hall",
    externalUnitOid: 1,
    campusQuestLocationIds: ["butterfield-dining", "butterfield", "dining-hall"],
  },
  mainfare: {
    id: "mainfare",
    name: "Mainfare Dining Hall",
    externalUnitOid: 15,
    campusQuestLocationIds: ["mainfare-dining", "mainfare", "hope-commons"],
  },
};

/** NetNutrition meal period Oids from the URI Dining nav. */
export const URI_MEAL_PERIODS: Record<
  DiningMealPeriodId,
  { id: DiningMealPeriodId; name: string; externalMealOid: number }
> = {
  breakfast: { id: "breakfast", name: "Breakfast", externalMealOid: 2 },
  lunch: { id: "lunch", name: "Lunch", externalMealOid: 4 },
  dinner: { id: "dinner", name: "Dinner", externalMealOid: 5 },
};

export const DINING_DISCLAIMER =
  "Menu, nutrition, and allergen information is provided by URI Dining / NetNutrition and may change. Always verify allergens with dining staff if you have a food allergy.";

export function resolveDiningLocationId(
  input: string | null | undefined,
): DiningLocationId | null {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (
    raw === "butterfield" ||
    raw === "butterfield-dining" ||
    raw === "dining-hall" ||
    raw === "dining_hall"
  ) {
    return "butterfield";
  }
  if (
    raw === "mainfare" ||
    raw === "mainfare-dining" ||
    raw === "hope-commons" ||
    raw === "hope_commons"
  ) {
    return "mainfare";
  }
  for (const loc of Object.values(URI_DINING_LOCATIONS)) {
    if (loc.id === raw || loc.campusQuestLocationIds.includes(raw)) return loc.id;
  }
  return null;
}

export function getDiningLocation(id: DiningLocationId): DiningLocation {
  return URI_DINING_LOCATIONS[id];
}

export function isDiningMapLocation(campusQuestLocationId: string | null | undefined): boolean {
  return resolveDiningLocationId(campusQuestLocationId) != null;
}

/** Primary CampusQuest slug for each dining hall (visible map markers). */
export const DINING_CAMPUS_QUEST_SLUGS = {
  butterfield: "butterfield-dining",
  mainfare: "mainfare-dining",
} as const;
