"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { REALM_GOOGLE_MAP_ID, warnIfRealmMapIdMissing } from "@/lib/realm/googleMapConfig";
import { isVectorMapRendering, logRealmMapCameraDebug } from "@/lib/realm/googleMapPose";

/**
 * Ensures vector rendering when a Map ID is configured and logs a clear
 * development warning when the Map ID is missing (does not log the ID/key).
 *
 * Also re-asserts gesture / zoom options after tiles load — `reuseMaps` and
 * layer switches can drop them.
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
  const idleLoggedRef = useRef(false);

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

    const renderingType = google.maps.RenderingType?.VECTOR;
    if (renderingType != null) {
      if (typeof map.setRenderingType === "function") {
        map.setRenderingType(renderingType);
      } else {
        map.setOptions({ renderingType });
      }
    }

    let warnedNonVector = false;
    const report = () => {
      const vector = isVectorMapRendering(map);
      onVectorRendering?.(vector);
      if (process.env.NODE_ENV === "development" && !vector && !warnedNonVector) {
        warnedNonVector = true;
        console.warn(
          "[cq:realm-map] Map ID is set but vector rendering was not detected. " +
            "Confirm the Map ID is a vector map style in Google Cloud Console.",
        );
      }
    };

    report();

    // One concise idle diagnostic — do not spam on every idle.
    const idleListener = map.addListener("idle", () => {
      report();
      if (process.env.NODE_ENV !== "development" || idleLoggedRef.current) return;
      idleLoggedRef.current = true;
      logRealmMapCameraDebug(map, {
        action: "idle-vector-check",
        mapIdPresent: Boolean(REALM_GOOGLE_MAP_ID),
        vectorRendering: isVectorMapRendering(map),
      });
    });

    return () => {
      google.maps.event.removeListener(idleListener);
    };
  }, [map, onVectorRendering, tilesLoaded, vector3dEnabled]);

  return null;
}
