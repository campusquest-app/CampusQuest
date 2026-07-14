"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import {
  applyMapChromePaddingCssVars,
  clearMapChromePaddingCssVars,
  computeMapChromePadding,
  measureRealmNavClearancePx,
  measureSafeAreaInsets,
  type MapChromePadding,
} from "@/lib/realm/mapChromePadding";

function paddingsEqual(a: MapChromePadding, b: MapChromePadding): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * Keeps Google Maps logo / copyright attribution clear of CampusQuest UI by:
 * 1. Applying Map.padding so Google chrome and MapControls inset automatically
 * 2. Publishing matching CSS vars for absolute overlays (edit FAB, gradients)
 * 3. Recomputing on resize, orientation change, and visualViewport shifts
 */
export function RealmMapChromePadding({ enabled = true }: { enabled?: boolean }) {
  const map = useMap();
  const lastPaddingRef = useRef<MapChromePadding | null>(null);

  useEffect(() => {
    if (!enabled || !map) return undefined;

    const apply = () => {
      const padding = computeMapChromePadding({
        navClearancePx: measureRealmNavClearancePx(),
        safeArea: measureSafeAreaInsets(),
      });
      if (lastPaddingRef.current && paddingsEqual(lastPaddingRef.current, padding)) return;
      lastPaddingRef.current = padding;
      // Google Maps JS supports MapOptions.padding at runtime; @types/google.maps lag.
      map.setOptions({ padding } as unknown as google.maps.MapOptions);
      applyMapChromePaddingCssVars(padding);
    };

    apply();

    const onResize = () => apply();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onResize);

    // Dock height is measured into --cq-bottom-nav-h after layout; re-check shortly.
    const settleTimer = window.setTimeout(apply, 120);
    const settleTimer2 = window.setTimeout(apply, 480);

    // Observe the map container itself for flex/rotation size changes.
    const div = map.getDiv();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            apply();
          })
        : null;
    if (div) ro?.observe(div);

    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(settleTimer2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      ro?.disconnect();
      lastPaddingRef.current = null;
      clearMapChromePaddingCssVars();
    };
  }, [map, enabled]);

  return null;
}
