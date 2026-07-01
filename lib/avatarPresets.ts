/**
 * Curated full-appearance avatar presets for the onboarding preset picker.
 * Each preset applies style, seed, and all DiceBear appearance options at once.
 */

import type { DiceBearAvatarV2 } from "./dicebearAvatar";

export type AvatarLookPreset = DiceBearAvatarV2 & { label: string };

export const AVATAR_LOOK_PRESETS: readonly AvatarLookPreset[] = [
  {
    v: 2,
    style: "lorelei",
    seed: "cq-avatar-preset-1",
    label: "Preset 1",
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
    label: "Preset 2",
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
    label: "Preset 3",
    options: {
      backgroundColor: ["14532d", "052e16"],
      backgroundType: ["gradientLinear"],
      hair: ["short01"],
      eyes: ["variant04"],
      mouth: ["happy08"],
      skinColor: ["c6866a"],
      hairColor: ["d4a84b"],
      glassesProbability: 0,
      hat: ["variant01"],
      hatProbability: 100,
      accessoriesProbability: 0,
    },
  },
  {
    v: 2,
    style: "pixelArtNeutral",
    seed: "cq-avatar-preset-4",
    label: "Preset 4",
    options: {
      backgroundColor: ["0f172a"],
      backgroundType: ["gradientLinear"],
      hair: ["long01"],
      eyes: ["variant12"],
      mouth: ["happy04"],
      skinColor: ["fde4dc"],
      hairColor: ["8b2942"],
      glasses: ["dark04"],
      glassesProbability: 100,
      hatProbability: 0,
      accessories: ["variant02"],
      accessoriesProbability: 100,
    },
  },
  {
    v: 2,
    style: "openPeeps",
    seed: "cq-avatar-preset-5",
    label: "Preset 5",
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
    label: "Preset 6",
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
    label: "Preset 7",
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
    label: "Preset 8",
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

export function isAvatarLookPresetSelected(data: DiceBearAvatarV2, preset: DiceBearAvatarV2): boolean {
  return data.style === preset.style && data.seed === preset.seed;
}
