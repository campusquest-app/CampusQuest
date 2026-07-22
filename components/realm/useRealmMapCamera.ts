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
  isVectorMapRendering,
  logRealmMapCameraDebug,
  moveMapCamera,
  normalizeHeadingDegrees,
  resetRealmMapCamera,
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
  const busyRef = useRef(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  mapRef.current = map;

  useEffect(() => {
    if (!map) return undefined;

    const sync = () => {
      const nextTilt = map.getTilt() ?? 0;
      const nextHeading = map.getHeading() ?? 0;
      const nextZoom = map.getZoom() ?? 0;
      setTilt(nextTilt);
      setHeading(nextHeading);
      setZoom(nextZoom);
      setNative3dAvailable(isVectorMapRendering(map));
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

  useEffect(() => {
    if (!buildingsRequested || fallbackBuildingsMode || !native3dAvailable) return;
    if (!isCinematic) {
      setBuildingsRequested(false);
    }
  }, [buildingsRequested, fallbackBuildingsMode, isCinematic, native3dAvailable]);

  const missingMapIdMessage =
    "3D tilt needs a Google Vector Map ID (NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID).";

  const toggleTilt = useCallback(() => {
    const active = mapRef.current;
    if (!active || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("Switch to campus view for 3D tilt.");
      return;
    }
    if (!REALM_GOOGLE_MAP_ID) {
      onNotice?.(missingMapIdMessage);
    }

    const zoomNow = active.getZoom() ?? 0;
    if (zoomNow < URI_MAP_BUILDING_ZOOM) {
      active.setZoom(URI_MAP_BUILDING_ZOOM);
    }

    const currentTilt = active.getTilt() ?? 0;
    const requestedTilt = currentTilt > TILT_ACTIVE_THRESHOLD ? 0 : URI_MAP_FALLBACK_TILT;

    busyRef.current = true;
    moveMapCamera(active, {
      tilt: requestedTilt,
      heading: active.getHeading() ?? 0,
      zoom: Math.max(active.getZoom() ?? URI_MAP_BUILDING_ZOOM, URI_MAP_BUILDING_ZOOM),
    });

    window.setTimeout(() => {
      const actualTilt = active.getTilt() ?? 0;
      setTilt(actualTilt);
      logRealmMapCameraDebug(active, {
        action: requestedTilt > 0 ? "tilt-on" : "tilt-off",
        requestedTilt,
        actualTilt,
        mapIdConfigured: Boolean(REALM_GOOGLE_MAP_ID),
        vectorRendering: isVectorMapRendering(active),
      });

      if (requestedTilt > 0 && actualTilt < TILT_ACTIVE_THRESHOLD) {
        onNotice?.(
          "3D tilt is unavailable. Confirm this Map ID is Vector with Tilt and Rotation enabled.",
        );
      }
      if (requestedTilt === 0 && buildingsRequested && native3dAvailable && !fallbackBuildingsMode) {
        setBuildingsRequested(false);
      }
      busyRef.current = false;
    }, 500);
  }, [
    buildingsRequested,
    fallbackBuildingsMode,
    mapLayer,
    native3dAvailable,
    onNotice,
  ]);

  const go3dView = useCallback(async () => {
    const active = mapRef.current;
    if (!active || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("Switch to campus view for 3D.");
      return;
    }
    if (!REALM_GOOGLE_MAP_ID) {
      onNotice?.(missingMapIdMessage);
    }

    busyRef.current = true;
    try {
      const actual = await apply3dBuildingView(active);
      const vector = isVectorMapRendering(active);
      setNative3dAvailable(vector);
      setTilt(actual);
      logRealmMapCameraDebug(active, {
        action: "3d-view",
        actualTilt: actual,
        vectorRendering: vector,
        mapIdConfigured: Boolean(REALM_GOOGLE_MAP_ID),
      });

      if (actual >= TILT_ACTIVE_THRESHOLD) {
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
        onNotice?.(
          "3D tilt is unavailable. Confirm this Map ID is Vector with Tilt and Rotation enabled.",
        );
      }
    } finally {
      busyRef.current = false;
    }
  }, [mapLayer, onNotice]);

  const toggleBuildings = useCallback(async () => {
    const active = mapRef.current;
    if (!active || busyRef.current) return;
    if (mapLayer !== "campus") {
      onNotice?.("Switch to campus view for raised buildings.");
      return;
    }

    if (buildingsRequested) {
      setBuildingsRequested(false);
      setFallbackBuildingsMode(false);
      logRealmMapCameraDebug(active, {
        action: "buildings-off",
        mapIdConfigured: Boolean(REALM_GOOGLE_MAP_ID),
      });
      return;
    }

    await go3dView();
  }, [buildingsRequested, go3dView, mapLayer, onNotice]);

  const rotateMap = useCallback((delta: number) => {
    const active = mapRef.current;
    if (!active) return;
    const currentHeading = active.getHeading() ?? 0;
    const nextHeading = normalizeHeadingDegrees(currentHeading + delta);
    moveMapCamera(active, {
      heading: nextHeading,
      tilt: active.getTilt() ?? 0,
      zoom: active.getZoom() ?? undefined,
    });
  }, []);

  const rotateLeft = useCallback(() => {
    rotateMap(-URI_MAP_ROTATE_STEP_DEG);
  }, [rotateMap]);

  const rotateRight = useCallback(() => {
    rotateMap(URI_MAP_ROTATE_STEP_DEG);
  }, [rotateMap]);

  const resetHeadingToNorth = useCallback(() => {
    const active = mapRef.current;
    if (!active) return;
    moveMapCamera(active, {
      heading: 0,
      tilt: active.getTilt() ?? 0,
      zoom: active.getZoom() ?? undefined,
    });
  }, []);

  const resetCamera = useCallback(async () => {
    const active = mapRef.current;
    if (!active) return;
    setBuildingsRequested(false);
    setFallbackBuildingsMode(false);
    resetRealmMapCamera(active, mapLayer, vector3dEnabled);
    await applyFlatCamera(active);
    logRealmMapCameraDebug(active, { action: "reset-camera" });
  }, [mapLayer, vector3dEnabled]);

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
    tiltDisabled: false,
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
