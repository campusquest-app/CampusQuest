"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { returnToCampusHome } from "@/lib/realm/campusHomeCamera";
import { resetUserCameraInteraction } from "@/lib/realm/mapCameraGuard";
import { resolveFirstOpenCameraTarget } from "@/lib/realm/realmFirstOpen";

/**
 * One-shot open: URI Kingston campus center, default zoom, north-up, flat pitch.
 * GPS is not consulted — My Location remains a separate control.
 */
export function RealmMapFirstOpenCamera({
  enabled,
  onResolved,
}: {
  enabled: boolean;
  /** Fires once with the campus center so marker reveal can prioritize nearby pins. */
  onResolved?: (center: { lat: number; lng: number }) => void;
}) {
  const map = useMap();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || !map || ranRef.current) return;
    ranRef.current = true;
    resetUserCameraInteraction();
    const target = resolveFirstOpenCameraTarget(null);
    onResolved?.(target);
    returnToCampusHome(map);
  }, [enabled, map, onResolved]);

  return null;
}
