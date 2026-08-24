/**
 * Display-name onboarding gate (post-signup, pre-demographics).
 * Username remains signup-owned; this step never collects or patches username.
 */

export type DisplayNameProfileSnapshot = {
  display_name?: string | null;
  display_name_changed_at?: string | null;
  onboarding_completed?: boolean | null;
  onboarding_character_completed?: boolean | null;
};

const NAME_MAX = 40;

export function normalizeDisplayNameInput(value: string): string {
  return value.trim().slice(0, NAME_MAX);
}

export function isDisplayNameValid(value: string): boolean {
  const name = normalizeDisplayNameInput(value);
  return name.length >= 1 && name.length <= NAME_MAX;
}

/**
 * Required for new/incomplete accounts that have never explicitly saved a
 * display name via profile PATCH (`display_name_changed_at` is set on change).
 * Completed / grandfathered character users are never forced back here.
 */
export function isDisplayNameSetupRequired(profile: DisplayNameProfileSnapshot): boolean {
  const setupDone =
    profile.onboarding_character_completed === true || profile.onboarding_completed === true;
  if (setupDone) return false;
  const changedAt =
    typeof profile.display_name_changed_at === "string" ? profile.display_name_changed_at.trim() : "";
  if (changedAt.length > 0) return false;
  return true;
}
