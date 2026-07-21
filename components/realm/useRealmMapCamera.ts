"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { REALM_GOOGLE_MAP_ID } from "@/lib/realm/googleMapConfig";
import {
  URI_MAP_BUILDING_ZOOM,
  URI_MAP_FALLBACK_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  apply3dBuildingView,
  applyFlatCamera,
  applyTiltCamera,
  isVectorMapRendering,
  logRealmMapCameraDebug,
  moveMapCamera,
  readMapTiltAfterDelay,
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
  const [zoom, setZoom] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const [buildingsRequested, setBuildingsRequested] = useState(false);
  const [fallbackBuildingsMode, setFallbackBuildingsMode] = useState(false);
  const [native3dAvailable, setNative3dAvailable] = useState(false);
  /** null = unknown; false only after confirmed device/renderer rejection with a Map ID present. */
  const [tiltSupported, setTiltSupported] = useState<boolean | null>(null);
  const busyRef = useRef(false);
  /** Latest camera pose — refs avoid remount/reset loops when markers update. */
  const cameraPoseRef = useRef<{
    center: google.maps.LatLngLiteral | null;
    zoom: number;
    heading: number;
    tilt: number;
  }>({ center: null, zoom: 0, heading: 0, tilt: 0 });

  useEffect(() => {
    if (!map) return undefined;

    const sync = () => {
      const nextTilt = map.getTilt() ?? 0;
      const nextHeading = map.getHeading() ?? 0;
      const nextZoom = map.getZoom() ?? 0;
      const center = map.getCenter();
      const vector = isVectorMapRendering(map);
      cameraPoseRef.current = {
        center: center
          ? { lat: center.lat(), lng: center.lng() }
          : cameraPoseRef.current.center,
        zoom: nextZoom,
        heading: nextHeading,
        tilt: nextTilt,
      };
      setTilt(nextTilt);
      setHeading(nextHeading);
      setZoom(nextZoom);
      setNative3dAvailable(vector);
      if (nextTilt >= TILT_ACTIVE_THRESHOLD) {
        setTiltSupported(true);
      }
    };

    sync();
    const tiltListener = map.addListener("tilt_changed", sync);
    const headingListener = map.addListener("heading_changed", sync);
    const zoomListener = map.addListener("zoom_changed", sync);
    const idleListener = map.addListener("idle", sync);
    const dragStart = map.addListener("dragstart", () => setIsInteracting(true));
    const dragEnd = map.addListener("dragend", () => setIsInteracting(false));

    return () => {
      google.maps.event.removeListener(tiltListener);
      google.maps.event.removeListener(headingListener);
      google.maps.event.removeListener(zoomListener);
      google.maps.event.removeListener(idleListener);
      google.maps.event.removeListener(dragStart);
      google.maps.event.removeListener(dragEnd);
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

  const missingMapIdMessage =
    "3D tilt needs a Google Vector Map ID (NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID).";

  const toggleTilt = useCallback(async () => {
    if (!map || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("Switch to campus view for 3D tilt.");
      return;
    }
    if (tiltSupported === false && REALM_GOOGLE_MAP_ID) {
      onNotice?.("3D view isn't supported on this device or map style.");
      return;
    }
    if (!REALM_GOOGLE_MAP_ID) {
      onNotice?.(missingMapIdMessage);
      // Still attempt — proves whether the renderer accepts tilt without a Map ID.
    }

    busyRef.current = true;
    const goingCinematic = (map.getTilt() ?? 0) < TILT_ACTIVE_THRESHOLD;
    const zoomBefore = map.getZoom() ?? 0;

    try {
      if (goingCinematic) {
        if (zoomBefore + 0.01 < URI_MAP_BUILDING_ZOOM) {
          ensureBuildingZoom();
        }
        // Flat ↔ tilted: prefer 45°, then highest supported at this zoom.
        if (typeof map.setTilt === "function") {
          map.setTilt(URI_MAP_FALLBACK_TILT);
        }
        moveMapCamera(map, {
          tilt: URI_MAP_FALLBACK_TILT,
          zoom: Math.max(map.getZoom() ?? 0, URI_MAP_BUILDING_ZOOM),
          heading: map.getHeading() ?? 0,
        });
        let actual = await readMapTiltAfterDelay(map);
        // If 45° was rejected, retry via cinematic helper (67.5 → 45).
        if (actual < TILT_ACTIVE_THRESHOLD) {
          actual = await applyTiltCamera(map, { preserveCenter: true, preserveHeading: true });
        }

        const vector = isVectorMapRendering(map);
        // Always trust the map's accepted tilt for UI state.
        setTilt(actual);
        logRealmMapCameraDebug(map, {
          action: "tilt-on",
          actualTilt: actual,
          vector3dEnabled,
          mapIdConfigured: Boolean(REALM_GOOGLE_MAP_ID),
          vectorRendering: vector,
          buildingsRequested,
        });

        if (actual < TILT_ACTIVE_THRESHOLD) {
          if (!REALM_GOOGLE_MAP_ID) {
            onNotice?.(missingMapIdMessage);
          } else if ((map.getZoom() ?? 0) < URI_MAP_BUILDING_ZOOM) {
            onNotice?.("Zoom in to use 3D tilt.");
          } else {
            setTiltSupported(false);
            onNotice?.("Zoom in to use 3D tilt.");
          }
          await applyFlatCamera(map);
        } else {
          setTiltSupported(true);
          // At close zoom, nudge toward the highest supported tilt when 45° stuck low.
          if (actual < URI_MAP_FALLBACK_TILT - 1 && (map.getZoom() ?? 0) >= URI_MAP_BUILDING_ZOOM) {
            const higher = await applyTiltCamera(map, { preserveCenter: true, preserveHeading: true });
            setTilt(higher);
          }
        }
      } else {
        if (typeof map.setTilt === "function") {
          map.setTilt(0);
        }
        await applyFlatCamera(map);
        setTilt(map.getTilt() ?? 0);
        if (buildingsRequested && native3dAvailable && !fallbackBuildingsMode) {
          setBuildingsRequested(false);
        }
        logRealmMapCameraDebug(map, {
          action: "tilt-off",
          mapIdConfigured: Boolean(REALM_GOOGLE_MAP_ID),
          buildingsRequested,
        });
      }
    } finally {
      busyRef.current = false;
    }
  }, [
    buildingsRequested,
    ensureBuildingZoom,
    fallbackBuildingsMode,
    map,
    mapLayer,
    native3dAvailable,
    onNotice,
    tiltSupported,
    vector3dEnabled,
  ]);

  const go3dView = useCallback(async () => {
    if (!map || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("Switch to campus view for 3D.");
      return;
    }
    if (!REALM_GOOGLE_MAP_ID) {
      onNotice?.(missingMapIdMessage);
    }

    busyRef.current = true;
    try {
      const actual = await apply3dBuildingView(map);
      const vector = isVectorMapRendering(map);
      setNative3dAvailable(vector);
      logRealmMapCameraDebug(map, {
        action: "3d-view",
        actualTilt: actual,
        vectorRendering: vector,
        mapIdConfigured: Boolean(REALM_GOOGLE_MAP_ID),
      });

      if (actual >= TILT_ACTIVE_THRESHOLD) {
        setTiltSupported(true);
        setBuildingsRequested(true);
        setFallbackBuildingsMode(!vector);
        if (!vector) {
          onNotice?.("Using campus building highlights — native 3D is unavailable here.");
        }
      } else if (!REALM_GOOGLE_MAP_ID) {
        onNotice?.(missingMapIdMessage);
      } else {
        setFallbackBuildingsMode(true);
        setBuildingsRequested(true);
        onNotice?.("Using campus building highlights — native 3D is unavailable here.");
      }
    } finally {
      busyRef.current = false;
    }
  }, [map, mapLayer, onNotice]);

  const toggleBuildings = useCallback(async () => {
    if (!map || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("Switch to campus view for raised buildings.");
      return;
    }

    if (buildingsRequested) {
      setBuildingsRequested(false);
      setFallbackBuildingsMode(false);
      logRealmMapCameraDebug(map, {
        action: "buildings-off",
        mapIdConfigured: Boolean(REALM_GOOGLE_MAP_ID),
      });
      return;
    }

    await go3dView();
  }, [buildingsRequested, go3dView, map, mapLayer, onNotice]);

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
    zoom,
    isInteracting,
    buildingsMode: buildingsRequested,
    buildingsActive,
    native3dAvailable,
    showFallbackBuildings,
    isCinematic,
    tiltDisabled: tiltSupported === false && Boolean(REALM_GOOGLE_MAP_ID),
    showCompass,
    campus3dCapable: mapLayer === "campus",
    toggleTilt,
    toggleBuildings,
    go3dView,
    rotateLeft,
    rotateRight,
    resetHeading: resetHeadingToNorth,
    resetCamera,
  };
}
