"use client";

import { useEffect, useRef, useState } from "react";
import { REALM_MAP_REFERENCE_SRC } from "@/lib/realm/mapGeometry";

export type RealmCampusMapLayerProps = {
  calibrateMode: boolean;
  onLoadStateChange?: (loaded: boolean) => void;
};

/** Layer 1 — URI Kingston campus map (primary visual). */
export function RealmCampusMapLayer({ calibrateMode, onLoadStateChange }: RealmCampusMapLayerProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

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
        src={REALM_MAP_REFERENCE_SRC}
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
          setLoaded(false);
          setFailed(true);
          onLoadStateChange?.(false);
        }}
      />
      {failed ? (
        <p className="absolute inset-x-0 top-1/2 z-[1] -translate-y-1/2 px-4 text-center text-xs text-amber-200/90">
          Campus map failed to load ({REALM_MAP_REFERENCE_SRC})
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
