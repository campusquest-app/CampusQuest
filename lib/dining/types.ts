/**
 * Normalized CampusQuest dining menu types (URI NetNutrition → CQ).
 * Only fields we can populate from NetNutrition are represented.
 */

export type DiningLocationId = "butterfield" | "mainfare";

export type DiningLocation = {
  id: DiningLocationId;
  name: string;
  /** CBORD NetNutrition parent unitOid */
  externalUnitOid: number;
  /** CampusQuest map / catalog location ids that should show this menu */
  campusQuestLocationIds: string[];
};

export type DiningNutrition = {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  servingSize?: string;
  ingredients?: string;
  rawText?: string;
};

export type DiningMenuItem = {
  id: string;
  name: string;
  /** NetNutrition detailOid for nutrition label fetch */
  externalDetailOid?: string;
  dietaryTags?: string[];
  allergens?: string[];
  nutrition?: DiningNutrition;
};

export type DiningStation = {
  id: string;
  name: string;
  /** NetNutrition child unitOid */
  externalUnitOid: number;
  items: DiningMenuItem[];
};

export type DiningMealPeriodId = "breakfast" | "lunch" | "dinner";

export type DiningMealPeriod = {
  id: DiningMealPeriodId;
  name: string;
  externalMealOid: number;
  stations: DiningStation[];
};

export type DiningDayHours = {
  weekday: string;
  closed: boolean;
  openLabel?: string;
  closeLabel?: string;
  openMinutes?: number;
  closeMinutes?: number;
};

export type DiningHallHours = {
  /** Free-text day rows from NetNutrition hours markup */
  summary?: string;
  openLabel?: string;
  closeLabel?: string;
  /** Structured weekly hours parsed from NetNutrition table */
  days?: DiningDayHours[];
};

export type DiningMenu = {
  location: DiningLocation;
  /** ISO date YYYY-MM-DD in America/New_York */
  date: string;
  mealPeriods: DiningMealPeriod[];
  hours?: DiningHallHours;
  fetchedAt: string;
  /** True when served from cache after an upstream failure */
  stale?: boolean;
  source: "netnutrition" | "cache";
};

export type DiningMenuResponse = {
  location: { id: DiningLocationId; name: string };
  date: string;
  mealPeriods: Array<{
    id: DiningMealPeriodId;
    name: string;
    stations: Array<{
      id: string;
      name: string;
      items: Array<{
        id: string;
        name: string;
        dietaryTags?: string[];
        allergens?: string[];
        hasNutritionDetail: boolean;
        externalDetailOid?: string;
      }>;
    }>;
  }>;
  hours?: DiningHallHours;
  fetchedAt: string;
  lastUpdated: string;
  stale?: boolean;
  disclaimer: string;
};
