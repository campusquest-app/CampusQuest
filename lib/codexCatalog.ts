import { COSMETICS, type CosmeticItem, type CosmeticSlot, type LootRarity } from "./cosmetics";
import {
  ACHIEVEMENT_CATALOG,
  CATEGORY_META,
  type AchievementCategory,
  type AchievementDef,
} from "./achievementsCatalog";

export const CODEX_TITLE = "THE CODEX";
export const CODEX_SUBTITLE = "Adventurer's Collection";

export type CodexRarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export type CodexSource =
  | "events"
  | "locations"
  | "quests"
  | "boss_battles"
  | "guilds"
  | "achievements"
  | "seasonal";

export const CODEX_SCORE_BY_RARITY: Record<CodexRarity, number> = {
  common: 5,
  rare: 15,
  epic: 30,
  legendary: 60,
  mythic: 150,
};

export const CODEX_RARITY_LABELS: Record<CodexRarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
};

export const CODEX_RARITY_ORDER: CodexRarity[] = ["common", "rare", "epic", "legendary", "mythic"];

export const CODEX_SOURCE_META: Record<CodexSource, { label: string; icon: string }> = {
  events: { label: "Events", icon: "🎪" },
  locations: { label: "Locations", icon: "📍" },
  quests: { label: "Quests", icon: "📜" },
  boss_battles: { label: "Boss Battles", icon: "⚔️" },
  guilds: { label: "Guilds", icon: "🛡️" },
  achievements: { label: "Achievements", icon: "🏆" },
  seasonal: { label: "Seasonal", icon: "✨" },
};

export type CodexFilter =
  | "all"
  | CodexRarity
  | "event"
  | "location"
  | "quest"
  | "seasonal";

export const CODEX_FILTER_CHIPS: { id: CodexFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "common", label: "Common" },
  { id: "rare", label: "Rare" },
  { id: "epic", label: "Epic" },
  { id: "legendary", label: "Legendary" },
  { id: "mythic", label: "Mythic" },
  { id: "event", label: "Event" },
  { id: "location", label: "Location" },
  { id: "quest", label: "Quest" },
  { id: "seasonal", label: "Seasonal" },
];

export type CodexEntry = {
  id: string;
  kind: "loot" | "achievement";
  name: string;
  description: string;
  lore: string;
  icon: string;
  rarity: CodexRarity;
  source: CodexSource;
  categoryLabel: string;
  /** Undiscovered name stays hidden until found. */
  hiddenUntilFound: boolean;
  obtainHint: string;
  cosmeticId?: string;
  achievementId?: string;
  slot?: CosmeticSlot;
};

const FOUNDER_IDS = new Set(["founding_student", "beta_tester", "talent_pioneer"]);

const LOCATION_LOOT_IDS = new Set([
  "hat:ram",
  "hat:ramhorn",
  "hat:graduation",
  "glasses:reading",
  "backpack:books",
]);

const SEASONAL_ACHIEVEMENT_IDS = new Set(["founding_student", "beta_tester", "talent_pioneer", "campus_legend"]);

export function mapLootRarityToCodex(rarity: LootRarity): CodexRarity {
  switch (rarity) {
    case "common":
      return "common";
    case "uncommon":
      return "rare";
    case "rare":
      return "epic";
    case "legendary":
      return "legendary";
  }
}

function slotCategory(slot: CosmeticSlot): string {
  if (slot === "hat") return "Headgear";
  if (slot === "glasses") return "Eyewear";
  return "Relics";
}

function cosmeticObtainHint(item: CosmeticItem, source: CodexSource): string {
  if (LOCATION_LOOT_IDS.has(item.id)) {
    return "Scan campus landmarks and QR codes across URI.";
  }
  if (item.requiresAchievement) {
    return `Complete the quest: ${item.requiresAchievement}.`;
  }
  if (item.requiresLevel) {
    return `Reach level ${item.requiresLevel} and keep adventuring.`;
  }
  switch (source) {
    case "boss_battles":
      return "Defeat campus bosses in battle mode.";
    case "guilds":
      return "Earn through guild activity and camaraderie.";
    case "events":
      return "Attend live campus events.";
    case "seasonal":
      return "Available during limited seasonal windows.";
    default:
      return "Explore campus quests and battles.";
  }
}

