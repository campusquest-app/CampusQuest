"use client";

import { useEffect, useState } from "react";
import { ControlPosition, MapControl, useMap } from "@vis.gl/react-google-maps";
import { REALM_GOOGLE_MAP_ID } from "@/lib/realm/googleMapConfig";
import {
  URI_MAP_3D_VIEW_TILT,
  URI_MAP_3D_VIEW_ZOOM,
  URI_MAP_FALLBACK_TILT,
  URI_MAP_ROTATE_STEP_DEG,
  apply3dBuildingView,
  applyFlatCamera,
  isVectorMapRendering,
  moveMapCamera,
  resetMapHeading,
  rotateMapHeading,
} from "@/lib/realm/googleMapPose";

function detectGestureBlocker(map: google.maps.Map): string {
  const div = map.getDiv();
  if (!div) return "none";
  const rect = div.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const el = document.elementFromPoint(x, y);
  if (!el) return "none";

  let node: Element | null = el;
  while (node && node !== document.body) {
    if (node === div || div.contains(node)) {
      // Google Maps internal panes are expected.
      if (node.classList.contains("gm-style") || node.closest(".gm-style")) {
        return "none";
      }
    }
    const pe = getComputedStyle(node).pointerEvents;
    if (pe === "auto" || pe === "all") {
      const name =
        (node as HTMLElement).dataset?.cqGestureBlocker ??
        node.getAttribute("data-testid") ??
        node.className?.toString?.().split(/\s+/).find(Boolean) ??
        node.tagName.toLowerCase();
      // Ignore our own interactive chrome and map controls.
      if (
        typeof name === "string" &&
        !name.includes("gm-") &&
        !name.includes("cq-realm-float") &&
        !name.includes("cq-realm-map-controls") &&
        !name.includes("cq-realm-map-search") &&
        !name.includes("cq-realm-marker") &&
        node !== div &&
        !div.contains(node)
      ) {
        return name.slice(0, 48);
      }
    }
    node = node.parentElement;
  }
  return "none";
}

/**
 * Development-only camera + renderer diagnostics and temporary camera buttons.
 * Proves whether tilt/rotation fail due to gestures vs vector Map ID / renderer.
 */
export function RealmMapCameraDebugHud({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const [zoom, setZoom] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [heading, setHeading] = useState(0);
  const [renderer, setRenderer] = useState<"vector" | "raster" | "unknown">("unknown");
  const [activeTouches, setActiveTouches] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [blocker, setBlocker] = useState("none");

  useEffect(() => {
    if (!enabled || !map || process.env.NODE_ENV !== "development") return undefined;

    const sync = () => {
      setZoom(Number((map.getZoom() ?? 0).toFixed(2)));
      setTilt(Number((map.getTilt() ?? 0).toFixed(1)));
      setHeading(Number((map.getHeading() ?? 0).toFixed(1)));
      setRenderer(isVectorMapRendering(map) ? "vector" : "raster");
      setBlocker(detectGestureBlocker(map));
    };

    sync();
    const listeners = [
      map.addListener("idle", sync),
      map.addListener("tilt_changed", sync),
      map.addListener("heading_changed", sync),
      map.addListener("zoom_changed", sync),
      map.addListener("dragstart", () => setInteracting(true)),
      map.addListener("dragend", () => setInteracting(false)),
    ];

    const div = map.getDiv();
    const onTouch = (event: TouchEvent) => setActiveTouches(event.touches.length);
    const onTouchEnd = (event: TouchEvent) => setActiveTouches(event.touches.length);
    div?.addEventListener("touchstart", onTouch, { passive: true });
    div?.addEventListener("touchmove", onTouch, { passive: true });
    div?.addEventListener("touchend", onTouchEnd, { passive: true });
    div?.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      for (const listener of listeners) google.maps.event.removeListener(listener);
      div?.removeEventListener("touchstart", onTouch);
      div?.removeEventListener("touchmove", onTouch);
      div?.removeEventListener("touchend", onTouchEnd);
      div?.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, map]);

  if (!enabled || process.env.NODE_ENV !== "development" || !map) return null;

  const mapIdLoaded = REALM_GOOGLE_MAP_ID.length > 0;

  return (
    <MapControl position={ControlPosition.LEFT_BOTTOM}>
      <div className="cq-realm-map-camera-debug" data-testid="realm-map-camera-debug">
        <p className="cq-realm-map-camera-debug-title">Camera debug</p>
        <ul className="cq-realm-map-camera-debug-list">
          <li>Renderer: {renderer}</li>
          <li>Map ID loaded: {mapIdLoaded ? "yes" : "no"}</li>
          <li>Zoom: {zoom}</li>
          <li>Tilt: {tilt}°</li>
          <li>Heading: {heading}°</li>
          <li>Active touches: {activeTouches}</li>
          <li>Interacting: {interacting ? "yes" : "no"}</li>
          <li>Gesture blocker: {blocker}</li>
        </ul>
        <div className="cq-realm-map-camera-debug-actions">
          <button
            type="button"
            onClick={() => rotateMapHeading(map, -URI_MAP_ROTATE_STEP_DEG)}
          >
            Rot −{URI_MAP_ROTATE_STEP_DEG}°
          </button>
          <button
            type="button"
            onClick={() => rotateMapHeading(map, URI_MAP_ROTATE_STEP_DEG)}
          >
            Rot +{URI_MAP_ROTATE_STEP_DEG}°
          </button>
          <button
            type="button"
            onClick={() => {
              const next = (map.getTilt() ?? 0) < 2 ? URI_MAP_FALLBACK_TILT : 0;
              if (next === 0) void applyFlatCamera(map);
              else {
                moveMapCamera(map, {
                  tilt: next,
                  zoom: Math.max(map.getZoom() ?? 0, URI_MAP_3D_VIEW_ZOOM),
                });
              }
            }}
          >
            Tilt 0/45
          </button>
          <button
            type="button"
            onClick={() =>
              void apply3dBuildingView(map, {
                tilt: URI_MAP_3D_VIEW_TILT,
                zoom: URI_MAP_3D_VIEW_ZOOM,
              })
            }
          >
            3D view
          </button>
          <button type="button" onClick={() => resetMapHeading(map)}>
            North
          </button>
        </div>
      </div>
    </MapControl>
  );
}
