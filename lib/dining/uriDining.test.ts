import { describe, expect, it } from "vitest";
import {
  parseChildUnits,
  parseItemPanel,
  parseMenuListPanel,
  parseNutritionLabelHtml,
  menuDateLabelMatchesIso,
} from "./netNutritionParse";
import {
  formatDayChipLabel,
  selectDefaultMealPeriod,
  toNetNutritionDateParam,
  upcomingIsoDates,
  uriTodayIso,
} from "./diningTime";
import { resolveDiningLocationId, URI_DINING_LOCATIONS } from "./uriDiningLocations";
import {
  clearDiningMenuCache,
  getCachedDiningMenu,
  getFreshCachedDiningMenu,
  setCachedDiningMenu,
} from "./diningCache";
import type { DiningMenu } from "./types";
import { toDiningMenuResponse } from "./uriDining";

const SAMPLE_CHILD_HTML = `
<a onclick="javascript:NetNutrition.UI.childUnitsSelectUnit(2);" class='cbo_nn_unitNameLink'>Homestyle</a>
<a onclick="javascript:NetNutrition.UI.childUnitsSelectUnit(3);" class='cbo_nn_unitNameLink'>Allergy Pantry</a>
`;

const SAMPLE_MENU_LIST = `
<div class='card-title h4'>Monday, August 17, 2026</div>
<a class='cbo_nn_menuLink' href='#' onclick="javascript:NetNutrition.UI.menuListSelectMenu(241862);">Breakfast</a>
<a class='cbo_nn_menuLink' href='#' onclick="javascript:NetNutrition.UI.menuListSelectMenu(241883);">Lunch</a>
<a class='cbo_nn_menuLink' href='#' onclick="javascript:NetNutrition.UI.menuListSelectMenu(241904);">Dinner</a>
<div class='card-title h4'>Tuesday, August 18, 2026</div>
<a class='cbo_nn_menuLink' href='#' onclick="javascript:NetNutrition.UI.menuListSelectMenu(241863);">Breakfast</a>
`;

const SAMPLE_ITEMS = `
<tr class='cbo_nn_itemGroupRow bg-faded'><td>Entree</td></tr>
<tr class='cbo_nn_itemPrimaryRow'>
  <a class='cbo_nn_itemHover' onclick="javascript:NetNutrition.UI.getItemNutritionLabelOnClick(event,14128416);">Scrambled Eggs</a>
  <img src='https://fss.dining.uri.edu/NetNutrition/Images/custom/Traits/Egg.png'/>
  <img src='https://fss.dining.uri.edu/NetNutrition/Images/custom/Traits/Vegetarian.png'/>
</tr>
<tr class='cbo_nn_itemAlternateRow'>
  <a class='cbo_nn_itemHover' onclick="javascript:NetNutrition.UI.getItemNutritionLabelOnClick(event,14128413);">Oatmeal</a>
  <img src='https://fss.dining.uri.edu/NetNutrition/Images/custom/Traits/Vegan.png'/>
  <img src='https://fss.dining.uri.edu/NetNutrition/Images/custom/Traits/Gluten.png'/>
</tr>
<tr class='cbo_nn_itemGroupRow bg-faded'><td>Sides</td></tr>
<tr class='cbo_nn_itemPrimaryRow'>
  <a class='cbo_nn_itemHover' onclick="javascript:NetNutrition.UI.getItemNutritionLabelOnClick(event,14128412);">Hash Browns</a>
</tr>
`;

const SAMPLE_NUTRITION = `
<div id='nutritionLabel'><td class='cbo_nn_LabelHeader'>Scrambled Eggs</td>
Serving Size 4 Oz. Portions (113g) Amount Per Serving Calories 249
Total Fat 18g Total Carbohydrate 2g Protein 16g
Ingredients: Whole Liquid Eggs Contains: Eggs
</div>
`;

