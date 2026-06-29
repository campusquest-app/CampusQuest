"use client";

import { useEffect } from "react";
import { isCreatePostModalOpen } from "@/lib/client/modalViewportCleanup";

const TOP_REVEAL_Y = 40;
/** Ignore micro jitter (touch noise, momentum tail). */
const SCROLL_DELTA_MIN = 1.5;
/** Pixels of scroll to fully conceal the bottom nav (Instagram-style linked offset). */
const BOTTOM_CONCEAL_MAX = 72;
const SCROLL_IDLE_MS = 150;

/** Optional inner scroll container (falls back to window). */
export const QUAD_SCROLL_ROOT_SELECTOR = "[data-cq-quad-scroll-root]";

/** Mark vertically scrolling feed surfaces (inbox lists, modals, etc.). */
export const SCROLL_ROOT_SELECTOR = "[data-cq-scroll-root]";

/** Always keep the header fully visible within this many px of the very top. */
const HEADER_REVEAL_ABOVE_Y = 8;
/** Scroll distance (px) to travel from fully visible → fully hidden. Longer =
 *  slower, more controlled Instagram-style fade. */
const HEADER_HIDE_RANGE = 140;
/** Progress (0–1) past which the header is "mostly hidden" → pointer-events off. */
const HEADER_HIDDEN_THRESHOLD = 0.6;
/** On scroll stop, snap toward hidden only when this close to fully hidden. */
const HEADER_SNAP_HIDE_AT = 0.6;
/** On scroll stop, snap toward visible only when this close to fully visible. */
const HEADER_SNAP_SHOW_AT = 0.4;

type ScrollRoot = Window | HTMLElement;

