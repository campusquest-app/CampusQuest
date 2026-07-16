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
 * 2. Publishing matching CSS vars for absolute overlays (aura, footer, edit FAB)
 * 3. Recomputing on resize, orientation change, visualViewport, and dock layout
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
    const settleTimer3 = window.setTimeout(apply, 1200);

    const observers: ResizeObserver[] = [];
    const mapDiv = map.getDiv();
    if (typeof ResizeObserver !== "undefined") {
      if (mapDiv) {
        const mapRo = new ResizeObserver(() => apply());
        mapRo.observe(mapDiv);
        observers.push(mapRo);
      }
      const dock = document.querySelector(".cq-dock-nav");
      if (dock instanceof HTMLElement) {
        const dockRo = new ResizeObserver(() => apply());
        dockRo.observe(dock);
        observers.push(dockRo);
      }
    }

    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(settleTimer2);
      window.clearTimeout(settleTimer3);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      for (const observer of observers) observer.disconnect();
      lastPaddingRef.current = null;
      clearMapChromePaddingCssVars();
    };
  }, [map, enabled]);

  return null;
}
