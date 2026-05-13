/**
 * Curated DiceBear option presets for the CampusQuest avatar lab.
 * No `@dicebear/*` imports — safe for SSR bundles that only parse JSON elsewhere.
 */

import type { DiceBearStyleId } from "./dicebearAvatar";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// —— Shared fantasy palette (hex without #, DiceBear convention) ——

export const SKIN_TONE_SWATCHES: { label: string; skinColor: string[] }[] = [
  { label: "Moon", skinColor: ["fde4dc"] },
  { label: "Pearl", skinColor: ["f6d4c8"] },
  { label: "Sand", skinColor: ["e8b4a0"] },
  { label: "Honey", skinColor: ["d4a574"] },
  { label: "Copper", skinColor: ["c6866a"] },
  { label: "Bronze", skinColor: ["a67c52"] },
  { label: "Cocoa", skinColor: ["8d5524"] },
  { label: "Umber", skinColor: ["6b3a1b"] },
  { label: "Obsidian", skinColor: ["4b2812"] },
  { label: "Dusk", skinColor: ["3d2314"] },
  { label: "Slate", skinColor: ["d4c4b8"] },
  { label: "Jade", skinColor: ["c5d4c0"] },
];

export const HAIR_COLOR_SWATCHES: { label: string; hairColor: string[] }[] = [
  { label: "Raven", hairColor: ["1a1a1a"] },
  { label: "Chocolate", hairColor: ["4a3728"] },
  { label: "Caramel", hairColor: ["8b5a2b"] },
  { label: "Gold", hairColor: ["d4a84b"] },
  { label: "Copper hair", hairColor: ["b87333"] },
  { label: "Auburn", hairColor: ["722f37"] },
  { label: "Ruby", hairColor: ["8b2942"] },
  { label: "Ocean", hairColor: ["1e3a5f"] },
  { label: "Violet", hairColor: ["5b4b8c"] },
  { label: "Snow", hairColor: ["e8e4e0"] },
  { label: "Silver", hairColor: ["9ca3af"] },
  { label: "Keaney", hairColor: ["68abe8"] },
];

export const BG_FANTASY_PRESETS: { id: string; label: string; sub: string; backgroundColor: string[] }[] = [
  { id: "navy", label: "Night Court", sub: "deep URI", backgroundColor: ["041e42"] },
  { id: "keaney", label: "Keaney Aegis", sub: "blue · gold", backgroundColor: ["68abe8", "041e42"] },
  { id: "ember", label: "Dragon Hearth", sub: "ember", backgroundColor: ["7c2d12", "1c1917"] },
  { id: "forest", label: "Elven Grove", sub: "forest", backgroundColor: ["14532d", "052e16"] },
  { id: "void", label: "Shadow Rift", sub: "void", backgroundColor: ["0f172a"] },
  { id: "aurora", label: "Arcane Sky", sub: "aurora", backgroundColor: ["312e81", "0ea5e9"] },
  { id: "royal", label: "Royal Hall", sub: "violet", backgroundColor: ["4c1d95", "1e1b4b"] },
  { id: "sunset", label: "Sunset Gate", sub: "dusk", backgroundColor: ["9a3412", "431407"] },
  { id: "frost", label: "Frostspire", sub: "ice", backgroundColor: ["0c4a6e", "e0f2fe"] },
  { id: "goldhaze", label: "Gilded Quest", sub: "gold mist", backgroundColor: ["422006", "ca8a04"] },
];

// —— Lorelei / Lorelei neutral ——

const LORELEI_HAIR = [
  { label: "Sovereign waves", v: "variant48" },
  { label: "Knight bob", v: "variant25" },
  { label: "Scholar short", v: "variant15" },
  { label: "Arcana bun", v: "variant08" },
  { label: "Ranger winds", v: "variant35" },
  { label: "Rogue pixie", v: "variant05" },
  { label: "Braid crown", v: "variant40" },
  { label: "Long oath", v: "variant32" },
  { label: "Battle pony", v: "variant20" },
  { label: "Mystic curls", v: "variant44" },
  { label: "Sleek duelist", v: "variant12" },
  { label: "Wild ember", v: "variant38" },
] as const;

const LORELEI_EYES = [
  { label: "Starlit", v: "variant12" },
  { label: "Focused", v: "variant08" },
  { label: "Dream", v: "variant18" },
  { label: "Glint", v: "variant24" },
  { label: "Calm", v: "variant05" },
  { label: "Keen", v: "variant20" },
  { label: "Soft", v: "variant03" },
  { label: "Bold", v: "variant15" },
] as const;

const LORELEI_MOUTH = [
  { label: "Heroic grin", v: "happy05" },
  { label: "Battle smirk", v: "happy08" },
  { label: "Sage calm", v: "happy02" },
  { label: "Laugh", v: "happy12" },
  { label: "Serious", v: "happy16" },
  { label: "Oath", v: "happy01" },
  { label: "Thoughtful", v: "sad02" },
  { label: "Weary", v: "sad05" },
] as const;