export type ScrollChromeOptions = {
  enabled: boolean;
  /** Hide Quad top nav + sub-header on scroll down (Quad tab only). */
  topChrome?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readScrollY(root: ScrollRoot): number {
  if (root instanceof HTMLElement) {
    return root.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

let lastAppliedBottomProgress = -1;
let lastAppliedBottomState: "expanded" | "concealing" | "minimized" | null = null;
let lastAppliedHideProgress = -1;
let lastAppliedHiddenState: boolean | null = null;

function applyBottomConceal(concealPx: number): void {
  const progress = clamp(concealPx / BOTTOM_CONCEAL_MAX, 0, 1);
  const progressRounded = Math.round(progress * 100) / 100;

  let nextState: "expanded" | "concealing" | "minimized";
  if (progressRounded <= 0.01) {
    nextState = "expanded";
  } else if (progressRounded >= 0.92) {
    nextState = "minimized";
  } else {
    nextState = "concealing";
  }

  if (progressRounded === lastAppliedBottomProgress && nextState === lastAppliedBottomState) {
    return;
  }

  lastAppliedBottomProgress = progressRounded;
  lastAppliedBottomState = nextState;
  document.documentElement.style.setProperty("--cq-bottom-chrome-conceal", String(progressRounded));
  document.documentElement.setAttribute("data-cq-bottom-chrome", nextState);

  const dockScale = 1 - progressRounded * 0.14;
  const dockOpacity = 1 - progressRounded * 0.12;
  const dockBottom = 14 - progressRounded * 6;
  document.documentElement.style.setProperty("--cq-dock-scale", String(dockScale));
  document.documentElement.style.setProperty("--cq-dock-opacity", String(dockOpacity));
  document.documentElement.style.setProperty("--cq-dock-bottom-offset", `${dockBottom}px`);
}

function applyHeaderHideOffset(offsetPx: number, range: number): void {
  const progress = clamp(offsetPx / range, 0, 1);
  const rounded = Math.round(progress * 1000) / 1000;
  if (rounded !== lastAppliedHideProgress) {
    lastAppliedHideProgress = rounded;
    document.documentElement.style.setProperty("--cq-quad-hide-progress", String(rounded));
  }
  const hidden = rounded >= HEADER_HIDDEN_THRESHOLD;
  if (hidden !== lastAppliedHiddenState) {
    lastAppliedHiddenState = hidden;
    document.documentElement.setAttribute("data-cq-quad-hidden", hidden ? "true" : "false");
  }
}

function resetScrollChrome(): void {
  document.documentElement.removeAttribute("data-cq-quad-chrome");
  document.documentElement.removeAttribute("data-cq-quad-hidden");
  document.documentElement.removeAttribute("data-cq-bottom-chrome");
  document.documentElement.removeAttribute("data-cq-scrolling");
  document.documentElement.style.removeProperty("--cq-bottom-chrome-conceal");
  document.documentElement.style.removeProperty("--cq-quad-hide-progress");
  document.documentElement.style.removeProperty("--cq-dock-scale");
  document.documentElement.style.removeProperty("--cq-dock-opacity");
  document.documentElement.style.removeProperty("--cq-dock-bottom-offset");
  lastAppliedBottomProgress = -1;
  lastAppliedBottomState = null;
  lastAppliedHideProgress = -1;
  lastAppliedHiddenState = null;
}

export { resetScrollChrome };

/** Pure scroll-linked conceal math (Instagram-style; no idle restore). */
export function computeBottomConcealPx(args: {
  prevConcealPx: number;
  delta: number;
  scrollY: number;
  topRevealY?: number;
  maxConceal?: number;
  deltaMin?: number;
}): number {
  const topRevealY = args.topRevealY ?? TOP_REVEAL_Y;
  const maxConceal = args.maxConceal ?? BOTTOM_CONCEAL_MAX;
  const deltaMin = args.deltaMin ?? SCROLL_DELTA_MIN;

  if (args.scrollY < topRevealY) return 0;
  if (Math.abs(args.delta) < deltaMin) return args.prevConcealPx;

  return clamp(args.prevConcealPx + args.delta, 0, maxConceal);
}

/**
 * Progressive scroll-linked hide offset for the Quad header (Instagram-style).
 * The whole header unit (CQ nav + XP row + Quad tabs) translates up + fades out
 * gradually in proportion to how far the user has scrolled down, accumulating
 * over `range` px (≈140) so it never disappears after a tiny scroll. Scrolling
 * up unwinds the same offset so the header smoothly returns. Near the very top
 * it is pinned fully visible; micro jitter is ignored so it holds still.
 *
 * Returns the current hide offset in px, clamped to [0, range]. progress =
 * offset / range drives translateY (-progress × 100%) and opacity (1 − progress).
 */
export function computeHeaderHideOffset(args: {
  prevOffsetPx: number;
  delta: number;
  scrollY: number;
  range?: number;
  revealAboveY?: number;
  deltaMin?: number;
}): number {
  const range = args.range ?? HEADER_HIDE_RANGE;
  const revealAboveY = args.revealAboveY ?? HEADER_REVEAL_ABOVE_Y;
  const deltaMin = args.deltaMin ?? SCROLL_DELTA_MIN;

  if (args.scrollY <= revealAboveY) return 0;
  if (Math.abs(args.delta) < deltaMin) return clamp(args.prevOffsetPx, 0, range);
  return clamp(args.prevOffsetPx + args.delta, 0, range);
}

/**
 * Feed scroll chrome (Instagram-style):
 * - Scroll down → bottom nav conceals progressively; the Quad header translates
 *   up + fades out gradually over ~140px. Both track scroll 1:1.
 * - Scroll up → bottom nav reveals and the header smoothly returns.
 * - On scroll stop, the header gently snaps to fully hidden/visible only when it
 *   is already near one of those ends (no snapping from the middle).
 */
export function useScrollChrome({ enabled, topChrome = false }: ScrollChromeOptions): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      resetScrollChrome();
      return undefined;
    }

    const activeRoot: ScrollRoot = window;
    let lastScrollY = readScrollY(activeRoot);
    let bottomConcealPx = 0;
    let headerHideOffset = 0;
    let rafId: number | null = null;
    let scrollIdleTimer: number | null = null;

    const settleHeaderOnIdle = (): void => {
      if (!topChrome) return;
      const progress = headerHideOffset / HEADER_HIDE_RANGE;
      // Only snap when already near an end — never from the middle.
      if (progress >= HEADER_SNAP_HIDE_AT && progress < 1) {
        headerHideOffset = HEADER_HIDE_RANGE;
        applyHeaderHideOffset(headerHideOffset, HEADER_HIDE_RANGE);
      } else if (progress > 0 && progress <= HEADER_SNAP_SHOW_AT) {
        headerHideOffset = 0;
        applyHeaderHideOffset(headerHideOffset, HEADER_HIDE_RANGE);
      }
    };

    const markScrolling = (): void => {
      document.documentElement.setAttribute("data-cq-scrolling", "true");
      if (scrollIdleTimer != null) {
        window.clearTimeout(scrollIdleTimer);
      }
      scrollIdleTimer = window.setTimeout(() => {
        document.documentElement.removeAttribute("data-cq-scrolling");
        scrollIdleTimer = null;
        settleHeaderOnIdle();
      }, SCROLL_IDLE_MS);
    };

    const syncChrome = (): void => {
      const currentY = readScrollY(activeRoot);
      const delta = currentY - lastScrollY;

      bottomConcealPx = computeBottomConcealPx({
        prevConcealPx: bottomConcealPx,
        delta,
        scrollY: currentY,
      });
      applyBottomConceal(bottomConcealPx);

      if (topChrome) {
        headerHideOffset = computeHeaderHideOffset({
          prevOffsetPx: headerHideOffset,
          delta,
          scrollY: currentY,
        });
        applyHeaderHideOffset(headerHideOffset, HEADER_HIDE_RANGE);
      }

      lastScrollY = currentY;
      markScrolling();
    };

    const onScrollCapture = (): void => {
      if (isCreatePostModalOpen()) return;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        syncChrome();
      });
    };

    bottomConcealPx = 0;
    headerHideOffset = 0;
    if (topChrome) {
      document.documentElement.setAttribute("data-cq-quad-chrome", "visible");
      applyHeaderHideOffset(0, HEADER_HIDE_RANGE);
    }
    applyBottomConceal(0);
    document.documentElement.style.setProperty("--cq-dock-scale", "1");
    document.documentElement.style.setProperty("--cq-dock-opacity", "1");
    document.documentElement.style.setProperty("--cq-dock-bottom-offset", "14px");
    lastScrollY = readScrollY(activeRoot);

    document.addEventListener("scroll", onScrollCapture, { passive: true, capture: true });

    return () => {
      document.removeEventListener("scroll", onScrollCapture, { capture: true });
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (scrollIdleTimer != null) {
        window.clearTimeout(scrollIdleTimer);
      }
      resetScrollChrome();
    };
  }, [enabled, topChrome]);
}
