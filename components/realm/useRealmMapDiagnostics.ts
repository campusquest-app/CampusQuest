"use client";

import { useEffect, useState } from "react";

export type RealmMapLayerReport = {
  uriMapLoaded: boolean;
  uriMapSrc: string;
  uriMapOpacity: string;
  uriMapVisible: boolean;
  calibrateMode: boolean;
  footprintCount: number;
  pathCount: number;
  pinCount: number;
  questGlowCount: number;
  obsoleteLayers: string[];
};

function useRealmDebugMode(isAdmin: boolean): boolean {
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !isAdmin) {
      setDebug(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setDebug(process.env.NODE_ENV === "development" || params.get("realm_debug") === "1");
  }, [isAdmin]);
  return debug;
}

export function useRealmMapDiagnostics({
  uriMapLoaded,
  calibrateMode,
  pinCount,
  questGlowCount,
  mapRootRef,
  isAdmin = false,
}: {
  uriMapLoaded: boolean;
  calibrateMode: boolean;
  pinCount: number;
  questGlowCount: number;
  mapRootRef: React.RefObject<HTMLElement | null>;
  isAdmin?: boolean;
}) {
  const debugMode = useRealmDebugMode(isAdmin);
  const [report, setReport] = useState<RealmMapLayerReport | null>(null);

  useEffect(() => {
    if (!mapRootRef.current) return;

    const root = mapRootRef.current;
    const img = root.querySelector<HTMLImageElement>(".realm-campus-map");
    const obsoleteSelectors = [
      ".realm-map-overlay",
      ".realm-rpg-map",
      ".realm-rpg-mist",
      ".realm-rpg-particles",
      ".realm-landmark-illustration",
      ".realm-landmark-marker",
      ".realm-landmark-timer",
      ".realm-quest-sigil--overlay",
    ];
    const obsoleteLayers = obsoleteSelectors.filter((sel) => root.querySelector(sel));

    const style = img ? getComputedStyle(img) : null;
    const opacity = style?.opacity ?? "unknown";
    const visible =
      !!img &&
      img.naturalWidth > 0 &&
      parseFloat(opacity) > 0 &&
      style?.display !== "none" &&
      style?.visibility !== "hidden";

    const next: RealmMapLayerReport = {
      uriMapLoaded,
      uriMapSrc: img?.currentSrc || img?.src || "/maps/uri-campus-map.png",
      uriMapOpacity: opacity,
      uriMapVisible: visible,
      calibrateMode,
      footprintCount: root.querySelectorAll(".realm-building-footprint").length,
      pathCount: root.querySelectorAll(".realm-map-path").length,
      pinCount: root.querySelectorAll(".realm-pin").length,
      questGlowCount,
      obsoleteLayers,
    };

    const mapRect = root.querySelector(".realm-map-stage")?.getBoundingClientRect();
    const pinsInView = mapRect
      ? Array.from(root.querySelectorAll<HTMLElement>(".realm-pin")).filter((pin) => {
          const r = pin.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.bottom >= mapRect.top &&
            r.top <= mapRect.bottom &&
            r.right >= mapRect.left &&
            r.left <= mapRect.right
          );
        }).length
      : 0;

    setReport(next);

    if (debugMode) {
      console.group("[The Realm] layer diagnostics");
      console.log("1. URI map image loaded:", uriMapLoaded);
      console.log("2. Reference map visible:", visible);
      console.log("3. Applied opacity:", opacity);
      console.log("4. Obsolete landmark illustrations:", obsoleteLayers.includes(".realm-landmark-illustration") ? "YES" : "no");
      console.log("5. Obsolete blueprint/grid layers:", obsoleteLayers.filter((l) => l.includes("rpg") || l.includes("overlay")).join(", ") || "none");
      console.log("6. Building footprints rendering:", next.footprintCount);
      console.log("7. Marker pins rendering:", next.pinCount, `(visible in map bounds: ${pinsInView})`);
      console.log("8. Calibration mode active:", calibrateMode);
      const samplePin = root.querySelector<HTMLElement>(".realm-pin");
      if (samplePin) {
        console.log("Pin computed position:", getComputedStyle(samplePin).position);
        console.log("Pin pointer-events:", getComputedStyle(samplePin).pointerEvents);
      }
      if (obsoleteLayers.length > 0) {
        console.warn("Obsolete DOM nodes still present:", obsoleteLayers);
      }
      console.groupEnd();
    }
  }, [uriMapLoaded, calibrateMode, pinCount, questGlowCount, mapRootRef, debugMode]);

  return { debugMode, report };
}