const LORELEI_GLASSES = [
  { label: "None", v: null },
  { label: "Round spectacles", v: "variant01" },
  { label: "Scholar", v: "variant02" },
  { label: "Bold frames", v: "variant03" },
  { label: "Arcane lens", v: "variant04" },
  { label: "Wire wise", v: "variant05" },
] as const;

const LORELEI_HAT_FLOWERS = [
  { label: "None", v: false },
  { label: "Floral crown", v: true },
] as const;

// —— Pixel art ——

const PIXEL_HAIR = [
  { label: "Spiky", v: "short01" },
  { label: "Long hero", v: "long01" },
  { label: "Scholar", v: "short12" },
  { label: "Curls", v: "short08" },
  { label: "Crew", v: "short04" },
  { label: "Pony clash", v: "long08" },
  { label: "Mage mid", v: "short15" },
  { label: "Rogue shag", v: "short20" },
] as const;

const PIXEL_EYES = [
  { label: "Bright", v: "variant04" },
  { label: "Narrow", v: "variant08" },
  { label: "Wide", v: "variant12" },
  { label: "Focus", v: "variant02" },
  { label: "Soft", v: "variant06" },
] as const;

const PIXEL_MOUTH = [
  { label: "Grin", v: "happy08" },
  { label: "Smirk", v: "happy04" },
  { label: "Battle", v: "happy01" },
  { label: "Calm", v: "sad03" },
] as const;

const PIXEL_GLASSES = [
  { label: "None", v: null },
  { label: "Light sage", v: "light04" },
  { label: "Dark rogue", v: "dark04" },
  { label: "Bright", v: "light01" },
  { label: "Shadow", v: "dark07" },
] as const;

const PIXEL_HAT = [
  { label: "None", v: null },
  { label: "Cap I", v: "variant01" },
  { label: "Cap II", v: "variant03" },
  { label: "Crown edge", v: "variant06" },
  { label: "Mage top", v: "variant08" },
] as const;

const PIXEL_ACCESSORIES = [
  { label: "None", v: null },
  { label: "Sigil", v: "variant04" },
  { label: "Charm", v: "variant03" },
  { label: "Medallion", v: "variant02" },
  { label: "Badge", v: "variant01" },
] as const;

// —— Adventurer / Adventurer neutral ——

const ADV_HAIR = [
  { label: "Short valor", v: "short08" },
  { label: "Long quest", v: "long12" },
  { label: "Braided", v: "long18" },
  { label: "Wild", v: "short04" },
  { label: "Knight", v: "short01" },
  { label: "Ranger", v: "long08" },
] as const;

const ADV_EYES = [
  { label: "Alert", v: "variant08" },
  { label: "Steel", v: "variant15" },
  { label: "Warm", v: "variant20" },
  { label: "Keen", v: "variant04" },
] as const;

const ADV_MOUTH = [
  { label: "Resolve", v: "variant12" },
  { label: "Grimace", v: "variant08" },
  { label: "Smile", v: "variant20" },
  { label: "Rest", v: "variant04" },
] as const;

const ADV_GLASSES = [
  { label: "None", v: null },
  { label: "Gear I", v: "variant01" },
  { label: "Gear II", v: "variant03" },
  { label: "Lens V", v: "variant05" },
] as const;

const ADV_FEATURES = [
  { label: "None", v: null },
  { label: "Mustache", v: "mustache" },
  { label: "Freckles", v: "freckles" },
  { label: "Blush", v: "blush" },
  { label: "Mark", v: "birthmark" },
] as const;

// —— Micah ——

const MICAH_HAIR = [
  { label: "Full", v: "full" },
  { label: "Pixie", v: "pixie" },
  { label: "Turban", v: "turban" },
  { label: "Doug", v: "dougFunny" },
  { label: "Danny", v: "dannyPhantom" },
  { label: "Clean", v: "mrClean" },
  { label: "Fonze", v: "fonze" },
  { label: "Mr T", v: "mrT" },
] as const;

const MICAH_EYES = [
  { label: "Eyes", v: "eyes" },
  { label: "Round", v: "round" },
  { label: "Smiling", v: "smiling" },
  { label: "Shadow", v: "eyesShadow" },
  { label: "Smiling shade", v: "smilingShadow" },
] as const;

const MICAH_MOUTH = [
  { label: "Smile", v: "smile" },
  { label: "Laugh", v: "laughing" },
  { label: "Nervous", v: "nervous" },
  { label: "Surprised", v: "surprised" },
  { label: "Smirk", v: "smirk" },
] as const;

const MICAH_GLASSES = [
  { label: "None", v: null },
  { label: "Round", v: "round" },
  { label: "Square", v: "square" },
] as const;

const MICAH_SHIRT = [
  { label: "Open", v: "open" },
  { label: "Crew", v: "crew" },
  { label: "Collared", v: "collared" },
] as const;

// —— Open Peeps ——

