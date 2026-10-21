import { describe, expect, it } from "vitest";
import { buildDiningMenuPreview, diningHallShortDescription } from "./diningMenuPreview";
import type { DiningMenuResponse } from "./types";

function sampleMenu(overrides?: Partial<DiningMenuResponse>): DiningMenuResponse {
  return {
    location: {
      id: "mainfare",
      name: "Mainfare Dining Hall",
    },
    date: "2026-10-18",
    fetchedAt: "2026-10-18T12:00:00.000Z",
    lastUpdated: "2026-10-18T12:00:00.000Z",
    disclaimer: "test",
    mealPeriods: [
      {
        id: "lunch",
        name: "Lunch",
        stations: [
          {
            id: "grill",
            name: "Grill",
            items: [
              { id: "a", name: "Burger", hasNutritionDetail: false },
              { id: "b", name: "Fries", hasNutritionDetail: false },
            ],
          },
          {
            id: "salad",
            name: "Salad",
            items: [{ id: "c", name: "Garden Salad", hasNutritionDetail: false }],
          },
        ],
      },
      {
        id: "dinner",
        name: "Dinner",
        stations: [
          {
            id: "pasta",
            name: "Pasta",
            items: [{ id: "d", name: "Penne", hasNutritionDetail: false }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("buildDiningMenuPreview", () => {
  it("returns null when menu is missing or empty", () => {
    expect(buildDiningMenuPreview(null)).toBeNull();
    expect(
      buildDiningMenuPreview(
        sampleMenu({
          mealPeriods: [
            {
              id: "lunch",
              name: "Lunch",
              stations: [{ id: "x", name: "X", items: [] }],
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("builds a truncated preview from real items only", () => {
    const preview = buildDiningMenuPreview(sampleMenu(), {
      preferredMealId: "lunch",
      limit: 2,
    });
    expect(preview?.mealId).toBe("lunch");
    expect(preview?.items).toHaveLength(2);
    expect(preview?.items.map((item) => item.name)).toEqual(["Burger", "Fries"]);
    expect(preview?.totalItemCount).toBe(3);
    expect(preview?.truncated).toBe(true);
  });

  it("honors preferred meal without inventing items", () => {
    const preview = buildDiningMenuPreview(sampleMenu(), {
      preferredMealId: "dinner",
      limit: 6,
    });
    expect(preview?.mealName).toBe("Dinner");
    expect(preview?.items.map((item) => item.name)).toEqual(["Penne"]);
    expect(preview?.truncated).toBe(false);
  });
});

describe("diningHallShortDescription", () => {
  it("keeps Mainfare and Butterfield copy distinct and parallel", () => {
    expect(diningHallShortDescription("butterfield-dining")).toContain("Butterfield");
    expect(diningHallShortDescription("mainfare-dining")).toContain("Hope Commons");
    expect(diningHallShortDescription("mainfare-dining")).not.toContain("Butterfield");
  });
});
