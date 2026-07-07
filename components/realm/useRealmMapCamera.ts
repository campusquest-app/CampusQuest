"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import {
  URI_MAP_BUILDING_ZOOM,
  URI_MAP_CINEMATIC_TILT,
  URI_MAP_FALLBACK_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  applyCinematicCampusCamera,
  isVectorMapRendering,
  readMapTiltAfterDelay,
  resetFlatMapOrientation,
  resetMapHeading,
  resetRealmMapCamera,
  rotateMapHeading,
  trySetMapTilt,
} from "@/lib/realm/googleMapPose";

const TILT_ACTIVE_THRESHOLD = 2;
const HEADING_VISIBLE_THRESHOLD = 1;

export function useRealmMapCamera({
  mapLayer,
  vector3dEnabled,
  onNotice,
  onShowFallbackBuildingsChange,
}: {
  mapLayer: "campus" | "satellite";
  vector3dEnabled: boolean;
  onNotice?: (message: string) => void;
  onShowFallbackBuildingsChange?: (show: boolean) => void;
}) {
  const map = useMap();
  const [tilt, setTilt] = useState(0);
  const [heading, setHeading] = useState(0);
  const [buildingsMode, setBuildingsMode] = useState(false);
  const [native3dAvailable, setNative3dAvailable] = useState(false);
  const probingRef = useRef(false);

  useEffect(() => {
    if (!map) return undefined;

    const sync = () => {
      setTilt(map.getTilt() ?? 0);
      setHeading(map.getHeading() ?? 0);
      setNative3dAvailable(isVectorMapRendering(map));
    };

    sync();
    const tiltListener = map.addListener("tilt_changed", sync);
    const headingListener = map.addListener("heading_changed", sync);
    const idleListener = map.addListener("idle", sync);

    return () => {
      google.maps.event.removeListener(tiltListener);
      google.maps.event.removeListener(headingListener);
      google.maps.event.removeListener(idleListener);
    };
  }, [map]);

  useEffect(() => {
    const showFallback = buildingsMode && (!native3dAvailable || tilt < TILT_ACTIVE_THRESHOLD);
    onShowFallbackBuildingsChange?.(showFallback);
  }, [buildingsMode, native3dAvailable, onShowFallbackBuildingsChange, tilt]);

  useEffect(() => {
    if (mapLayer === "satellite") {
      setBuildingsMode(false);
    }
  }, [mapLayer]);

  const campus3dCapable = vector3dEnabled && mapLayer === "campus";

  const applyFlatCamera = useCallback(() => {
    if (!map) return;
    trySetMapTilt(map, 0);
  }, [map]);

  const toggleTilt = useCallback(async () => {
    if (!map) return;
    if (!campus3dCapable) {
      onNotice?.("3D view is not available on this device yet.");
      return;
    }

    const current = map.getTilt() ?? 0;
    const goingCinematic = current < TILT_ACTIVE_THRESHOLD;

    if (goingCinematic) {
      applyCinematicCampusCamera(map, { preserveCenter: true, preserveHeading: true });
      const actual = await readMapTiltAfterDelay(map);
      if (actual < TILT_ACTIVE_THRESHOLD) {
        onNotice?.("3D view is not available on this device yet.");
        applyFlatCamera();
      }
    } else {
      applyFlatCamera();
    }
  }, [applyFlatCamera, campus3dCapable, map, onNotice]);

  const toggleBuildings = useCallback(async () => {
    if (!map) return;
    if (mapLayer !== "campus") {
      onNotice?.("3D view is not available on this device yet.");
      return;
    }

    if (buildingsMode) {
      setBuildingsMode(false);
      return;
    }

    if (!vector3dEnabled) {
      if ((map.getZoom() ?? 0) < URI_MAP_BUILDING_ZOOM) {
        map.setZoom(URI_MAP_BUILDING_ZOOM);
      }
      setBuildingsMode(true);
      return;
    }

    if (probingRef.current) return;
    probingRef.current = true;

    try {
      applyCinematicCampusCamera(map, { preserveCenter: true, preserveHeading: true });
      const actual = await readMapTiltAfterDelay(map);
      const vector = isVectorMapRendering(map);
      setNative3dAvailable(vector);

      if (actual >= TILT_ACTIVE_THRESHOLD && vector) {
        setBuildingsMode(true);
        return;
      }

      if (actual < TILT_ACTIVE_THRESHOLD) {
        trySetMapTilt(map, URI_MAP_FALLBACK_TILT);
        const fallbackTilt = await readMapTiltAfterDelay(map);
        if (fallbackTilt >= TILT_ACTIVE_THRESHOLD && vector) {
          setBuildingsMode(true);
          return;
        }
      }

      if ((map.getZoom() ?? 0) < URI_MAP_BUILDING_ZOOM) {
        map.setZoom(URI_MAP_BUILDING_ZOOM);
      }
      setBuildingsMode(true);
      if (!vector || actual < TILT_ACTIVE_THRESHOLD) {
        onNotice?.("Using campus building highlights — native 3D is unavailable here.");
      }
    } finally {
      probingRef.current = false;
    }
  }, [buildingsMode, map, mapLayer, onNotice, vector3dEnabled]);

  const rotateLeft = useCallback(() => {
    if (!map) return;
    rotateMapHeading(map, -URI_MAP_ROTATE_STEP_DEG);
  }, [map]);

  const rotateRight = useCallback(() => {
    if (!map) return;
    rotateMapHeading(map, URI_MAP_ROTATE_STEP_DEG);
  }, [map]);

  const resetHeadingToNorth = useCallback(() => {
    if (!map) return;
    resetMapHeading(map);
  }, [map]);

  const resetCamera = useCallback(() => {
    if (!map) return;
    setBuildingsMode(false);
    resetRealmMapCamera(map, mapLayer, vector3dEnabled);
  }, [map, mapLayer, vector3dEnabled]);

  const isCinematic = tilt >= TILT_ACTIVE_THRESHOLD;
  const showCompass = Math.abs(heading) > HEADING_VISIBLE_THRESHOLD && Math.abs(heading - 360) > HEADING_VISIBLE_THRESHOLD;
  const showFallbackBuildings = buildingsMode && (!native3dAvailable || !isCinematic);

  return {
    tilt,
    heading,
    buildingsMode,
    native3dAvailable,
    showFallbackBuildings,
    isCinematic,
    showCompass,
    campus3dCapable,
    toggleTilt,
    toggleBuildings,
    rotateLeft,
    rotateRight,
    resetHeading: resetHeadingToNorth,
    resetCamera,
    resetFlat: resetFlatMapOrientation,
    cinematicTilt: URI_MAP_CINEMATIC_TILT,
  };
}
