"use client";

import { useEffect } from "react";

/**
 * Sync layout CSS variables when the bottom navigation is hidden.
 * Prevents stale `--cq-bottom-nav-h` clearance on immersive screens.
 */
export function useAppChromeLayout(showBottomNav: boolean): void {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;

    if (showBottomNav) {
      root.removeAttribute("data-cq-bottom-nav-hidden");
      root.style.removeProperty("--cq-bottom-nav-h");
      root.style.removeProperty("--cq-dock-bottom-offset");
    } else {
      root.setAttribute("data-cq-bottom-nav-hidden", "true");
      root.style.setProperty("--cq-bottom-nav-h", "0px");
      root.style.setProperty("--cq-dock-bottom-offset", "0px");
    }

    return () => {
      root.removeAttribute("data-cq-bottom-nav-hidden");
    };
  }, [showBottomNav]);
}
