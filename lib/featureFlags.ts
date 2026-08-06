/**
 * Central CampusQuest feature flags.
 *
 * Manual Log, Boss Battles, Codex, and Equipment are temporarily hidden from
 * normal users. Restore any feature by setting its flag to `true` — no
 * migrations or structural rebuilds are required. Backend APIs, components,
 * routes, and data remain intact while a flag is `false`.
 */
export const FEATURE_FLAGS = {
  /** Temporarily hidden — set `true` to restore Manual Log UI and deep links. */
  manualLog: false,
  /** Temporarily hidden — set `true` to restore Boss Battles UI and deep links. */
  bossBattles: false,
  /** Temporarily hidden — set `true` to restore Codex UI entry points. */
  codex: false,
  /** Temporarily hidden — set `true` to restore Equipment UI entry points. */
  equipment: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/** Preferred landing tab when a disabled top-level feature route is opened. */
export const FEATURE_FLAG_FALLBACK_TAB = "quest-board" as const;

/**
 * Preferred landing when a disabled Codex/Equipment surface is opened.
 * Lands on Profile → Posts without briefly rendering the hidden UI.
 */
export const FEATURE_FLAG_PROFILE_FALLBACK = {
  tab: "character",
  characterPane: "profile",
  profileTab: "posts",
} as const;

/**
 * Quest is Manual Log–only when its completion method is manual_log and it
 * has no QR / claim / location completion path. Hidden while Manual Log is off
 * so users are not shown uncompletable quests.
 */
export function isManualLogOnlyQuest(item: {
  completionMethod?: string | null;
  requiresQr?: boolean | null;
  canClaim?: boolean | null;
  locationCheckinEnabled?: boolean | null;
}): boolean {
  if (item.completionMethod !== "manual_log") return false;
  if (item.requiresQr) return false;
  if (item.canClaim) return false;
  if (item.locationCheckinEnabled) return false;
  return true;
}

/** User-facing Boss Battle quest cards / templates (not unrelated “battle” copy). */
export function isBossBattleQuest(item: {
  name?: string | null;
  title?: string | null;
  category?: string | null;
  templateId?: string | null;
  icon?: string | null;
}): boolean {
  const name = (item.name ?? item.title ?? "").trim().toLowerCase();
  const templateId = (item.templateId ?? "").trim().toLowerCase();
  if (templateId === "tpl-boss-battle" || templateId.includes("boss-battle")) return true;
  if (name === "boss battle" || name === "boss battles") return true;
  if (name.includes("boss battle")) return true;
  return false;
}

export function filterQuestsForFeatureFlags<
  T extends Parameters<typeof isManualLogOnlyQuest>[0] & Parameters<typeof isBossBattleQuest>[0],
>(
  items: T[],
  flags: { manualLog: boolean; bossBattles: boolean } = FEATURE_FLAGS,
): T[] {
  return items.filter((item) => {
    if (!flags.manualLog && isManualLogOnlyQuest(item)) return false;
    if (!flags.bossBattles && isBossBattleQuest(item)) return false;
    return true;
  });
}
