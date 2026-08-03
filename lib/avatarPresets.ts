/**
 * Curated full-appearance avatar presets for the onboarding preset picker.
 * Each preset applies style, seed, and all DiceBear appearance options at once.
 */

import type { DiceBearAvatarV2, DiceBearStyleId } from "./dicebearAvatar";
import {
  BG_FANTASY_PRESETS,
  HAIR_COLOR_SWATCHES,
  SKIN_TONE_SWATCHES,
  dicebearAdvancedUi as U,
} from "./dicebearAdvancedOptions";

export type AvatarLookPreset = DiceBearAvatarV2 & { label: string };

function styleAppearanceDefaults(style: DiceBearStyleId): Record<string, unknown> {
  const skin = SKIN_TONE_SWATCHES[2]!;
  const hairCol = HAIR_COLOR_SWATCHES[1]!;
  const bg = BG_FANTASY_PRESETS[0]!.backgroundColor;

  switch (style) {
    case "lorelei":
    case "loreleiNeutral":
      return {
        backgroundColor: bg,
        backgroundType: ["gradientLinear"],
        hair: [U.LORELEI_HAIR[0]!.v],
        eyes: [U.LORELEI_EYES[0]!.v],
        mouth: [U.LORELEI_MOUTH[0]!.v],
        skinColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: 0,
        hairAccessoriesProbability: 0,
      };
    case "pixelArt":
    case "pixelArtNeutral":
      return {
        backgroundColor: ["e8e4e0"],
        backgroundType: ["gradientLinear"],
        hair: [U.PIXEL_HAIR[0]!.v],
        eyes: [U.PIXEL_EYES[0]!.v],
        mouth: [U.PIXEL_MOUTH[0]!.v],
        skinColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: 0,
        hatProbability: 0,
        accessoriesProbability: 0,
      };
    case "openPeeps":
      return {
        backgroundColor: bg,
        backgroundType: ["gradientLinear"],
        head: [U.PEEPS_HEAD[0]!.v],
        face: [U.PEEPS_FACE[0]!.v],
        skinColor: skin.skinColor,
        headContrastColor: hairCol.hairColor,
        accessoriesProbability: 0,
      };
    case "adventurer":
    case "adventurerNeutral":
      return {
        backgroundColor: bg,
        backgroundType: ["gradientLinear"],
        hair: [U.ADV_HAIR[0]!.v],
        eyes: [U.ADV_EYES[0]!.v],
        mouth: [U.ADV_MOUTH[0]!.v],
        skinColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: 0,
        featuresProbability: 0,
      };
    case "micah":
      return {
        backgroundColor: bg,
        backgroundType: ["gradientLinear"],
        hair: [U.MICAH_HAIR[0]!.v],
        eyes: [U.MICAH_EYES[0]!.v],
        mouth: [U.MICAH_MOUTH[0]!.v],
        shirt: [U.MICAH_SHIRT[0]!.v],
        baseColor: skin.skinColor,
        hairColor: hairCol.hairColor,
        glassesProbability: 0,
      };
    default:
      return {
        backgroundColor: bg,
        backgroundType: ["gradientLinear"],
      };
  }
}

/** Merge curated preset data with style defaults so every field renders reliably. */
export function resolveAvatarPreset(preset: AvatarLookPreset): DiceBearAvatarV2 {
  const defaults = styleAppearanceDefaults(preset.style);
  return {
    v: 2,
    style: preset.style,
    seed: preset.seed,
    options: {
      ...defaults,
      ...preset.options,
    },
  };
}

