"use client";

import { useEffect } from "react";

const SCROLL_DOWN_HIDE_THRESHOLD = 24;
const SCROLL_UP_SHOW_THRESHOLD = 10;
const SCROLL_STOP_SHOW_MS = 1200;
const TOP_REVEAL_Y = 10;

/** Quad sub-nav hides on scroll down; top nav stays fixed. Bottom nav hides on scroll down, returns on up/stop. */
export function useScrollChrome(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      document.documentElement.removeAttribute("data-cq-quad-chrome");
      document.documentElement.removeAttribute("data-cq-bottom-chrome");
      document.documentElement.style.removeProperty("--cq-quad-header-offset");
      return undefined;
    }

    let lastScrollY = window.scrollY;
    let downDistance = 0;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;

    const setQuadChrome = (hidden: boolean): void => {
      document.documentElement.setAttribute("data-cq-quad-chrome", hidden ? "hidden" : "visible");
      if (hidden) {
        document.documentElement.style.setProperty("--cq-quad-header-offset", "0px");
      } else {
        document.documentElement.style.removeProperty("--cq-quad-header-offset");
      }
    };

    const setBottomChrome = (hidden: boolean): void => {
      document.documentElement.setAttribute("data-cq-bottom-chrome", hidden ? "hidden" : "visible");
    };

    const showAllChrome = (): void => {
      downDistance = 0;
      setQuadChrome(false);
      setBottomChrome(false);
    };

    const hideScrollChrome = (): void => {
      setQuadChrome(true);
      setBottomChrome(true);
    };

    const scheduleShowOnScrollStop = (): void => {
      if (stopTimer != null) clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        showAllChrome();
        stopTimer = null;
      }, SCROLL_STOP_SHOW_MS);
    };

    const onScroll = (): void => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY;

      if (currentScrollY <= TOP_REVEAL_Y) {
        showAllChrome();
        lastScrollY = currentScrollY;
        scheduleShowOnScrollStop();
        return;
      }

      if (delta > 0) {
        downDistance += delta;
        if (downDistance >= SCROLL_DOWN_HIDE_THRESHOLD) {
          hideScrollChrome();
        }
      } else if (delta < -SCROLL_UP_SHOW_THRESHOLD) {
        showAllChrome();
      }

      lastScrollY = currentScrollY;
      scheduleShowOnScrollStop();
    };

    showAllChrome();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (stopTimer != null) clearTimeout(stopTimer);
      document.documentElement.removeAttribute("data-cq-quad-chrome");
      document.documentElement.removeAttribute("data-cq-bottom-chrome");
      document.documentElement.style.removeProperty("--cq-quad-header-offset");
    };
  }, [enabled]);
}
