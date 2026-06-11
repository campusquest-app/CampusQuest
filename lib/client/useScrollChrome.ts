"use client";

import { useEffect } from "react";

const TOP_REVEAL_Y = 40;
const SCROLL_DOWN_HIDE_DELTA = 20;
const SCROLL_UP_SHOW_DELTA = 10;

/** Optional inner scroll container for the Quad feed (falls back to window). */
export const QUAD_SCROLL_ROOT_SELECTOR = "[data-cq-quad-scroll-root]";

type ScrollRoot = Window | HTMLElement;

function resolveQuadScrollRoot(): ScrollRoot {
  if (typeof document === "undefined") return window;
  const marked = document.querySelector<HTMLElement>(QUAD_SCROLL_ROOT_SELECTOR);
  return marked ?? window;
}

function readScrollY(root: ScrollRoot): number {
  if (root === window) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  return root.scrollTop;
}

function attachScrollListener(root: ScrollRoot, handler: () => void): () => void {
  root.addEventListener("scroll", handler, { passive: true });
  return () => root.removeEventListener("scroll", handler);
}

/**
 * Quad feed scroll chrome: Quad sub-nav + bottom nav hide on scroll down; top app nav stays fixed.
 * Both chrome layers reveal only on scroll up or near the top of the feed.
 */
export function useScrollChrome(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      document.documentElement.removeAttribute("data-cq-quad-chrome");
      document.documentElement.removeAttribute("data-cq-bottom-chrome");
      document.documentElement.style.removeProperty("--cq-quad-header-offset");
      return undefined;
    }

    const scrollRoot = resolveQuadScrollRoot();
    let lastScrollY = readScrollY(scrollRoot);
    let feedChromeHidden = false;

    const setFeedChromeHidden = (hidden: boolean): void => {
      feedChromeHidden = hidden;
      document.documentElement.setAttribute("data-cq-quad-chrome", hidden ? "hidden" : "visible");
      document.documentElement.setAttribute("data-cq-bottom-chrome", hidden ? "hidden" : "visible");
      if (hidden) {
        document.documentElement.style.setProperty("--cq-quad-header-offset", "0px");
      } else {
        document.documentElement.style.removeProperty("--cq-quad-header-offset");
      }
    };

    const showFeedChrome = (): void => {
      if (!feedChromeHidden) return;
      setFeedChromeHidden(false);
    };

    const hideFeedChrome = (): void => {
      if (feedChromeHidden) return;
      setFeedChromeHidden(true);
    };

    const onScroll = (): void => {
      const currentY = readScrollY(scrollRoot);

      if (currentY < TOP_REVEAL_Y) {
        showFeedChrome();
      } else if (currentY > lastScrollY + SCROLL_DOWN_HIDE_DELTA) {
        hideFeedChrome();
      } else if (currentY < lastScrollY - SCROLL_UP_SHOW_DELTA) {
        showFeedChrome();
      }

      lastScrollY = currentY;
    };

    setFeedChromeHidden(false);
    lastScrollY = readScrollY(scrollRoot);

    const detach = attachScrollListener(scrollRoot, onScroll);

    return () => {
      detach();
      document.documentElement.removeAttribute("data-cq-quad-chrome");
      document.documentElement.removeAttribute("data-cq-bottom-chrome");
      document.documentElement.style.removeProperty("--cq-quad-header-offset");
    };
  }, [enabled]);
}
