"use client";

import { useEffect } from "react";

const TOP_REVEAL_Y = 40;
const SCROLL_DOWN_DELTA = 16;
const SCROLL_UP_DELTA = 4;
/** After scrolling stops, restore full bottom nav (stationary = expanded). */
const BOTTOM_STATIONARY_EXPAND_MS = 160;

/** Optional inner scroll container for the Quad feed (falls back to window). */
export const QUAD_SCROLL_ROOT_SELECTOR = "[data-cq-quad-scroll-root]";

type ScrollRoot = Window | HTMLElement;

function resolveQuadScrollRoot(): ScrollRoot {
  if (typeof document === "undefined") return window;
  const marked = document.querySelector<HTMLElement>(QUAD_SCROLL_ROOT_SELECTOR);
  return marked ?? window;
}

function readScrollY(root: ScrollRoot): number {
  if (root instanceof HTMLElement) {
    return root.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function attachScrollListener(root: ScrollRoot, handler: () => void): () => void {
  root.addEventListener("scroll", handler, { passive: true });
  return () => root.removeEventListener("scroll", handler);
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

function setBottomChromeMinimized(minimized: boolean): void {
  document.documentElement.setAttribute("data-cq-bottom-chrome", minimized ? "minimized" : "expanded");
}

/**
 * Quad feed scroll chrome:
 * - Top nav + Quad sub-header hide on scroll down (full off-screen).
 * - Bottom nav minimizes on scroll down (icons stay, labels fade) — never fully hidden.
 * - Bottom nav expands on scroll up or when scrolling stops (stationary).
 */
export function useScrollChrome(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      document.documentElement.removeAttribute("data-cq-quad-chrome");
      document.documentElement.removeAttribute("data-cq-bottom-chrome");
      document.documentElement.style.removeProperty("--cq-quad-header-offset");
      document.documentElement.style.removeProperty("--cq-topnav-offset");
      return undefined;
    }

    const scrollRoot = resolveQuadScrollRoot();
    let lastScrollY = readScrollY(scrollRoot);
    let topHidden = false;
    let bottomMinimized = false;
    let stationaryTimer: ReturnType<typeof setTimeout> | null = null;

    const expandBottom = (): void => {
      if (!bottomMinimized) return;
      bottomMinimized = false;
      setBottomChromeMinimized(false);
    };

    const minimizeBottom = (): void => {
      if (bottomMinimized) return;
      bottomMinimized = true;
      setBottomChromeMinimized(true);
    };

    const showTop = (): void => {
      if (!topHidden) return;
      topHidden = false;
      setTopChromeHidden(false);
    };

    const hideTop = (): void => {
      if (topHidden) return;
      topHidden = true;
      setTopChromeHidden(true);
    };

    const scheduleStationaryExpand = (): void => {
      if (stationaryTimer) clearTimeout(stationaryTimer);
      stationaryTimer = setTimeout(() => {
        stationaryTimer = null;
        expandBottom();
      }, BOTTOM_STATIONARY_EXPAND_MS);
    };

    const onScroll = (): void => {
      const currentY = readScrollY(scrollRoot);
      const delta = currentY - lastScrollY;

      if (currentY < TOP_REVEAL_Y) {
        showTop();
        expandBottom();
        if (stationaryTimer) {
          clearTimeout(stationaryTimer);
          stationaryTimer = null;
        }
      } else if (delta > SCROLL_DOWN_DELTA) {
        hideTop();
        minimizeBottom();
        scheduleStationaryExpand();
      } else if (delta < -SCROLL_UP_DELTA) {
        showTop();
        expandBottom();
        if (stationaryTimer) {
          clearTimeout(stationaryTimer);
          stationaryTimer = null;
        }
      } else {
        scheduleStationaryExpand();
      }

      lastScrollY = currentY;
    };

    topHidden = false;
    bottomMinimized = false;
    setTopChromeHidden(false);
    setBottomChromeMinimized(false);
    lastScrollY = readScrollY(scrollRoot);

    const detach = attachScrollListener(scrollRoot, onScroll);

    return () => {
      detach();
      if (stationaryTimer) clearTimeout(stationaryTimer);
      document.documentElement.removeAttribute("data-cq-quad-chrome");
      document.documentElement.removeAttribute("data-cq-bottom-chrome");
      document.documentElement.style.removeProperty("--cq-quad-header-offset");
      document.documentElement.style.removeProperty("--cq-topnav-offset");
    };
  }, [enabled]);
}
