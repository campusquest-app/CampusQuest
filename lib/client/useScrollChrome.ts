"use client";

import { useEffect } from "react";

const TOP_REVEAL_Y = 10;
const SCROLL_DOWN_HIDE_DELTA = 8;
const SCROLL_UP_SHOW_DELTA = 6;

/** Optional inner scroll container for the Quad feed (falls back to window). */
export const QUAD_SCROLL_ROOT_SELECTOR = "[data-cq-quad-scroll-root]";

type ScrollRoot = Window | HTMLElement;

function resolveQuadScrollRoot(): ScrollRoot {
  if (typeof document === "undefined") return window;
  const marked = document.querySelector<HTMLElement>(QUAD_SCROLL_ROOT_SELECTOR);
  return marked ?? window;
}

function readScrollY(root: ScrollRoot): number {
  if (root === window) return window.scrollY;
  return root.scrollTop;
}

function attachScrollListener(root: ScrollRoot, handler: () => void): () => void {
  root.addEventListener("scroll", handler, { passive: true });
  return () => root.removeEventListener("scroll", handler);
}

/**
 * Quad sub-nav hides on scroll down and stays hidden until the user scrolls up.
 * Top nav stays fixed. Bottom nav follows the same rules on desktop; stays visible on mobile/coarse pointer.
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
    let quadHidden = false;
    let bottomHidden = false;

    const keepBottomNavVisible =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 639px), (pointer: coarse)").matches;

    const setQuadChrome = (hidden: boolean): void => {
      quadHidden = hidden;
      document.documentElement.setAttribute("data-cq-quad-chrome", hidden ? "hidden" : "visible");
      if (hidden) {
        document.documentElement.style.setProperty("--cq-quad-header-offset", "0px");
      } else {
        document.documentElement.style.removeProperty("--cq-quad-header-offset");
      }
    };

    const setBottomChrome = (hidden: boolean): void => {
      if (keepBottomNavVisible) {
        bottomHidden = false;
        document.documentElement.setAttribute("data-cq-bottom-chrome", "visible");
        return;
      }
      bottomHidden = hidden;
      document.documentElement.setAttribute("data-cq-bottom-chrome", hidden ? "hidden" : "visible");
    };

    const showQuadChrome = (): void => {
      if (!quadHidden) return;
      setQuadChrome(false);
    };

    const hideQuadChrome = (): void => {
      if (quadHidden) return;
      setQuadChrome(true);
    };

    const showBottomChrome = (): void => {
      if (keepBottomNavVisible || !bottomHidden) return;
      setBottomChrome(false);
    };

    const hideBottomChrome = (): void => {
      if (keepBottomNavVisible || bottomHidden) return;
      setBottomChrome(true);
    };

    const onScroll = (): void => {
      const currentY = readScrollY(scrollRoot);

      if (currentY <= TOP_REVEAL_Y) {
        showQuadChrome();
        showBottomChrome();
      } else if (currentY > lastScrollY + SCROLL_DOWN_HIDE_DELTA) {
        hideQuadChrome();
        hideBottomChrome();
      } else if (currentY < lastScrollY - SCROLL_UP_SHOW_DELTA) {
        showQuadChrome();
        showBottomChrome();
      }

      lastScrollY = currentY;
    };

    setQuadChrome(false);
    setBottomChrome(false);
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
