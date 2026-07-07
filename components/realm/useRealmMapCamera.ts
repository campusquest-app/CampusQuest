"use client";

import { useCallback, useEffect, useState } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import {
  URI_MAP_CINEMATIC_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  applyCinematicCampusCamera,
  resetFlatMapOrientation,
  resetRealmMapCamera,
  rotateMapHeading,
} from "@/lib/realm/googleMapPose";

export function useRealmMapCamera({
  mapLayer,
  vector3dEnabled,
  onNotice,
}: {
  mapLayer: "campus" | "satellite";
  vector3dEnabled: boolean;
  onNotice?: (message: string) => void;
}) {
  const map = useMap();
  const [tilt, setTilt] = useState(0);
  const [heading, setHeading] = useState(0);
  const [tiltGestureSupported, setTiltGestureSupported] = useState(vector3dEnabled);

  useEffect(() => {
    if (!map) return undefined;

    const sync = () => {
      setTilt(map.getTilt() ?? 0);
      setHeading(map.getHeading() ?? 0);
    };

    sync();
    const tiltListener = map.addListener("tilt_changed", sync);
    const headingListener = map.addListener("heading_changed", sync);

    return () => {
      google.maps.event.removeListener(tiltListener);
      google.maps.event.removeListener(headingListener);
    };
  }, [map]);

  const notifyUnsupportedTilt = useCallback(() => {
    setTiltGestureSupported(false);
    onNotice?.("3D buildings aren't available on this device — showing flat view.");
  }, [onNotice]);

  const toggleTilt = useCallback(() => {
    if (!map) return;
    if (!vector3dEnabled || mapLayer !== "campus") {
      onNotice?.("3D campus view requires a vector Google Maps Map ID.");
      return;
    }

    const current = map.getTilt() ?? 0;
    const goingCinematic = current < 2;

    if (goingCinematic) {
      applyCinematicCampusCamera(map);
      window.setTimeout(() => {
        const actual = map.getTilt() ?? 0;
        if (actual < 2) {
          notifyUnsupportedTilt();
          map.setTilt(0);
        } else {
          setTiltGestureSupported(true);
        }
      }, 350);
    } else {
      map.setTilt(0);
    }
  }, [map, mapLayer, notifyUnsupportedTilt, onNotice, vector3dEnabled]);

  const rotateLeft = useCallback(() => {
    if (!map) return;
    rotateMapHeading(map, -URI_MAP_ROTATE_STEP_DEG);
  }, [map]);

  const rotateRight = useCallback(() => {
    if (!map) return;
    rotateMapHeading(map, URI_MAP_ROTATE_STEP_DEG);
  }, [map]);

  const resetHeading = useCallback(() => {
    if (!map) return;
    map.setHeading(0);
  }, [map]);

  const resetCamera = useCallback(() => {
    if (!map) return;
    resetRealmMapCamera(map, mapLayer, vector3dEnabled);
  }, [map, mapLayer, vector3dEnabled]);

  const isCinematic = tilt >= 2;
  const tiltAvailable = vector3dEnabled && mapLayer === "campus";

  return {
    tilt,
    heading,
    isCinematic,
    tiltAvailable,
    tiltGestureSupported,
    toggleTilt,
    rotateLeft,
    rotateRight,
    resetHeading,
    resetCamera,
    resetFlat: resetFlatMapOrientation,
  };
}
