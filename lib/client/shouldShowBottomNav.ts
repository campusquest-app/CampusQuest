/**
 * Top-level tabs where the floating dock navigation may appear.
 * Matches Instagram-style primary destinations.
 */
export const BOTTOM_NAV_TOP_LEVEL_TABS = new Set([
  "quad",
  "realm",
  "leaderboards",
  "character",
  "friends",
  "inbox",
]);

export type BottomNavVisibilityContext = {
  tab: string;
  /** Viewing another user's profile (full-screen overlay). */
  friendProfileOpen: boolean;
  /** Settings panel open in the side drawer. */
  settingsDrawerOpen: boolean;
  /** Nested immersive overlays (DM, share sheet, scanner, avatar customization, etc.). */
  immersiveScreenDepth: number;
};

export function shouldShowBottomNav(ctx: BottomNavVisibilityContext): boolean {
  if (ctx.immersiveScreenDepth > 0) return false;
  if (ctx.friendProfileOpen) return false;
  if (ctx.settingsDrawerOpen) return false;
  return BOTTOM_NAV_TOP_LEVEL_TABS.has(ctx.tab);
}
