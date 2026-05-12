type StatBundle = {
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
};

const STREAK_BONUS_STEP = 0.05;
const STREAK_BONUS_CAP = 1.75;

export function calculateLevelProgression(totalXp: number) {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = Math.max(1, Math.floor(Math.sqrt(safeXp / 120)) + 1);
  const levelStartXp = 120 * Math.pow(level - 1, 2);
  const nextLevelXp = 120 * Math.pow(level, 2);

  return {
    level,
    totalXp: safeXp,
    currentLevelXp: safeXp - levelStartXp,
    nextLevelRequiredXp: nextLevelXp - levelStartXp,
    progress: Math.min(1, (safeXp - levelStartXp) / Math.max(1, nextLevelXp - levelStartXp)),
  };
}

export function streakMultiplier(streakDays: number) {
  const base = 1 + Math.max(0, streakDays) * STREAK_BONUS_STEP;
  return Math.min(base, STREAK_BONUS_CAP);
}

export function calculateActivityXp(baseXp: number, streakDays: number, minutes = 0) {
  const minuteBonus = Math.floor(Math.max(0, minutes) / 10) * 3;
  const boosted = Math.round((baseXp + minuteBonus) * streakMultiplier(streakDays));
  return Math.max(1, boosted);
}

export function updateStreak(lastActivityDate: string | null, now = new Date()) {
  const today = toIsoDate(now);
  if (!lastActivityDate) {
    return { streakDays: 1, lastActivityDate: today };
  }

  const currentDay = parseIsoDate(today);
  const lastDay = parseIsoDate(lastActivityDate);
  const deltaDays = Math.floor((currentDay.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));

  if (deltaDays <= 0) {
    return { streakDays: null, lastActivityDate: today };
  }

  if (deltaDays === 1) {
    return { streakDays: "increment" as const, lastActivityDate: today };
  }

  return { streakDays: 1, lastActivityDate: today };
}

export function calculateBossDamage(args: {
  level: number;
  stats: StatBundle;
  activityStat?: keyof StatBundle;
}) {
  const { level, stats, activityStat } = args;
  const averageStat = (stats.strength + stats.stamina + stats.knowledge + stats.social + stats.focus) / 5;
  const activityBonus = activityStat ? Math.floor((stats[activityStat] ?? 0) / 15) : 0;
  const crit = Math.random() < 0.12 ? 1.75 : 1;
  const randomVariance = 0.92 + Math.random() * 0.2;
  const rawDamage = (6 + level * 1.8 + averageStat / 18 + activityBonus) * crit * randomVariance;
  return {
    damage: Math.max(1, Math.floor(rawDamage)),
    wasCritical: crit > 1,
  };
}

export type LootRoll = { itemRarity: "common" | "uncommon" | "rare" | "epic" | "legendary"; dropped: boolean };

export function rollLootDrop(): LootRoll {
  const roll = Math.random();
  if (roll > 0.55) return { dropped: false, itemRarity: "common" };
  if (roll > 0.25) return { dropped: true, itemRarity: "common" };
  if (roll > 0.1) return { dropped: true, itemRarity: "uncommon" };
  if (roll > 0.03) return { dropped: true, itemRarity: "rare" };
  if (roll > 0.008) return { dropped: true, itemRarity: "epic" };
  return { dropped: true, itemRarity: "legendary" };
}

function toIsoDate(input: Date) {
  return input.toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

