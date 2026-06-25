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

/** The single fixed header unit (top nav + Quad tabs) translated as one piece. */
const QUAD_HEADER_SHELL_SELECTOR = "[data-cq-quad-header-shell]";

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

function readHeaderHeight(): number {
  if (typeof document === "undefined") return 0;
  const el = document.querySelector(QUAD_HEADER_SHELL_SELECTOR) as HTMLElement | null;
  return el ? el.getBoundingClientRect().height : 0;
}

let lastAppliedBottomProgress = -1;
let lastAppliedBottomState: "expanded" | "concealing" | "minimized" | null = null;
let lastAppliedTopOffset = -1;

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

function applyTopOffset(offsetPx: number): void {
  const rounded = Math.round(offsetPx);
  if (rounded === lastAppliedTopOffset) return;
  lastAppliedTopOffset = rounded;
  document.documentElement.style.setProperty("--cq-quad-chrome-offset", `${rounded}px`);
}

function resetScrollChrome(): void {
  document.documentElement.removeAttribute("data-cq-quad-chrome");
  document.documentElement.removeAttribute("data-cq-bottom-chrome");
  document.documentElement.removeAttribute("data-cq-scrolling");
  document.documentElement.style.removeProperty("--cq-quad-chrome-offset");
  document.documentElement.style.removeProperty("--cq-bottom-chrome-conceal");
  document.documentElement.style.removeProperty("--cq-dock-scale");
  document.documentElement.style.removeProperty("--cq-dock-opacity");
  document.documentElement.style.removeProperty("--cq-dock-bottom-offset");
  lastAppliedBottomProgress = -1;
  lastAppliedBottomState = null;
  lastAppliedTopOffset = -1;
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
 * Scroll-linked header offset. The whole header unit (CQ nav + Quad tabs)
 * translates up 1:1 with downward scroll and returns 1:1 on upward scroll,
 * clamped between fully visible (0) and fully hidden (maxOffset). At the very
 * top of the feed the header is always fully revealed.
 */
export function computeTopOffset(args: {
  prevOffset: number;
  delta: number;
  scrollY: number;
  maxOffset: number;
}): number {
  if (args.scrollY <= 0) return 0;
  return clamp(args.prevOffset + args.delta, 0, args.maxOffset);
}

/**
 * Feed scroll chrome (Instagram-style):
 * - Scroll down → bottom nav conceals progressively; the top header unit slides
 *   up 1:1 with the scroll. Both hold position when scrolling stops.
 * - Scroll up → bottom nav reveals and the header slides back down 1:1.
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
    let topOffset = 0;
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
        topOffset = computeTopOffset({
          prevOffset: topOffset,
          delta,
          scrollY: currentY,
          maxOffset: readHeaderHeight(),
        });
        applyTopOffset(topOffset);
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
    topOffset = 0;
    if (topChrome) {
      document.documentElement.setAttribute("data-cq-quad-chrome", "visible");
      applyTopOffset(0);
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
