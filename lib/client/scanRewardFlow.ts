/** CQ Scanner → XP reward cinematic timings (ms). */
export const SCAN_VALIDATED_MS = 400;
export const SCAN_TRANSITION_TO_XP_MS = 600;
/** Scanner hands off to XP overlay (overlay handles enter + pre-fill hold). */
export const SCAN_XP_HANDOFF_MS = 200;

/** XP overlay: fade/scale in before fill starts. */
export const XP_SCREEN_ENTER_MS = 600;
export const XP_PRE_FILL_HOLD_MS = 400;
export const XP_FILL_MS_DESKTOP = 1800;
export const XP_FILL_MS_MOBILE = 2500;
export const XP_HIGHLIGHT_HOLD_MS = 600;
export const XP_HIGHLIGHT_BLEND_MS = 800;

export type ScanRewardState =
  | "idle"
  | "scanning"
  | "validated"
  | "transitioningToXP"
  | "xpScreenVisible"
  | "animatingXP"
  | "xpAnimationComplete"
  | "showBanner"
  | "complete";

export function isScanRewardFlowActive(state: ScanRewardState): boolean {
  return (
    state !== "idle" &&
    state !== "scanning" &&
    state !== "complete" &&
    state !== "showBanner"
  );
}

export function xpFillStartDelayMs(): number {
  return XP_SCREEN_ENTER_MS + XP_PRE_FILL_HOLD_MS;
}

export function xpFillDurationMs(isMobile: boolean): number {
  return isMobile ? XP_FILL_MS_MOBILE : XP_FILL_MS_DESKTOP;
}
