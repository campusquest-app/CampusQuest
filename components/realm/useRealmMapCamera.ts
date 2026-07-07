"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { REALM_GOOGLE_MAP_ID } from "@/lib/realm/googleMapConfig";
import {
  URI_MAP_BUILDING_ZOOM,
  URI_MAP_FALLBACK_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  applyFlatCamera,
  applyTiltCamera,
  isVectorMapRendering,
  logRealmMapCameraDebug,
  resetRealmMapCamera,
  resetMapHeading,
  rotateMapHeading,
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
  const [buildingsRequested, setBuildingsRequested] = useState(false);
  const [fallbackBuildingsMode, setFallbackBuildingsMode] = useState(false);
  const [native3dAvailable, setNative3dAvailable] = useState(false);
  const [tiltSupported, setTiltSupported] = useState<boolean | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!map) return undefined;

    const sync = () => {
      const nextTilt = map.getTilt() ?? 0;
      const nextHeading = map.getHeading() ?? 0;
      const vector = isVectorMapRendering(map);
      setTilt(nextTilt);
      setHeading(nextHeading);
      setNative3dAvailable(vector);
      if (nextTilt >= TILT_ACTIVE_THRESHOLD) {
        setTiltSupported(true);
      }
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

  const isCinematic = tilt >= TILT_ACTIVE_THRESHOLD;
  const nativeBuildingsVisible =
    buildingsRequested && !fallbackBuildingsMode && isCinematic && native3dAvailable;
  const showFallbackBuildings = buildingsRequested && fallbackBuildingsMode;
  const buildingsActive = nativeBuildingsVisible || showFallbackBuildings;

  useEffect(() => {
    onShowFallbackBuildingsChange?.(showFallbackBuildings);
  }, [onShowFallbackBuildingsChange, showFallbackBuildings]);

  useEffect(() => {
    if (mapLayer === "satellite") {
      setBuildingsRequested(false);
      setFallbackBuildingsMode(false);
    }
  }, [mapLayer]);

  // If tilt returns flat while native buildings were on, disable buildings mode.
  useEffect(() => {
    if (!buildingsRequested || fallbackBuildingsMode || !native3dAvailable) return;
    if (!isCinematic) {
      setBuildingsRequested(false);
    }
  }, [buildingsRequested, fallbackBuildingsMode, isCinematic, native3dAvailable]);

  const ensureBuildingZoom = useCallback(() => {
    if (!map) return;
    if ((map.getZoom() ?? 0) < URI_MAP_BUILDING_ZOOM) {
      map.setZoom(URI_MAP_BUILDING_ZOOM);
    }
  }, [map]);

  const toggleTilt = useCallback(async () => {
    if (!map || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("3D view isn't supported on this device.");
      return;
    }
    if (tiltSupported === false) {
      onNotice?.("3D view isn't supported on this device.");
      return;
    }

    busyRef.current = true;
    const goingCinematic = (map.getTilt() ?? 0) < TILT_ACTIVE_THRESHOLD;

    try {
      if (goingCinematic) {
        ensureBuildingZoom();
        const actual = await applyTiltCamera(map, { preserveCenter: true, preserveHeading: true });
        const vector = isVectorMapRendering(map);
        logRealmMapCameraDebug(map, {
          action: "tilt-on",
          actualTilt: actual,
          vector3dEnabled,
          mapIdDetected: Boolean(REALM_GOOGLE_MAP_ID),
          vectorRendering: vector,
          buildingsRequested,
        });

        if (actual < TILT_ACTIVE_THRESHOLD) {
          setTiltSupported(false);
          onNotice?.("3D view isn't supported on this device.");
          await applyFlatCamera(map);
        } else {
          setTiltSupported(true);
        }
      } else {
        await applyFlatCamera(map);
        if (buildingsRequested && native3dAvailable && !fallbackBuildingsMode) {
          setBuildingsRequested(false);
        }
        logRealmMapCameraDebug(map, {
          action: "tilt-off",
          mapIdDetected: Boolean(REALM_GOOGLE_MAP_ID),
          buildingsRequested,
        });
      }
    } finally {
      busyRef.current = false;
    }
  }, [
    buildingsRequested,
    ensureBuildingZoom,
    map,
    mapLayer,
    native3dAvailable,
    onNotice,
    tiltSupported,
    vector3dEnabled,
  ]);

  const toggleBuildings = useCallback(async () => {
    if (!map || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("3D view isn't supported on this device.");
      return;
    }

    if (buildingsRequested) {
      setBuildingsRequested(false);
      setFallbackBuildingsMode(false);
      logRealmMapCameraDebug(map, { action: "buildings-off", mapIdDetected: Boolean(REALM_GOOGLE_MAP_ID) });
      return;
    }

    busyRef.current = true;
    try {
      ensureBuildingZoom();

      // Native Google 3D buildings require tilt — enable it automatically.
      let actualTilt = map.getTilt() ?? 0;
      if (actualTilt < TILT_ACTIVE_THRESHOLD) {
        actualTilt = await applyTiltCamera(map, { preserveCenter: true, preserveHeading: true });
      }

      const vector = isVectorMapRendering(map);
      setNative3dAvailable(vector);

      logRealmMapCameraDebug(map, {
        action: "buildings-on",
        actualTilt,
        vectorRendering: vector,
        mapIdDetected: Boolean(REALM_GOOGLE_MAP_ID),
        vector3dEnabled,
      });

      if (actualTilt >= TILT_ACTIVE_THRESHOLD && vector) {
        setFallbackBuildingsMode(false);
        setBuildingsRequested(true);
        setTiltSupported(true);
        return;
      }

      if (actualTilt < TILT_ACTIVE_THRESHOLD) {
        setTiltSupported(false);
      }

      // Fallback raised-building overlays when native 3D is unavailable.
      setFallbackBuildingsMode(true);
      setBuildingsRequested(true);
      if (!vector || actualTilt < TILT_ACTIVE_THRESHOLD) {
        onNotice?.("Using campus building highlights — native 3D is unavailable here.");
      }
    } finally {
      busyRef.current = false;
    }
  }, [buildingsRequested, ensureBuildingZoom, map, mapLayer, onNotice, vector3dEnabled]);

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

  const resetCamera = useCallback(async () => {
    if (!map) return;
    setBuildingsRequested(false);
    setFallbackBuildingsMode(false);
    resetRealmMapCamera(map, mapLayer, vector3dEnabled);
    await applyFlatCamera(map);
    logRealmMapCameraDebug(map, { action: "reset-camera" });
  }, [map, mapLayer, vector3dEnabled]);

  const showCompass =
    Math.abs(heading) > HEADING_VISIBLE_THRESHOLD &&
    Math.abs(heading - 360) > HEADING_VISIBLE_THRESHOLD;

  return {
    tilt,
    heading,
    buildingsMode: buildingsRequested,
    buildingsActive,
    native3dAvailable,
    showFallbackBuildings,
    isCinematic,
    tiltDisabled: tiltSupported === false,
    showCompass,
    campus3dCapable: mapLayer === "campus",
    toggleTilt,
    toggleBuildings,
    rotateLeft,
    rotateRight,
    resetHeading: resetHeadingToNorth,
    resetCamera,
  };
}
