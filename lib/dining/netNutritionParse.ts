import type { DiningMealPeriodId, DiningMenuItem, DiningNutrition } from "./types";
import { URI_MEAL_PERIODS } from "./uriDiningLocations";

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripTags(html: string): string {
  return decodeBasicEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const TRAIT_TO_DIETARY: Record<string, string> = {
  Vegan: "Vegan",
  Vegetarian: "Vegetarian",
  Gluten: "Gluten",
};

const TRAIT_TO_ALLERGEN: Record<string, string> = {
  Dairy: "Milk",
  Egg: "Eggs",
  Eggs: "Eggs",
  Fish: "Fish",
  Peanut: "Peanuts",
  Peanuts: "Peanuts",
  Sesame: "Sesame",
  ShellFish: "Shellfish",
  Shellfish: "Shellfish",
  Soy: "Soy",
  TreeNut: "Tree Nuts",
  Wheat: "Wheat",
  Gluten: "Gluten",
  Alcohol: "Alcohol",
  CautionLabel: "Allergens not defined — consult dining staff",
};

export type ParsedChildUnit = { unitOid: number; name: string };

export function parseChildUnits(html: string): ParsedChildUnit[] {
  const out: ParsedChildUnit[] = [];
  const seen = new Set<number>();
  const re = /childUnitsSelectUnit\((\d+)\)[^>]*>\s*([^<]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const unitOid = Number(match[1]);
    const name = decodeBasicEntities(match[2]).trim();
    if (!unitOid || !name || seen.has(unitOid)) continue;
    seen.add(unitOid);
    out.push({ unitOid, name });
  }
  return out;
}

export type ParsedMenuLink = {
  menuOid: number;
  mealName: string;
  mealId: DiningMealPeriodId | null;
  dateLabel: string;
};

const MEAL_NAME_TO_ID: Record<string, DiningMealPeriodId> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
};

/**
 * Menu list panels group links under `card-title` date headers.
 */
export function parseMenuListPanel(html: string): ParsedMenuLink[] {
  const out: ParsedMenuLink[] = [];
  const sections = html.split(/class=['"]card-title[^'"]*['"][^>]*>/i);
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i]!;
    const dateLabelMatch = section.match(/^([^<]+)/);
    const dateLabel = decodeBasicEntities(dateLabelMatch?.[1] ?? "").trim();
    const menuRe = /menuListSelectMenu\((\d+)\)[^>]*>\s*([^<]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = menuRe.exec(section)) !== null) {
      const menuOid = Number(match[1]);
      const mealName = decodeBasicEntities(match[2]).trim();
      const mealId = MEAL_NAME_TO_ID[mealName.toLowerCase()] ?? null;
      if (!menuOid || !mealName) continue;
      out.push({ menuOid, mealName, mealId, dateLabel });
    }
  }
  return out;
}

/** Match NetNutrition date header like "Monday, August 17, 2026" to ISO date. */
export function menuDateLabelMatchesIso(dateLabel: string, isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const long = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(target);
  const normalizedLabel = dateLabel.replace(/\s+/g, " ").trim();
  return normalizedLabel === long || normalizedLabel.includes(long);
}

export type ParsedItemPanel = {
  courses: Array<{ name: string; items: DiningMenuItem[] }>;
};

export function parseItemPanel(html: string): ParsedItemPanel {
  const courses: Array<{ name: string; items: DiningMenuItem[] }> = [];
  let current: { name: string; items: DiningMenuItem[] } | null = null;

  // Walk group headers and item rows in document order via a simplified split.
  const tokens = html.split(/(?=<tr\b)/i);
  for (const token of tokens) {
    if (/cbo_nn_itemGroupRow/i.test(token)) {
      const nameMatch =
        token.match(/cbo_nn_itemGroupRow[^>]*>[\s\S]*?<t[dh][^>]*>\s*([^<]+)/i) ??
        token.match(/cbo_nn_itemGroupRow[^>]*>\s*<[^>]+>\s*([^<]+)/i);
      const name = decodeBasicEntities(nameMatch?.[1] ?? "").trim();
      if (name) {
        current = { name, items: [] };
        courses.push(current);
      }
      continue;
    }
    if (!/cbo_nn_item(?:Primary|Alternate)Row/i.test(token)) continue;
    const nameMatch = token.match(/cbo_nn_itemHover[^>]*>([^<]+)/i);
    const name = decodeBasicEntities(nameMatch?.[1] ?? "").trim();
    if (!name) continue;
    const detailMatch = token.match(/getItemNutritionLabelOnClick\(\s*event\s*,\s*(\d+)/i);
    const traits: string[] = [];
    const traitRe = /Traits\/([^"'/]+)\.png/gi;
    let traitMatch: RegExpExecArray | null;
    while ((traitMatch = traitRe.exec(token)) !== null) {
      traits.push(traitMatch[1]!);
    }
    const dietaryTags: string[] = [];
    const allergens: string[] = [];
    for (const trait of traits) {
      if (TRAIT_TO_DIETARY[trait]) dietaryTags.push(TRAIT_TO_DIETARY[trait]!);
      if (TRAIT_TO_ALLERGEN[trait]) allergens.push(TRAIT_TO_ALLERGEN[trait]!);
    }
    const detailOid = detailMatch?.[1];
    const item: DiningMenuItem = {
      id: detailOid ? `nn-${detailOid}` : `name-${name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      externalDetailOid: detailOid,
      dietaryTags: dietaryTags.length ? Array.from(new Set(dietaryTags)) : undefined,
      allergens: allergens.length ? Array.from(new Set(allergens)) : undefined,
    };
    if (!current) {
      current = { name: "Menu", items: [] };
      courses.push(current);
    }
    current.items.push(item);
  }

  return { courses: courses.filter((c) => c.items.length > 0) };
}

export function parseNutritionLabelHtml(html: string): DiningNutrition {
  const text = stripTags(html);
  const num = (label: string): number | undefined => {
    const m = text.match(new RegExp(`${label}\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"));
    return m ? Number(m[1]) : undefined;
  };
  const serving =
    text.match(/Serving Size\s+([^]+?)(?:Amount Per Serving|Calories)/i)?.[1]?.trim() ??
    undefined;
  const ingredients =
    text.match(/Ingredients:\s*([^]+?)(?:Contains:|$)/i)?.[1]?.trim() ?? undefined;
  const contains = text.match(/Contains:\s*([^]+?)(?:$)/i)?.[1]?.trim();
  return {
    calories: num("Calories"),
    fatG: num("Total Fat"),
    carbsG: num("Total Carbohydrate"),
    proteinG: num("Protein"),
    servingSize: serving,
    ingredients: contains ? `${ingredients ?? ""}${ingredients ? " " : ""}Contains: ${contains}`.trim() : ingredients,
    rawText: text.slice(0, 2000),
  };
}

export function parseHoursMarkup(html: string): { summary: string } {
  const text = stripTags(html);
  return { summary: text.slice(0, 500) };
}

export function mealPeriodMeta(id: DiningMealPeriodId) {
  return URI_MEAL_PERIODS[id];
}
