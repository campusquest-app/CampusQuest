"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keeps DM composer above the on-screen keyboard on iOS Safari / mobile browsers.
 * Sets `--cq-dm-keyboard-offset` on the thread root (pixels).
 */
export function useDmKeyboardInsets(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return undefined;

    const vv = window.visualViewport;

    const sync = (): void => {
      if (!vv) {
        root.style.setProperty("--cq-dm-keyboard-offset", "0px");
        return;
      }
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--cq-dm-keyboard-offset", `${Math.round(offset)}px`);
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      root.style.removeProperty("--cq-dm-keyboard-offset");
    };
  }, [rootRef]);
}