export const AVATAR_LOOK_PRESETS: readonly AvatarLookPreset[] = [
  {
    v: 2,
    style: "lorelei",
    seed: "cq-avatar-preset-1",
    label: "Campus Classic",
    options: {
      backgroundColor: ["041e42"],
      backgroundType: ["gradientLinear"],
      hair: ["variant48"],
      eyes: ["variant12"],
      mouth: ["happy05"],
      skinColor: ["e8b4a0"],
      hairColor: ["4a3728"],
      glassesProbability: 0,
      hairAccessoriesProbability: 0,
    },
  },
  {
    v: 2,
    style: "loreleiNeutral",
    seed: "cq-avatar-preset-2",
    label: "Keaney Cool",
    options: {
      backgroundColor: ["68abe8", "041e42"],
      backgroundType: ["gradientLinear"],
      hair: ["variant25"],
      eyes: ["variant08"],
      mouth: ["happy08"],
      skinColor: ["d4a574"],
      hairColor: ["1a1a1a"],
      glasses: ["variant02"],
      glassesProbability: 100,
      hairAccessoriesProbability: 0,
    },
  },
  {
    v: 2,
    style: "pixelArt",
    seed: "cq-avatar-preset-3",
    label: "Pixel Scholar",
    options: {
      backgroundColor: ["c5d4c0", "e8e4e0"],
      backgroundType: ["gradientLinear"],
      hair: ["short01"],
      eyes: ["variant04"],
      mouth: ["happy08"],
      skinColor: ["f6d4c8"],
      hairColor: ["d4a84b"],
      glassesProbability: 0,
      hatProbability: 0,
      accessoriesProbability: 0,
    },
  },
  {
    v: 2,
    style: "pixelArtNeutral",
    seed: "cq-avatar-preset-4",
    label: "Soft Focus",
    options: {
      backgroundColor: ["d4c4b8", "f6d4c8"],
      backgroundType: ["gradientLinear"],
      hair: ["long01"],
      eyes: ["variant12"],
      mouth: ["happy04"],
      skinColor: ["fde4dc"],
      hairColor: ["8b2942"],
      glasses: ["dark04"],
      glassesProbability: 100,
      hatProbability: 0,
      accessoriesProbability: 0,
    },
  },
  {
    v: 2,
    style: "openPeeps",
    seed: "cq-avatar-preset-5",
    label: "Open Smile",
    options: {
      backgroundColor: ["312e81", "0ea5e9"],
      backgroundType: ["gradientLinear"],
      head: ["longCurly"],
      face: ["smileBig"],
      skinColor: ["a67c52"],
      headContrastColor: ["4a3728"],
      accessoriesProbability: 0,
    },
  },
  {
    v: 2,
    style: "adventurer",
    seed: "cq-avatar-preset-6",
    label: "Trailblazer",
    options: {
      backgroundColor: ["7c2d12", "1c1917"],
      backgroundType: ["gradientLinear"],
      hair: ["short08"],
      eyes: ["variant08"],
      mouth: ["variant12"],
      skinColor: ["8d5524"],
      hairColor: ["b87333"],
      glassesProbability: 0,
      features: ["freckles"],
      featuresProbability: 100,
    },
  },
  {
    v: 2,
    style: "adventurerNeutral",
    seed: "cq-avatar-preset-7",
    label: "Violet Dream",
    options: {
      backgroundColor: ["4c1d95", "1e1b4b"],
      backgroundType: ["gradientLinear"],
      hair: ["long12"],
      eyes: ["variant15"],
      mouth: ["variant20"],
      skinColor: ["f6d4c8"],
      hairColor: ["5b4b8c"],
      glasses: ["variant03"],
      glassesProbability: 100,
      featuresProbability: 0,
    },
  },
  {
    v: 2,
    style: "micah",
    seed: "cq-avatar-preset-8",
    label: "Gold Glow",
    options: {
      backgroundColor: ["422006", "ca8a04"],
      backgroundType: ["gradientLinear"],
      hair: ["pixie"],
      eyes: ["round"],
      mouth: ["smile"],
      shirt: ["crew"],
      baseColor: ["e8b4a0"],
      hairColor: ["1e3a5f"],
      glassesProbability: 0,
    },
  },
] as const;

export function isAvatarLookPresetSelected(data: DiceBearAvatarV2, preset: AvatarLookPreset): boolean {
  return data.style === preset.style && data.seed === preset.seed;
}
