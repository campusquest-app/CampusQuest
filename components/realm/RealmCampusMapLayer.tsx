"use client";

import { useEffect, useRef, useState } from "react";
import { REALM_MAP_FANTASY_SRC, REALM_MAP_REFERENCE_SRC } from "@/lib/realm/mapGeometry";

export type RealmCampusMapLayerProps = {
  calibrateMode: boolean;
  onLoadStateChange?: (loaded: boolean) => void;
};

/**
 * Layer 1 — campus map (primary visual).
 * Default: fantasy parchment skin traced from the URI reference map (same layout/aspect).
 * Calibration mode and fantasy-load failures fall back to the original reference map.
 */
export function RealmCampusMapLayer({ calibrateMode, onLoadStateChange }: RealmCampusMapLayerProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [fantasyFailed, setFantasyFailed] = useState(false);
  const [failed, setFailed] = useState(false);

  const useReference = calibrateMode || fantasyFailed;
  const src = useReference ? REALM_MAP_REFERENCE_SRC : REALM_MAP_FANTASY_SRC;

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true);
      onLoadStateChange?.(true);
    }
  }, [onLoadStateChange]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        className={
          calibrateMode
            ? "realm-campus-map realm-campus-map--calibrate absolute inset-0 z-0 h-full w-full object-contain object-center pointer-events-none"
            : "realm-campus-map absolute inset-0 z-0 h-full w-full object-contain object-center pointer-events-none"
        }
        draggable={false}
        onLoad={() => {
          setLoaded(true);
          setFailed(false);
          onLoadStateChange?.(true);
        }}
        onError={() => {
          if (!useReference) {
            // Fantasy skin missing — fall back to the reference map.
            setFantasyFailed(true);
            return;
          }
          setLoaded(false);
          setFailed(true);
          onLoadStateChange?.(false);
        }}
      />
      {failed ? (
        <p className="absolute inset-x-0 top-1/2 z-[1] -translate-y-1/2 px-4 text-center text-xs text-amber-200/90">
          Campus map failed to load ({src})
        </p>
      ) : null}
      {!loaded && !failed ? (
        <p className="absolute inset-x-0 top-1/2 z-[1] -translate-y-1/2 px-4 text-center text-xs text-white/40">
          Loading campus map…
        </p>
      ) : null}
    </>
  );
}
