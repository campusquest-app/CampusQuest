"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { campusHomeCameraTarget, returnToCampusHome } from "@/lib/realm/campusHomeCamera";
import { moveMapCamera } from "@/lib/realm/googleMapPose";
import { resetUserCameraInteraction } from "@/lib/realm/mapCameraGuard";
import { resolveFirstOpenCameraTarget } from "@/lib/realm/realmFirstOpen";
import { loadSessionMapCamera } from "@/lib/realm/sessionMapCamera";

/**
 * One-shot open: restore the session camera when present, otherwise land on the
 * URI Kingston cinematic home (zoomed, tilted ~60°) with a subtle ease-in.
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

    const session = loadSessionMapCamera();
    if (session) {
      onResolved?.({ lat: session.lat, lng: session.lng });
      moveMapCamera(map, {
        center: { lat: session.lat, lng: session.lng },
        zoom: session.zoom,
        heading: session.heading,
        tilt: session.tilt,
      });
      return;
    }

    const target = resolveFirstOpenCameraTarget(null);
    onResolved?.(target);

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      returnToCampusHome(map);
      return;
    }

    // Subtle open: start slightly flatter/zoomed-out, then settle into cinematic home.
    const home = campusHomeCameraTarget();
    moveMapCamera(map, {
      center: home.center,
      zoom: Math.max(16.6, home.zoom - 1.2),
      heading: home.heading,
      tilt: Math.max(35, home.tilt - 20),
    });
    const settle = window.setTimeout(() => {
      returnToCampusHome(map);
    }, 80);
    return () => window.clearTimeout(settle);
  }, [enabled, map, onResolved]);

  return null;
}
