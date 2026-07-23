/**
 * Show XP progress bar preference.
 *
 * Authenticated users: `profiles.show_xp_progress_bar` (Supabase) is source of truth.
 * Guests / offline local characters: localStorage only (see GUEST_LS_KEY).
 *
 * Never store an authenticated user's preference in a shared device key — that would
 * leak User A's choice to User B after sign-out.
 */

export const XP_PROGRESS_BAR_GUEST_LS_KEY = "campusquest_show_xp_progress_bar_guest";

export type XpProgressBarPreferenceState = {
  /** False until profile (or guest LS) has been resolved — bar must stay hidden. */
  loaded: boolean;
  enabled: boolean;
};

export const XP_PROGRESS_BAR_PREF_INITIAL: XpProgressBarPreferenceState = {
  loaded: false,
  enabled: false,
};

export function shouldRenderXpProgressBar(pref: XpProgressBarPreferenceState): boolean {
  return pref.loaded === true && pref.enabled === true;
}

export function readGuestShowXpProgressBar(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(XP_PROGRESS_BAR_GUEST_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGuestShowXpProgressBar(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(XP_PROGRESS_BAR_GUEST_LS_KEY, "1");
    else window.localStorage.removeItem(XP_PROGRESS_BAR_GUEST_LS_KEY);
  } catch {
    // Ignore storage failures (private mode / quota).
  }
}

/** Clear guest fallback so a later guest session does not inherit stale state. */
export function clearGuestShowXpProgressBar(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(XP_PROGRESS_BAR_GUEST_LS_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function parseShowXpProgressBarFromProfile(value: unknown): boolean {
  return value === true;
}
