"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { resetUserCameraInteraction } from "@/lib/realm/mapCameraGuard";
import {
  REALM_FIRST_OPEN_END_ZOOM,
  REALM_FIRST_OPEN_FLY_MS,
  REALM_FIRST_OPEN_START_ZOOM,
  REALM_LOCATE_TIMEOUT_MS,
  flyMapCamera,
  resolveFirstOpenCameraTarget,
} from "@/lib/realm/realmFirstOpen";

/**
 * One-shot first-open camera: try live location, else Memorial Union / Quad,
 * then ease from a zoomed-out frame into the discovery zoom.
 */
export function RealmMapFirstOpenCamera({
  enabled,
  locateOnce,
  onResolved,
}: {
  enabled: boolean;
  locateOnce: (onPosition?: (pos: { lat: number; lng: number }) => void, opts?: { silent?: boolean }) => void;
  /** Fires once with the chosen center so marker reveal can prioritize nearby pins. */
  onResolved?: (center: { lat: number; lng: number }) => void;
}) {
  const map = useMap();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || !map || ranRef.current) return undefined;
    ranRef.current = true;

    const abort = new AbortController();
    let finished = false;
    let userPos: { lat: number; lng: number } | null = null;

    const finish = async () => {
      if (finished || abort.signal.aborted) return;
      finished = true;
      resetUserCameraInteraction();
      const target = resolveFirstOpenCameraTarget(userPos);
      onResolved?.(target);
      await flyMapCamera(map, target, {
        startZoom: REALM_FIRST_OPEN_START_ZOOM,
        endZoom: REALM_FIRST_OPEN_END_ZOOM,
        durationMs: REALM_FIRST_OPEN_FLY_MS,
        signal: abort.signal,
      });
    };

    locateOnce(
      (pos) => {
        userPos = pos;
        void finish();
      },
      { silent: true },
    );

    const timeout = window.setTimeout(() => {
      void finish();
    }, REALM_LOCATE_TIMEOUT_MS);

    return () => {
      abort.abort();
      window.clearTimeout(timeout);
    };
  }, [enabled, locateOnce, map, onResolved]);

  return null;
}
