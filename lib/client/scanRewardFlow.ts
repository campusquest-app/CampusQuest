/** CQ Scanner → XP reward cinematic timings (ms). */
export const SCAN_VALIDATED_MS = 400;
export const SCAN_TRANSITION_TO_XP_MS = 600;
/** Scanner hands off to XP overlay (overlay handles enter + pre-fill hold). */
export const SCAN_XP_HANDOFF_MS = 200;

/** XP overlay timings — re-exported from xpRewardAnimation for scanner handoff alignment. */
export {
  XP_HIGHLIGHT_BLEND_MS,
  XP_HIGHLIGHT_HOLD_MS,
  XP_OVERLAY_ENTER_MS as XP_SCREEN_ENTER_MS,
  XP_OVERLAY_POST_VISIBLE_MS as XP_PRE_FILL_HOLD_MS,
  XP_OVERLAY_READY_HOLD_MS,
  xpOverlayFillDurationMs as xpFillDurationMs,
  xpOverlayFillStartDelayMs as xpFillStartDelayMs,
} from "@/lib/client/xpRewardAnimation";

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