function sampleMenu(overrides?: Partial<DiningMenu>): DiningMenu {
  return {
    location: URI_DINING_LOCATIONS.butterfield,
    date: "2026-08-17",
    fetchedAt: "2026-08-17T12:00:00.000Z",
    source: "netnutrition",
    mealPeriods: [
      {
        id: "breakfast",
        name: "Breakfast",
        externalMealOid: 2,
        stations: [
          {
            id: "nn-unit-2",
            name: "Homestyle",
            externalUnitOid: 2,
            items: [
              {
                id: "nn-14128416",
                name: "Scrambled Eggs",
                externalDetailOid: "14128416",
                dietaryTags: ["Vegetarian"],
                allergens: ["Eggs"],
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("URI dining location map", () => {
  it("maps Butterfield and Dining Hall to unit 1", () => {
    expect(resolveDiningLocationId("butterfield")).toBe("butterfield");
    expect(resolveDiningLocationId("butterfield-dining")).toBe("butterfield");
    expect(resolveDiningLocationId("dining-hall")).toBe("butterfield");
    expect(URI_DINING_LOCATIONS.butterfield.externalUnitOid).toBe(1);
  });

  it("maps Mainfare / Hope Commons to unit 15", () => {
    expect(resolveDiningLocationId("mainfare")).toBe("mainfare");
    expect(resolveDiningLocationId("mainfare-dining")).toBe("mainfare");
    expect(resolveDiningLocationId("hope-commons")).toBe("mainfare");
    expect(URI_DINING_LOCATIONS.mainfare.externalUnitOid).toBe(15);
  });

  it("returns null for unknown locations", () => {
    expect(resolveDiningLocationId("library")).toBeNull();
  });
});

describe("NetNutrition HTML normalization", () => {
  it("parses Butterfield child stations", () => {
    expect(parseChildUnits(SAMPLE_CHILD_HTML)).toEqual([
      { unitOid: 2, name: "Homestyle" },
      { unitOid: 3, name: "Allergy Pantry" },
    ]);
  });

  it("parses menu list meal periods and dates", () => {
    const links = parseMenuListPanel(SAMPLE_MENU_LIST);
    expect(links.filter((l) => l.mealId === "breakfast").map((l) => l.menuOid)).toEqual([
      241862, 241863,
    ]);
    expect(menuDateLabelMatchesIso("Monday, August 17, 2026", "2026-08-17")).toBe(true);
    expect(menuDateLabelMatchesIso("Tuesday, August 18, 2026", "2026-08-17")).toBe(false);
  });

  it("parses items with dietary tags and allergens", () => {
    const parsed = parseItemPanel(SAMPLE_ITEMS);
    expect(parsed.courses.map((c) => c.name)).toEqual(["Entree", "Sides"]);
    expect(parsed.courses[0]!.items[0]).toMatchObject({
      name: "Scrambled Eggs",
      externalDetailOid: "14128416",
      dietaryTags: ["Vegetarian"],
      allergens: ["Eggs"],
    });
    expect(parsed.courses[0]!.items[1]).toMatchObject({
      name: "Oatmeal",
      dietaryTags: expect.arrayContaining(["Vegan"]),
      allergens: expect.arrayContaining(["Gluten"]),
    });
  });

  it("parses nutrition label calories and contains", () => {
    const nutrition = parseNutritionLabelHtml(SAMPLE_NUTRITION);
    expect(nutrition.calories).toBe(249);
    expect(nutrition.proteinG).toBe(16);
    expect(nutrition.ingredients).toMatch(/Contains:\s*Eggs/i);
  });

  it("handles malformed item HTML without throwing", () => {
    expect(parseItemPanel("<div>no items</div>").courses).toEqual([]);
    expect(parseChildUnits("")).toEqual([]);
    expect(parseMenuListPanel("<div></div>")).toEqual([]);
  });
});

describe("meal and date selection", () => {
  it("converts ISO dates to NetNutrition params", () => {
    const today = uriTodayIso(new Date("2026-08-17T15:00:00-04:00"));
    expect(today).toBe("2026-08-17");
    expect(toNetNutritionDateParam("2026-08-17", new Date("2026-08-17T15:00:00-04:00"))).toBe(
      "Today",
    );
    expect(toNetNutritionDateParam("2026-08-18", new Date("2026-08-17T15:00:00-04:00"))).toBe(
      "8/18/2026",
    );
  });

  it("selects current meal by URI local hour", () => {
    expect(selectDefaultMealPeriod(["breakfast", "lunch", "dinner"], new Date("2026-08-17T08:00:00-04:00"))).toBe(
      "breakfast",
    );
    expect(selectDefaultMealPeriod(["breakfast", "lunch", "dinner"], new Date("2026-08-17T12:30:00-04:00"))).toBe(
      "lunch",
    );
    expect(selectDefaultMealPeriod(["breakfast", "lunch", "dinner"], new Date("2026-08-17T18:00:00-04:00"))).toBe(
      "dinner",
    );
    expect(selectDefaultMealPeriod(["dinner"], new Date("2026-08-17T08:00:00-04:00"))).toBe("dinner");
    expect(selectDefaultMealPeriod([])).toBeNull();
  });

  it("builds upcoming day chips", () => {
    const days = upcomingIsoDates("2026-08-17", 3);
    expect(days).toEqual(["2026-08-17", "2026-08-18", "2026-08-19"]);
    expect(formatDayChipLabel("2026-08-17", "2026-08-17")).toBe("Today");
    expect(formatDayChipLabel("2026-08-18", "2026-08-17")).toBe("Tomorrow");
    expect(formatDayChipLabel("2026-08-19", "2026-08-17")).toBe("Wed 8/19");
  });
});

describe("dining cache fallback", () => {
  it("returns fresh cache and stale fallback after expiry", () => {
    clearDiningMenuCache();
    const menu = sampleMenu();
    setCachedDiningMenu(menu, 60_000);
    expect(getFreshCachedDiningMenu("butterfield", "2026-08-17")?.mealPeriods[0]?.stations[0]?.items[0]?.name).toBe(
      "Scrambled Eggs",
    );

    // Force expiry
    setCachedDiningMenu(menu, -1);
    expect(getFreshCachedDiningMenu("butterfield", "2026-08-17")).toBeNull();
    expect(getCachedDiningMenu("butterfield", "2026-08-17")?.stale).toBe(true);
  });

  it("normalizes API response shape for Butterfield and Mainfare", () => {
    const butterfield = toDiningMenuResponse(sampleMenu());
    expect(butterfield.location.id).toBe("butterfield");
    expect(butterfield.mealPeriods[0]?.name).toBe("Breakfast");
    expect(butterfield.disclaimer).toMatch(/NetNutrition/);

    const mainfare = toDiningMenuResponse(
      sampleMenu({ location: URI_DINING_LOCATIONS.mainfare }),
    );
    expect(mainfare.location.id).toBe("mainfare");
    expect(mainfare.location.name).toBe("Mainfare Dining Hall");
  });

  it("represents empty menu periods as omitted after filter", () => {
    const empty = toDiningMenuResponse(sampleMenu({ mealPeriods: [] }));
    expect(empty.mealPeriods).toEqual([]);
  });

  it("serves cached menu when upstream fetch fails", async () => {
    clearDiningMenuCache();
    setCachedDiningMenu(sampleMenu(), 60_000);
    const { fetchUriDiningMenu } = await import("./uriDining");
    const failingFetch: typeof fetch = async () => {
      throw new Error("upstream unavailable");
    };
    const menu = await fetchUriDiningMenu({
      locationId: "butterfield",
      isoDate: "2026-08-17",
      fetchImpl: failingFetch,
      bypassCache: true,
    });
    expect(menu.stale).toBe(true);
    expect(menu.source).toBe("cache");
    expect(menu.mealPeriods[0]?.stations[0]?.items[0]?.name).toBe("Scrambled Eggs");
  });
});
