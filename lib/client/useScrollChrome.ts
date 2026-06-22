"use client";

import { useEffect } from "react";

const TOP_REVEAL_Y = 40;
/** Scroll down at least this many px before hiding chrome. */
const SCROLL_DOWN_DELTA = 12;
/** Scroll up at least this many px before revealing chrome. */
const SCROLL_UP_DELTA = 4;
/** Ignore micro jitter (touch noise, momentum tail). */
const SCROLL_DELTA_MIN = 1.5;
/** Pixels of scroll to fully conceal the bottom nav (Instagram-style linked offset). */
const BOTTOM_CONCEAL_MAX = 72;

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

function scrollRootFromEvent(event: Event): ScrollRoot {
  const target = event.target;
  if (target === document || target === document.documentElement) {
    return window;
  }
  if (target instanceof HTMLElement) {
    return target;
  }
  return window;
}

function isTrackedScrollRoot(root: ScrollRoot): boolean {
  if (root === window) return true;
  if (!(root instanceof HTMLElement)) return false;
  if (root.matches(SCROLL_ROOT_SELECTOR) || root.matches(QUAD_SCROLL_ROOT_SELECTOR)) {
    return true;
  }
  return root.closest(SCROLL_ROOT_SELECTOR) === root || root.closest(QUAD_SCROLL_ROOT_SELECTOR) === root;
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

function applyBottomConceal(concealPx: number): void {
  const progress = clamp(concealPx / BOTTOM_CONCEAL_MAX, 0, 1);
  document.documentElement.style.setProperty("--cq-bottom-chrome-conceal", String(progress));

  if (progress <= 0.01) {
    document.documentElement.setAttribute("data-cq-bottom-chrome", "expanded");
  } else if (progress >= 0.92) {
    document.documentElement.setAttribute("data-cq-bottom-chrome", "minimized");
  } else {
    document.documentElement.setAttribute("data-cq-bottom-chrome", "concealing");
  }
}

function resetScrollChrome(): void {
  document.documentElement.removeAttribute("data-cq-quad-chrome");
  document.documentElement.removeAttribute("data-cq-bottom-chrome");
  document.documentElement.style.removeProperty("--cq-quad-header-offset");
  document.documentElement.style.removeProperty("--cq-topnav-offset");
  document.documentElement.style.removeProperty("--cq-bottom-chrome-conceal");
}

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

    let activeRoot: ScrollRoot = window;
    let lastScrollY = readScrollY(activeRoot);
    let bottomConcealPx = 0;
    let topHidden = false;

    const syncChrome = (root: ScrollRoot): void => {
      const currentY = readScrollY(root);
      const delta = currentY - lastScrollY;

      bottomConcealPx = computeBottomConcealPx({
        prevConcealPx: bottomConcealPx,
        delta,
        scrollY: currentY,
      });
      applyBottomConceal(bottomConcealPx);

      if (topChrome) {
        const topChange = computeTopChromeHidden({ scrollY: currentY, delta });
        if (topChange === false) {
          topHidden = false;
          setTopChromeHidden(false);
        } else if (topChange === true) {
          topHidden = true;
          setTopChromeHidden(true);
        }
      }

      lastScrollY = currentY;
    };

    const onScrollCapture = (event: Event): void => {
      const root = scrollRootFromEvent(event);
      if (!isTrackedScrollRoot(root)) return;

      if (root !== activeRoot) {
        activeRoot = root;
        lastScrollY = readScrollY(root);
        return;
      }

      syncChrome(root);
    };

    topHidden = false;
    bottomConcealPx = 0;
    if (topChrome) {
      setTopChromeHidden(false);
    }
    applyBottomConceal(0);
    lastScrollY = readScrollY(activeRoot);

    document.addEventListener("scroll", onScrollCapture, { passive: true, capture: true });

    return () => {
      document.removeEventListener("scroll", onScrollCapture, { capture: true });
      resetScrollChrome();
    };
  }, [enabled, topChrome]);
}
