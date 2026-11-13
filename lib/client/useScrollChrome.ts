"use client";

import { useEffect } from "react";
import { isCreatePostModalOpen } from "@/lib/client/modalViewportCleanup";
import {
  readScrollY,
  resolveBottomNavScrollRoot,
} from "@/lib/client/bottomNavAutoHide";

export { QUAD_SCROLL_ROOT_SELECTOR } from "@/lib/client/bottomNavAutoHide";

const TOP_REVEAL_Y = 40;
/** Ignore micro jitter (touch noise, momentum tail). */
const SCROLL_DELTA_MIN = 1.5;
/** Pixels of scroll to fully conceal the bottom nav (Instagram-style linked offset). */
const BOTTOM_CONCEAL_MAX = 72;
const SCROLL_IDLE_MS = 150;

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

export type ScrollChromeOptions = {
  enabled: boolean;
  /** Hide Quad top nav + sub-header on scroll down (Quad tab only). */
  topChrome?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let lastAppliedHideProgress = -1;
let lastAppliedHiddenState: boolean | null = null;

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
 * (including iOS overscroll / negative scrollY) it is pinned fully visible and
 * never translates below that clamp; micro jitter is ignored so it holds still.
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

  // Pin fully visible at/above the top — never allow a negative hide offset
  // (which would translate the header downward into a blank strip).
  if (args.scrollY <= revealAboveY) return 0;
  if (Math.abs(args.delta) < deltaMin) return clamp(args.prevOffsetPx, 0, range);
  return clamp(args.prevOffsetPx + args.delta, 0, range);
}

/**
 * Quad header scroll chrome:
 * - Scroll down → the Quad header translates up + fades out over ~140px.
 * - Scroll up → the header smoothly returns.
 * - Bottom nav hide/reveal is owned by AppBottomNav (Social only).
 */
export function useScrollChrome({ enabled, topChrome = false }: ScrollChromeOptions): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      resetScrollChrome();
      return undefined;
    }

    let lastScrollY = readScrollY(resolveBottomNavScrollRoot());
    let headerHideOffset = 0;
    let rafId: number | null = null;
    let scrollIdleTimer: number | null = null;

    const settleHeaderOnIdle = (): void => {
      if (!topChrome) return;
      const progress = headerHideOffset / HEADER_HIDE_RANGE;
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
      // Resolve on each frame so an element scroll root mounted by TheQuad is
      // picked up even if this effect started while only the document marker existed.
      const activeRoot = resolveBottomNavScrollRoot();
      const currentY = Math.max(0, readScrollY(activeRoot));
      const delta = currentY - lastScrollY;

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

    headerHideOffset = 0;
    if (topChrome) {
      document.documentElement.setAttribute("data-cq-quad-chrome", "visible");
      applyHeaderHideOffset(0, HEADER_HIDE_RANGE);
    }
    lastScrollY = Math.max(0, readScrollY(resolveBottomNavScrollRoot()));

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