const PEEPS_HEAD = [
  { label: "Long", v: "long" },
  { label: "Bun", v: "bun" },
  { label: "Cornrows", v: "cornrows" },
  { label: "Dreads", v: "dreads1" },
  { label: "Mohawk", v: "mohawk" },
  { label: "Beanie", v: "hatBeanie" },
  { label: "Turban", v: "turban" },
  { label: "Short", v: "short4" },
  { label: "Curly", v: "longCurly" },
  { label: "Hijab", v: "hijab" },
] as const;

const PEEPS_FACE = [
  { label: "Smile", v: "smile" },
  { label: "Grin", v: "smileBig" },
  { label: "LOL", v: "smileLOL" },
  { label: "Serious", v: "serious" },
  { label: "Calm", v: "calm" },
  { label: "Awe", v: "awe" },
  { label: "Cheeky", v: "cheeky" },
] as const;

const PEEPS_ACCESSORIES = [
  { label: "None", v: null },
  { label: "Glasses", v: "glasses" },
  { label: "Shades", v: "sunglasses" },
  { label: "Goggles", v: "glasses3" },
  { label: "Eyepatch", v: "eyepatch" },
] as const;

/** Random option bundle for “full randomize” per style (merged into DiceBear options). */
export function randomAppearanceOptions(style: DiceBearStyleId): Record<string, unknown> {
  const skin = pick(SKIN_TONE_SWATCHES);
  const hairCol = pick(HAIR_COLOR_SWATCHES);
  switch (style) {
    case "lorelei":
    case "loreleiNeutral": {
      const g = pick(LORELEI_GLASSES);
      const flowers = pick(LORELEI_HAT_FLOWERS);
      return {
        hair: [pick(LORELEI_HAIR).v],
        eyes: [pick(LORELEI_EYES).v],
        mouth: [pick(LORELEI_MOUTH).v],
        skinColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: g.v ? 100 : 0,
        ...(g.v ? { glasses: [g.v] } : {}),
        ...(flowers.v ? { hairAccessories: ["flowers"], hairAccessoriesProbability: 100 } : { hairAccessoriesProbability: 0 }),
      };
    }
    case "pixelArt":
    case "pixelArtNeutral": {
      const h = pick(PIXEL_HAT);
      const gl = pick(PIXEL_GLASSES);
      const acc = pick(PIXEL_ACCESSORIES);
      return {
        hair: [pick(PIXEL_HAIR).v],
        eyes: [pick(PIXEL_EYES).v],
        mouth: [pick(PIXEL_MOUTH).v],
        skinColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: gl.v ? 100 : 0,
        ...(gl.v ? { glasses: [gl.v] } : {}),
        hatProbability: h.v ? 100 : 0,
        ...(h.v ? { hat: [h.v] } : {}),
        accessoriesProbability: acc.v ? 100 : 0,
        ...(acc.v ? { accessories: [acc.v] } : {}),
      };
    }
    case "adventurer":
    case "adventurerNeutral": {
      const g = pick(ADV_GLASSES);
      const f = pick(ADV_FEATURES);
      return {
        hair: [pick(ADV_HAIR).v],
        eyes: [pick(ADV_EYES).v],
        mouth: [pick(ADV_MOUTH).v],
        skinColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: g.v ? 100 : 0,
        ...(g.v ? { glasses: [g.v] } : {}),
        featuresProbability: f.v ? 100 : 0,
        ...(f.v ? { features: [f.v] } : {}),
      };
    }
    case "micah": {
      const g = pick(MICAH_GLASSES);
      return {
        hair: [pick(MICAH_HAIR).v],
        eyes: [pick(MICAH_EYES).v],
        mouth: [pick(MICAH_MOUTH).v],
        shirt: [pick(MICAH_SHIRT).v],
        baseColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: g.v ? 100 : 0,
        ...(g.v ? { glasses: [g.v] } : {}),
      };
    }
    case "openPeeps": {
      const a = pick(PEEPS_ACCESSORIES);
      return {
        head: [pick(PEEPS_HEAD).v],
        face: [pick(PEEPS_FACE).v],
        skinColor: skin.skinColor,
        headContrastColor: hairCol.hairColor,
        accessoriesProbability: a.v ? 100 : 0,
        ...(a.v ? { accessories: [a.v] } : {}),
      };
    }
    default:
      return {};
  }
}

export const dicebearAdvancedUi = {
  LORELEI_HAIR,
  LORELEI_EYES,
  LORELEI_MOUTH,
  LORELEI_GLASSES,
  LORELEI_HAT_FLOWERS,
  PIXEL_HAIR,
  PIXEL_EYES,
  PIXEL_MOUTH,
  PIXEL_GLASSES,
  PIXEL_HAT,
  PIXEL_ACCESSORIES,
  ADV_HAIR,
  ADV_EYES,
  ADV_MOUTH,
  ADV_GLASSES,
  ADV_FEATURES,
  MICAH_HAIR,
  MICAH_EYES,
  MICAH_MOUTH,
  MICAH_GLASSES,
  MICAH_SHIRT,
  PEEPS_HEAD,
  PEEPS_FACE,
  PEEPS_ACCESSORIES,
} as const;

export function randomBackgroundColors(): string[] {
  return pick(BG_FANTASY_PRESETS).backgroundColor;
}
