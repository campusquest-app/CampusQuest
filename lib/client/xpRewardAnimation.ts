/** XP reward overlay animation phases. */
export type XpRewardPhase =
  | "overlayEntering"
  | "overlayReady"
  | "animatingXP"
  | "highlightSettling"
  | "complete";

export const XP_OVERLAY_ENTER_MS = 700;
export const XP_OVERLAY_READY_HOLD_MS = 700;
/** Silent pause after XP overlay is fully visible, before fill + forge audio (QR cinematic). */
export const XP_OVERLAY_POST_VISIBLE_MS = 700;
export const XP_FILL_MS_MOBILE = 3500;
export const XP_FILL_MS_DESKTOP = 2200;
export const XP_HIGHLIGHT_HOLD_MS = 800;
export const XP_HIGHLIGHT_BLEND_MS = 1000;
/** After cyan settles to dark blue — admire completed progress before banner. */
export const XP_COMPLETED_HOLD_MS = 1000;

export function xpOverlayFillDurationMs(isMobile: boolean): number {
  return isMobile ? XP_FILL_MS_MOBILE : XP_FILL_MS_DESKTOP;
}

export function xpOverlayFillStartDelayMs(afterQrScan = false): number {
  return (
    XP_OVERLAY_ENTER_MS +
    (afterQrScan ? XP_OVERLAY_POST_VISIBLE_MS : XP_OVERLAY_READY_HOLD_MS)
  );
}

export function estimateXpOverlayDurationMs(args: {
  isMobile: boolean;
  segmentCount: number;
  reduced?: boolean;
  afterQrScan?: boolean;
}): number {
  if (args.reduced) return 1200;
  const gap = args.segmentCount > 1 ? (args.segmentCount - 1) * 280 : 0;
  const fill = xpOverlayFillDurationMs(args.isMobile);
  return (
    xpOverlayFillStartDelayMs(Boolean(args.afterQrScan)) +
    gap +
    args.segmentCount * (fill + XP_HIGHLIGHT_HOLD_MS + XP_HIGHLIGHT_BLEND_MS + 160) +
    XP_COMPLETED_HOLD_MS
  );
}

export function readMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