function cosmeticLore(item: CosmeticItem): string {
  const piece = item.slot === "hat" ? "headgear" : item.slot === "glasses" ? "eyewear" : "relic";
  const affinity = item.themeStat ?? "campus spirit";
  return `Forged for adventurers who channel ${affinity}. This ${piece} carries echoes of every Quad victory and late-night study session.`;
}

function resolveCosmeticSource(item: CosmeticItem): CodexSource {
  if (LOCATION_LOOT_IDS.has(item.id)) return "locations";
  if (item.requiresAchievement) return "quests";
  if (item.themeStat === "social" && (item.slot === "backpack" || item.label.toLowerCase().includes("guild"))) {
    return "guilds";
  }
  if (item.rarity === "legendary") return "boss_battles";
  return "boss_battles";
}

function resolveAchievementSource(def: AchievementDef): CodexSource {
  if (FOUNDER_IDS.has(def.id)) return "seasonal";
  if (SEASONAL_ACHIEVEMENT_IDS.has(def.id)) return "seasonal";
  if (def.id.includes("event") || def.name.toLowerCase().includes("event")) return "events";
  const categoryMap: Record<AchievementCategory, CodexSource> = {
    milestones: "quests",
    challenges: "boss_battles",
    academic: "quests",
    social: "guilds",
    special: "seasonal",
    legendary: "achievements",
  };
  return categoryMap[def.category];
}

function achievementObtainHint(def: AchievementDef, source: CodexSource): string {
  if (def.id === "founding_student") return "Joined CampusQuest during the founding semester.";
  if (def.id === "beta_tester") return "Participated in the CampusQuest beta program.";
  if (def.id === "talent_pioneer") return "Recognized for advancing URI talent development.";
  if (source === "events") return "Attend campus events and check in.";
  if (source === "guilds") return "Grow your guild presence on campus.";
  if (source === "boss_battles") return "Win boss battles and training challenges.";
  return def.description;
}

function lootEntry(item: CosmeticItem): CodexEntry {
  const source = resolveCosmeticSource(item);
  return {
    id: `loot:${item.id}`,
    kind: "loot",
    name: item.label,
    description: `Equippable ${item.slot} with a ${CODEX_RARITY_LABELS[mapLootRarityToCodex(item.rarity)]} aura.`,
    lore: cosmeticLore(item),
    icon: item.icon,
    rarity: mapLootRarityToCodex(item.rarity),
    source,
    categoryLabel: slotCategory(item.slot),
    hiddenUntilFound: item.rarity === "legendary" || item.rarity === "rare",
    obtainHint: cosmeticObtainHint(item, source),
    cosmeticId: item.id,
    slot: item.slot,
  };
}

function achievementEntry(def: AchievementDef): CodexEntry {
  const source = resolveAchievementSource(def);
  return {
    id: `ach:${def.id}`,
    kind: "achievement",
    name: def.name,
    description: def.description,
    lore: `${def.description} A permanent mark on your adventurer record.`,
    icon: def.icon,
    rarity: def.rarity,
    source,
    categoryLabel: CATEGORY_META[def.category].label,
    hiddenUntilFound: def.rarity === "mythic" || (def.rarity === "legendary" && !FOUNDER_IDS.has(def.id)),
    obtainHint: achievementObtainHint(def, source),
    achievementId: def.id,
  };
}

let cachedCatalog: CodexEntry[] | null = null;

export function getCodexCatalog(): CodexEntry[] {
  if (!cachedCatalog) {
    cachedCatalog = [
      ...COSMETICS.map(lootEntry),
      ...ACHIEVEMENT_CATALOG.map(achievementEntry),
    ];
  }
  return cachedCatalog;
}

export function getCodexEntryById(id: string): CodexEntry | undefined {
  return getCodexCatalog().find((e) => e.id === id);
}

export function matchesCodexFilter(entry: CodexEntry, filter: CodexFilter): boolean {
  if (filter === "all") return true;
  if (filter === "event") return entry.source === "events";
  if (filter === "location") return entry.source === "locations";
  if (filter === "quest") return entry.source === "quests" || entry.source === "boss_battles";
  if (filter === "seasonal") return entry.source === "seasonal";
  return entry.rarity === filter;
}
