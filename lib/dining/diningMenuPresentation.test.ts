import { describe, expect, it } from "vitest";
import {
  buildFilteredStations,
  dedupeDietaryLabels,
  dietFilterOptionsForMeal,
  itemDietaryLabels,
  nextExpandedStationId,
  shouldResetStationExpansion,
  stationsCollapsedByDefault,
} from "./diningMenuPresentation";

const lunchMeal = {
  id: "lunch" as const,
  name: "Lunch",
  stations: [
    {
      id: "homestyle",
      name: "Homestyle",
      items: [
        {
          id: "1",
          name: "Chicken Stir Fry",
          dietaryTags: ["Soy"],
          allergens: ["Soy"],
          hasNutritionDetail: true,
        },
        {
          id: "2",
          name: "Ginger Tofu",
          dietaryTags: ["Vegan", "Vegetarian", "Sesame"],
          allergens: ["Sesame"],
          hasNutritionDetail: true,
        },
        {
          id: "3",
          name: "Jasmine Rice",
          dietaryTags: ["Vegan", "Vegetarian"],
          hasNutritionDetail: false,
        },
        {
          id: "4",
          name: "Pasta",
          dietaryTags: ["Gluten", "Vegetarian", "Gluten"],
          allergens: ["Gluten"],
          hasNutritionDetail: false,
        },
      ],
    },
    {
      id: "nachos",
      name: "Nachos",
      items: [
        {
          id: "5",
          name: "Beef Nachos",
          dietaryTags: [],
          allergens: ["Dairy"],
          hasNutritionDetail: false,
        },
      ],
    },
  ],
};

describe("diningMenuPresentation", () => {
  it("stations render collapsed by default", () => {
    expect(stationsCollapsedByDefault(null)).toBe(true);
    expect(stationsCollapsedByDefault("homestyle")).toBe(false);
  });

  it("shows correct item counts and filters empty stations", () => {
    const all = buildFilteredStations({ meal: lunchMeal, dietFilter: null });
    expect(all.map((s) => ({ name: s.name, count: s.itemCount }))).toEqual([
      { name: "Homestyle", count: 4 },
      { name: "Nachos", count: 1 },
    ]);

    const vegan = buildFilteredStations({ meal: lunchMeal, dietFilter: "Vegan" });
    expect(vegan.map((s) => ({ name: s.name, count: s.itemCount }))).toEqual([
      { name: "Homestyle", count: 2 },
    ]);
  });

  it("tapping a station expands; tapping again collapses; accordion switches", () => {
    expect(nextExpandedStationId(null, "homestyle")).toBe("homestyle");
    expect(nextExpandedStationId("homestyle", "homestyle")).toBeNull();
    expect(nextExpandedStationId("homestyle", "nachos")).toBe("nachos");
  });

  it("meal/date changes reset expansion", () => {
    expect(
      shouldResetStationExpansion({
        previousMealId: "lunch",
        nextMealId: "dinner",
        previousDate: "2026-08-17",
        nextDate: "2026-08-17",
      }),
    ).toBe(true);
    expect(
      shouldResetStationExpansion({
        previousMealId: "lunch",
        nextMealId: "lunch",
        previousDate: "2026-08-17",
        nextDate: "2026-08-18",
      }),
    ).toBe(true);
    expect(
      shouldResetStationExpansion({
        previousMealId: "lunch",
        nextMealId: "lunch",
        previousDate: "2026-08-17",
        nextDate: "2026-08-17",
      }),
    ).toBe(false);
  });

  it("dedupes duplicate dietary/allergen labels", () => {
    expect(dedupeDietaryLabels(["Gluten", "Vegetarian", "Gluten"])).toEqual([
      "Gluten",
      "Vegetarian",
    ]);
    expect(itemDietaryLabels(lunchMeal.stations[0]!.items[3]!)).toEqual([
      "Gluten",
      "Vegetarian",
    ]);
  });

  it("preferred diet filters only include tags present on the meal", () => {
    expect(dietFilterOptionsForMeal(lunchMeal)).toEqual(["Gluten", "Vegan", "Vegetarian"]);
  });

  it("expand/collapse helpers do not imply network activity", () => {
    // Presentation-only: toggling expansion never constructs a request key/path.
    let fetches = 0;
    const expand = (current: string | null, id: string) => {
      fetches += 0;
      return nextExpandedStationId(current, id);
    };
    expect(expand(null, "homestyle")).toBe("homestyle");
    expect(expand("homestyle", "homestyle")).toBeNull();
    expect(fetches).toBe(0);
  });
});
