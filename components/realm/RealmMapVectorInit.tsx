"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { warnIfRealmMapIdMissing } from "@/lib/realm/googleMapConfig";
import { isVectorMapRendering } from "@/lib/realm/googleMapPose";

/**
 * Re-asserts gesture interaction flags after tiles load.
 * Does NOT touch heading/tilt/center/zoom — those must stay under user control.
 */
export function RealmMapVectorInit({
  vector3dEnabled,
  tilesLoaded,
  onVectorRendering,
}: {
  vector3dEnabled: boolean;
  tilesLoaded: boolean;
  onVectorRendering?: (vector: boolean) => void;
}) {
  const map = useMap();
  const warnedRef = useRef(false);

  useEffect(() => {
    warnIfRealmMapIdMissing();
  }, []);

  useEffect(() => {
    if (!map || !tilesLoaded) return;

    map.setOptions({
      gestureHandling: "greedy",
      rotateControl: true,
      tiltInteractionEnabled: true,
      headingInteractionEnabled: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      keyboardShortcuts: true,
      isFractionalZoomEnabled: true,
      clickableIcons: false,
      // Never pass heading/tilt here — setOptions with 0 resets the camera.
    });

    if (typeof map.setTiltInteractionEnabled === "function") {
      map.setTiltInteractionEnabled(true);
    }
    if (typeof map.setHeadingInteractionEnabled === "function") {
      map.setHeadingInteractionEnabled(true);
    }

    if (!vector3dEnabled) {
      onVectorRendering?.(false);
      return;
    }

    // Prefer setRenderingType when available; Map ID still owns cloud style.
    const renderingType = google.maps.RenderingType?.VECTOR;
    if (renderingType != null && typeof map.setRenderingType === "function") {
      map.setRenderingType(renderingType);
    }

    const vector = isVectorMapRendering(map);
    onVectorRendering?.(vector);
    if (process.env.NODE_ENV === "development" && !vector && !warnedRef.current) {
      warnedRef.current = true;
      console.error(
        "CampusQuest map is not using VECTOR rendering. Open Google Cloud Console > Google Maps Platform > Map Management > select the JavaScript Map ID > confirm Map type is Vector and Tilt and Rotation are enabled.",
      );
    }
  }, [map, onVectorRendering, tilesLoaded, vector3dEnabled]);

  return null;
}
