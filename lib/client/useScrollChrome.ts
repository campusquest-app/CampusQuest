"use client";

import { useEffect } from "react";
import { isCreatePostModalOpen } from "@/lib/client/modalViewportCleanup";

const TOP_REVEAL_Y = 40;
/** Scroll down at least this many px before hiding chrome. */
const SCROLL_DOWN_DELTA = 12;
/** Scroll up at least this many px before revealing chrome. */
const SCROLL_UP_DELTA = 4;
/** Ignore micro jitter (touch noise, momentum tail). */
const SCROLL_DELTA_MIN = 1.5;
/** Pixels of scroll to fully conceal the bottom nav (Instagram-style linked offset). */
const BOTTOM_CONCEAL_MAX = 72;
const SCROLL_IDLE_MS = 150;

/** Optional inner scroll container (falls back to window). */
export const QUAD_SCROLL_ROOT_SELECTOR = "[data-cq-quad-scroll-root]";

/** Mark vertically scrolling feed surfaces (inbox lists, modals, etc.). */
export const SCROLL_ROOT_SELECTOR = "[data-cq-scroll-root]";

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

function setTopChromeHidden(hidden: boolean): void {
  document.documentElement.setAttribute("data-cq-quad-chrome", hidden ? "hidden" : "visible");
  if (hidden) {
    document.documentElement.style.setProperty("--cq-quad-header-offset", "0px");
    document.documentElement.style.setProperty("--cq-topnav-offset", "0px");
  } else {
    document.documentElement.style.removeProperty("--cq-quad-header-offset");
    document.documentElement.style.removeProperty("--cq-topnav-offset");
  }
}

let lastAppliedBottomProgress = -1;
let lastAppliedBottomState: "expanded" | "concealing" | "minimized" | null = null;
let lastAppliedTopHidden: boolean | null = null;

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

function resetScrollChrome(): void {
  document.documentElement.removeAttribute("data-cq-quad-chrome");
  document.documentElement.removeAttribute("data-cq-bottom-chrome");
  document.documentElement.removeAttribute("data-cq-scrolling");
  document.documentElement.style.removeProperty("--cq-quad-header-offset");
  document.documentElement.style.removeProperty("--cq-topnav-offset");
  document.documentElement.style.removeProperty("--cq-bottom-chrome-conceal");
  document.documentElement.style.removeProperty("--cq-dock-scale");
  document.documentElement.style.removeProperty("--cq-dock-opacity");
  document.documentElement.style.removeProperty("--cq-dock-bottom-offset");
  lastAppliedBottomProgress = -1;
  lastAppliedBottomState = null;
  lastAppliedTopHidden = null;
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

export function computeTopChromeHidden(args: {
  scrollY: number;
  delta: number;
  topRevealY?: number;
}): boolean | null {
  const topRevealY = args.topRevealY ?? TOP_REVEAL_Y;
  if (args.scrollY < topRevealY) return false;
  if (args.delta > SCROLL_DOWN_DELTA) return true;
  if (args.delta < -SCROLL_UP_DELTA) return false;
  return null;
}

/**
 * Feed scroll chrome (Instagram-style):
 * - Scroll down → bottom nav conceals progressively; stays concealed when scrolling stops.
 * - Scroll up → bottom nav reveals proportionally to upward movement.
 * - No timers, no idle restore, no auto-expand on momentum end.
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
    let topHidden = false;
    let rafId: number | null = null;
    let scrollIdleTimer: number | null = null;

    const markScrolling = (): void => {
      document.documentElement.setAttribute("data-cq-scrolling", "true");
      if (scrollIdleTimer != null) {
        window.clearTimeout(scrollIdleTimer);
      }
      scrollIdleTimer = window.setTimeout(() => {
        document.documentElement.removeAttribute("data-cq-scrolling");
        scrollIdleTimer = null;
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
        const topChange = computeTopChromeHidden({ scrollY: currentY, delta });
        if (topChange === false && topHidden !== false) {
          topHidden = false;
          if (lastAppliedTopHidden !== false) {
            lastAppliedTopHidden = false;
            setTopChromeHidden(false);
          }
        } else if (topChange === true && topHidden !== true) {
          topHidden = true;
          if (lastAppliedTopHidden !== true) {
            lastAppliedTopHidden = true;
            setTopChromeHidden(true);
          }
        }
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

    topHidden = false;
    bottomConcealPx = 0;
    if (topChrome) {
      lastAppliedTopHidden = false;
      setTopChromeHidden(false);
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
