"use client";

import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { REALM_GOOGLE_MAP_ID, warnIfRealmMapIdMissing } from "@/lib/realm/googleMapConfig";
import { isVectorMapRendering } from "@/lib/realm/googleMapPose";

/**
 * Development-only: prove the real google.maps.Map is VECTOR and that
 * heading/tilt can change. Runs exactly once after the first idle.
 */
export function RealmMapVectorDiagnostics({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const ranRef = useRef(false);

  useEffect(() => {
    warnIfRealmMapIdMissing();
    if (
      process.env.NODE_ENV === "development" &&
      !process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID &&
      !process.env.NEXT_PUBLIC_GOOGLE_MAP_ID
    ) {
      console.error(
        "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID is missing from the client bundle. Restart the Next.js development server after editing .env.local.",
      );
    }
  }, []);

  useEffect(() => {
    if (!enabled || !map || process.env.NODE_ENV !== "development") return undefined;
    if (ranRef.current) return undefined;

    const run = () => {
      if (ranRef.current) return;
      ranRef.current = true;

      const mapIdPresent = Boolean(
        (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "").trim(),
      );

      console.info("[cq:realm-map] real map instance", map);
      console.table({
        mapIdPresent: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID) || Boolean(REALM_GOOGLE_MAP_ID),
        mapIdValueLength:
          (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? process.env.NEXT_PUBLIC_GOOGLE_MAP_ID)?.length ?? 0,
        renderingType:
          typeof map.getRenderingType === "function" ? map.getRenderingType() : "unavailable",
        zoom: map.getZoom(),
        tilt: map.getTilt(),
        heading: map.getHeading(),
        tiltInteractionEnabled:
          typeof map.getTiltInteractionEnabled === "function"
            ? map.getTiltInteractionEnabled()
            : "unavailable",
        headingInteractionEnabled:
          typeof map.getHeadingInteractionEnabled === "function"
            ? map.getHeadingInteractionEnabled()
            : "unavailable",
      });

      const renderingType =
        typeof map.getRenderingType === "function" ? map.getRenderingType() : null;
      const vectorEnum = google.maps.RenderingType?.VECTOR;
      if (vectorEnum != null && renderingType !== vectorEnum) {
        if (renderingType === google.maps.RenderingType?.RASTER) {
          console.error(
            "Google Maps fell back to raster rendering in this browser. Tilt and heading are unavailable.",
          );
        }
        console.error(
          "CampusQuest map is not using VECTOR rendering. Open Google Cloud Console > Google Maps Platform > Map Management > select the JavaScript Map ID > confirm Map type is Vector and Tilt and Rotation are enabled.",
        );
      }

      testVectorCamera(map);
    };

    // Wait for first-open fly / initial settle so the camera test is not overwritten.
    let idleCount = 0;
    const idleListener = map.addListener("idle", () => {
      idleCount += 1;
      if (idleCount >= 2) run();
    });
    const timer = window.setTimeout(run, 2800);

    return () => {
      google.maps.event.removeListener(idleListener);
      window.clearTimeout(timer);
    };
  }, [enabled, map]);

  return null;
}

function testVectorCamera(map: google.maps.Map): void {
  const startingZoom = map.getZoom() ?? 17;
  const before = {
    renderingType:
      typeof map.getRenderingType === "function" ? map.getRenderingType() : "unavailable",
    heading: map.getHeading() ?? 0,
    tilt: map.getTilt() ?? 0,
    zoom: startingZoom,
  };

  if (startingZoom < 18) {
    map.setZoom(18);
  }

  window.setTimeout(() => {
    if (typeof map.moveCamera === "function") {
      map.moveCamera({
        heading: 45,
        tilt: 45,
        zoom: Math.max(map.getZoom() ?? 18, 18),
      });
    } else {
      map.setHeading?.(45);
      map.setTilt?.(45);
    }

    window.setTimeout(() => {
      const after = {
        renderingType:
          typeof map.getRenderingType === "function" ? map.getRenderingType() : "unavailable",
        requestedHeading: 45,
        actualHeading: map.getHeading(),
        requestedTilt: 45,
        actualTilt: map.getTilt(),
        actualZoom: map.getZoom(),
        vector: isVectorMapRendering(map),
      };
      console.info("[cq:realm-map] vector camera test — before", before);
      console.table(after);

      // Restore flat north so the user doesn't land mid-test.
      if (typeof map.moveCamera === "function") {
        map.moveCamera({
          heading: 0,
          tilt: 0,
          zoom: after.actualZoom ?? 18,
        });
      }
    }, 800);
  }, 500);
}
