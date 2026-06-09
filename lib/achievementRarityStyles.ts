import type { AchievementRarity } from "./achievementsCatalog";

export const RARITY_CSS: Record<
  AchievementRarity,
  { ring: string; glow: string; text: string; bg: string; label: string }
> = {
  common: {
    ring: "ring-white/20",
    glow: "shadow-[0_0_18px_rgba(255,255,255,0.12)]",
    text: "text-white/70",
    bg: "from-white/10 to-white/5",
    label: "Common",
  },
  rare: {
    ring: "ring-sky-400/45",
    glow: "shadow-[0_0_22px_rgba(56,189,248,0.35)]",
    text: "text-sky-200",
    bg: "from-sky-500/20 to-sky-900/10",
    label: "Rare",
  },
  epic: {
    ring: "ring-violet-400/50",
    glow: "shadow-[0_0_26px_rgba(167,139,250,0.45)]",
    text: "text-violet-200",
    bg: "from-violet-500/25 to-indigo-900/15",
    label: "Epic",
  },
  legendary: {
    ring: "ring-amber-400/55",
    glow: "shadow-[0_0_30px_rgba(251,191,36,0.5)]",
    text: "text-amber-200",
    bg: "from-amber-500/30 to-orange-900/15",
    label: "Legendary",
  },
  mythic: {
    ring: "ring-fuchsia-400/60",
    glow: "shadow-[0_0_36px_rgba(232,121,249,0.55),0_0_18px_rgba(251,191,36,0.35)]",
    text: "text-fuchsia-100",
    bg: "from-fuchsia-500/35 via-amber-500/20 to-violet-900/20",
    label: "Mythic",
  },
};

export const TROPHY_KIND_LABEL: Record<string, string> = {
  trophy: "Trophy",
  medal: "Medal",
  banner: "Banner",
  relic: "Relic",
  badge: "Badge",
};
