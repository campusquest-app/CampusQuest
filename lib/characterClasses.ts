/**
 * CampusQuest character classes + DiceBear starter presets per class.
 */

import type { CharacterStats } from "./types";
import type { DiceBearAvatarV2 } from "./dicebearAvatar";
import { serializeDiceBearAvatar } from "./dicebearAvatar";

export const CHARACTER_CLASSES = [
  {
    id: "gym",
    icon: "💪",
    name: "Iron Ram",
    realm: "Gym",
    styleSub: "Big eyes + thick eyebrows, spiky hair, small muscular body",
    /** One-line vibe copy for onboarding. */
    vibeDescription: "Strength, hustle, and early mornings.",
    statsBoost: { strength: 3, stamina: 2, knowledge: 0, social: 0, focus: 0 },
    traits: ["Simple dumbbell prop", "Hoodie + armor combo"],
    specialSkill: "Early Morning Grind",
    outfitLabel: "Gym",
    starterWeapon: "dumbbell",
    propIcon: "💪",
  },
  {
    id: "knight",
    icon: "🐏",
    name: "Rhody Knight",
    realm: "Discipline",
    styleSub: "Blue & gold armor, textbook shield",
    vibeDescription: "Discipline, pride, and Rhody energy.",
    statsBoost: { knowledge: 2, strength: 1, stamina: 0, social: 0, focus: 0 },
    traits: ["Blue & gold armor", "Ram horn helmet sticker", "Textbook shield"],
    specialSkill: "Midterm Mastery",
    outfitLabel: "Knight",
    starterWeapon: "textbook",
    propIcon: "📚",
  },
  {
    id: "mage",
    icon: "📚",
    name: "Library Sage",
    realm: "Study",
    styleSub: "Laptop spellbook, coffee potion",
    vibeDescription: "Study magic and late-night focus.",
    statsBoost: { knowledge: 3, focus: 2, strength: 0, stamina: 0, social: 0 },
    traits: ["Laptop spellbook", "Coffee potion", "Big nerd glasses"],
    specialSkill: "All-Nighter Spell",
    outfitLabel: "Mage",
    starterWeapon: "laptop",
    propIcon: "💻",
  },
  {
    id: "bard",
    icon: "🎸",
    name: "Quad Bard",
    realm: "Social",
    styleSub: "Guitar or mic, URI scarf",
    vibeDescription: "Social energy and campus vibes.",
    statsBoost: { social: 3, strength: 0, stamina: 0, knowledge: 0, focus: 1 },
    traits: ["Guitar or mic", "URI scarf", "Big smile"],
    specialSkill: "Networking Aura",
    outfitLabel: "Bard",
    starterWeapon: "guitar",
    propIcon: "🎸",
  },
  {
    id: "rogue",
    icon: "💼",
    name: "Resume Rogue",
    realm: "Career",
    styleSub: "Suit + cloak, laptop dagger",
    vibeDescription: "Career grind and quiet ambition.",
    statsBoost: { knowledge: 3, focus: 2, strength: 0, stamina: 0, social: 0 },
    traits: ["Suit + cloak", "Laptop dagger", "Resume scroll"],
    specialSkill: "LinkedIn Strike",
    outfitLabel: "Rogue",
    starterWeapon: "laptop",
    propIcon: "💼",
  },
] as const;

export type CharacterClassId = (typeof CHARACTER_CLASSES)[number]["id"];

/** DiceBear seeds + styles for “class vibe” quick picks (see docs/DICEBEAR_LICENSES.md). */
export const CLASS_DICEBEAR_BOOTSTRAP: Record<CharacterClassId, Pick<DiceBearAvatarV2, "style" | "seed" | "options">> = {
  gym: {
    style: "adventurer",
    seed: "CQ Iron Ram Gym",
    options: { backgroundColor: ["041e42"], backgroundType: ["gradientLinear"] },
  },
  knight: {
    style: "lorelei",
    seed: "CQ Rhody Knight",
    options: { backgroundColor: ["68abe8", "041e42"], backgroundType: ["gradientLinear"] },
  },
  mage: {
    style: "loreleiNeutral",
    seed: "CQ Library Sage",
    options: { backgroundColor: ["1e3a5f"], backgroundType: ["gradientLinear"] },
  },
  bard: {
    style: "micah",
    seed: "CQ Quad Bard",
    options: { backgroundColor: ["4a1942", "041e42"], backgroundType: ["gradientLinear"] },
  },
  rogue: {
    style: "openPeeps",
    seed: "CQ Resume Rogue",
    options: { backgroundColor: ["111827"], backgroundType: ["gradientLinear"] },
  },
};

export function buildDiceBearForClass(classId: CharacterClassId): DiceBearAvatarV2 {
  const b = CLASS_DICEBEAR_BOOTSTRAP[classId];
  return { v: 2, style: b.style, seed: b.seed, options: { ...b.options } };
}

export function getClassById(id: string) {
  return CHARACTER_CLASSES.find((c) => c.id === id) ?? null;
}

/** Display title for profile/character (e.g. "Iron Ram", "Rhody Knight"). */
export function getClassTitle(classId: string | undefined | null): string | null {
  if (!classId) return null;
  const cls = getClassById(classId);
  return cls?.name ?? null;
}

/** Short realm label (e.g. "Gym", "Discipline", "Study"). */
export function getClassRealm(classId: string | undefined | null): string | null {
  if (!classId) return null;
  const cls = getClassById(classId);
  return cls?.realm ?? null;
}

export function getPropIconForClass(classId: string): string | null {
  const cls = getClassById(classId);
  return cls?.propIcon ?? null;
}

export function getPropIconForWeapon(weaponId: string): string | null {
  const w = STARTER_WEAPONS.find((x) => x.id === weaponId);
  return w?.icon ?? null;
}

export function getClassAvatarPreset(classId: CharacterClassId): string {
  return serializeDiceBearAvatar(buildDiceBearForClass(classId));
}

/** Apply a class's stat boost to base stats. */
export function applyClassStats(base: CharacterStats, classId: CharacterClassId): CharacterStats {
  const cls = getClassById(classId);
  if (!cls) return base;
  const next = { ...base };
  (Object.keys(cls.statsBoost) as (keyof CharacterStats)[]).forEach((key) => {
    next[key] = (next[key] ?? 0) + (cls.statsBoost[key] ?? 0);
  });
  return next;
}

export const STARTER_WEAPONS = [
  { id: "textbook", label: "Textbook", icon: "📚" },
  { id: "dumbbell", label: "Dumbbell", icon: "💪" },
  { id: "laptop", label: "Laptop", icon: "💻" },
  { id: "coffee", label: "Coffee Cup", icon: "☕" },
  { id: "guitar", label: "Guitar", icon: "🎸" },
] as const;
