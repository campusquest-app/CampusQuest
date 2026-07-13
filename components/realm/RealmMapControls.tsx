"use client";

import { useCallback, useEffect, useRef, type TouchEvent } from "react";
import { ControlPosition, MapControl, useMap } from "@vis.gl/react-google-maps";
import {
  Building2,
  Compass,
  Layers,
  LocateFixed,
  Move3d,
  Navigation,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { useRealmMapCamera } from "./useRealmMapCamera";
import { resetRealmMapCamera, URI_MAP_DEFAULT_ZOOM } from "@/lib/realm/googleMapPose";
import { isRealmVector3dEnabled } from "@/lib/realm/googleMapConfig";
import { resetUserCameraInteraction } from "@/lib/realm/mapCameraGuard";

const SWIPE_COLLAPSE_PX = 28;

export function RealmMapControls({
  expanded,
  onExpandedChange,
  onDenied,
  userPos,
  locating,
  followMode,
  onLocate,
  onToggleFollow,
  mapLayer,
  onToggleMapLayer,
  immersive = false,
  vector3dEnabled = isRealmVector3dEnabled(),
  onBuildingsOverlayChange,
  mapRef,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDenied: (message: string) => void;
  userPos: { lat: number; lng: number } | null;
  locating: boolean;
  followMode: boolean;
  onLocate: (onPosition?: (pos: { lat: number; lng: number }) => void) => void;
  onToggleFollow: () => void;
  mapLayer: "campus" | "satellite";
  onToggleMapLayer: () => void;
  immersive?: boolean;
  vector3dEnabled?: boolean;
  onBuildingsOverlayChange?: (show: boolean) => void;
  mapRef?: React.MutableRefObject<google.maps.Map | null>;
}) {
  const map = useMap();
  const touchStartYRef = useRef<number | null>(null);
  const camera = useRealmMapCamera({
    mapLayer,
    vector3dEnabled,
    onNotice: onDenied,
    onShowFallbackBuildingsChange: onBuildingsOverlayChange,
  });

  const showLocateWhenCollapsed = locating || userPos != null;

  const locate = useCallback(() => {
    onLocate((pos) => {
      const activeMap = mapRef?.current ?? map;
      if (!activeMap) return;
      activeMap.panTo(pos);
      if ((activeMap.getZoom() ?? 0) < 16) activeMap.setZoom(URI_MAP_DEFAULT_ZOOM);
    });
  }, [map, mapRef, onLocate]);

  const handleFollowToggle = useCallback(() => {
    onToggleFollow();
    if (!followMode && userPos) {
      const activeMap = mapRef?.current ?? map;
      activeMap?.panTo(userPos);
    }
  }, [followMode, map, mapRef, onToggleFollow, userPos]);

  const toggleLayer = useCallback(() => {
    const goingCampus = mapLayer === "satellite";
    onToggleMapLayer();
    if (goingCampus && map) {
      resetRealmMapCamera(map, "campus", vector3dEnabled);
    } else if (map) {
      map.setTilt(0);
    }
  }, [map, mapLayer, onToggleMapLayer, vector3dEnabled]);

  const handleStackTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    touchStartYRef.current = event.touches[0].clientY;
  };

  const handleStackTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!expanded || touchStartYRef.current == null || event.touches.length !== 1) return;
    const dy = event.touches[0].clientY - touchStartYRef.current;
    if (dy > SWIPE_COLLAPSE_PX) {
      onExpandedChange(false);
      touchStartYRef.current = null;
    }
  };

  const handleStackTouchEnd = () => {
    touchStartYRef.current = null;
  };

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExpandedChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onExpandedChange]);

  const stackClass = [
    "cq-realm-map-controls-stack",
    expanded ? "cq-realm-map-controls-stack--expanded" : "cq-realm-map-controls-stack--collapsed",
    immersive ? "cq-realm-map-controls-stack--immersive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <MapControl position={ControlPosition.RIGHT_BOTTOM}>
      <div
        className={`cq-realm-map-controls${immersive ? " cq-realm-map-controls--immersive" : ""}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={handleStackTouchStart}
        onTouchMove={handleStackTouchMove}
        onTouchEnd={handleStackTouchEnd}
      >
        <div className={stackClass}>
          {!expanded && showLocateWhenCollapsed ? (
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className={`cq-realm-float-btn cq-realm-map-controls-item cq-realm-map-controls-item--visible-collapsed flex h-11 w-11 items-center justify-center touch-manipulation disabled:opacity-60${
                followMode ? " cq-realm-float-btn--active" : ""
              }`}
              aria-label={followMode ? "Stop following your location" : "Center map on my location"}
              title={followMode ? "Following location" : "My location"}
            >
              <LocateFixed
                className={`h-[18px] w-[18px] ${locating ? "animate-pulse" : ""}`}
                strokeWidth={2.2}
              />
            </button>
          ) : null}

          <div className="cq-realm-map-controls-expandable" aria-hidden={!expanded}>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="cq-realm-float-btn cq-realm-map-controls-item cq-realm-map-controls-item--delay-1 flex h-11 w-11 items-center justify-center touch-manipulation disabled:opacity-60"
              aria-label="Center map on my location"
              title="My location"
              tabIndex={expanded ? 0 : -1}
            >
              <LocateFixed
                className={`h-[18px] w-[18px] ${locating ? "animate-pulse" : ""}`}
                strokeWidth={2.2}
              />
            </button>

            <button
              type="button"
              onClick={handleFollowToggle}
              disabled={locating}
              className={`cq-realm-float-btn cq-realm-map-controls-item cq-realm-map-controls-item--delay-1b flex h-11 w-11 items-center justify-center touch-manipulation disabled:opacity-60${
                followMode ? " cq-realm-float-btn--active" : ""
              }`}
              aria-label={followMode ? "Stop following your location" : "Follow your location"}
              aria-pressed={followMode}
              title={followMode ? "Stop follow" : "Follow"}
              tabIndex={expanded ? 0 : -1}
            >
              <Navigation
                className={`h-[18px] w-[18px] ${followMode ? "text-cyan-200" : ""}`}
                strokeWidth={2.2}
              />
            </button>

            <button
              type="button"
              onClick={() => void camera.toggleTilt()}
              disabled={mapLayer !== "campus" || camera.tiltDisabled}
              className={`cq-realm-float-btn cq-realm-map-controls-item cq-realm-map-controls-item--delay-2 flex h-11 w-11 items-center justify-center touch-manipulation disabled:opacity-50${
                camera.isCinematic ? " cq-realm-float-btn--active cq-realm-float-btn--tilt-active" : ""
              }`}
              aria-label={camera.isCinematic ? "Switch to flat map view" : "Switch to 3D tilted view"}
              aria-pressed={camera.isCinematic}
              title={
                camera.tiltDisabled
                  ? "3D view isn't supported on this device."
                  : mapLayer !== "campus"
                    ? "Switch to campus view for 3D"
                    : camera.isCinematic
                      ? "Flat view"
                      : "3D tilt"
              }
              tabIndex={expanded ? 0 : -1}
            >
              <Move3d className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>

            <button
              type="button"
              onClick={() => void camera.toggleBuildings()}
              disabled={mapLayer !== "campus"}
              className={`cq-realm-float-btn cq-realm-float-btn--buildings cq-realm-map-controls-item cq-realm-map-controls-item--delay-3 flex h-11 w-11 items-center justify-center touch-manipulation disabled:opacity-50${
                camera.buildingsActive ? " cq-realm-float-btn--active cq-realm-float-btn--buildings-active" : ""
              }`}
              aria-label={camera.buildingsActive ? "Hide raised buildings" : "Show raised buildings"}
              aria-pressed={camera.buildingsActive}
              title={
                mapLayer !== "campus"
                  ? "Switch to campus view for raised buildings"
                  : camera.buildingsActive
                    ? "Flat buildings"
                    : "Raised buildings"
              }
              tabIndex={expanded ? 0 : -1}
            >
              <Building2 className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>

            <div className="cq-realm-map-controls-rotate-row cq-realm-map-controls-item cq-realm-map-controls-item--delay-4 flex gap-1.5">
              <button
                type="button"
                onClick={camera.rotateLeft}
                className="cq-realm-float-btn cq-realm-float-btn--compact flex h-9 w-9 items-center justify-center touch-manipulation"
                aria-label="Rotate map left"
                title="Rotate left"
                tabIndex={expanded ? 0 : -1}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
              </button>
              {camera.showCompass ? (
                <button
                  type="button"
                  onClick={camera.resetHeading}
                  className="cq-realm-float-btn cq-realm-float-btn--compact cq-realm-float-btn--compass flex h-9 w-9 items-center justify-center touch-manipulation"
                  aria-label="Reset map to north-up"
                  title="North up"
                  tabIndex={expanded ? 0 : -1}
                >
                  <Compass className="h-4 w-4" strokeWidth={2.2} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={camera.rotateRight}
                className="cq-realm-float-btn cq-realm-float-btn--compact flex h-9 w-9 items-center justify-center touch-manipulation"
                aria-label="Rotate map right"
                title="Rotate right"
                tabIndex={expanded ? 0 : -1}
              >
                <RotateCw className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                resetUserCameraInteraction();
                void camera.resetCamera();
              }}
              className="cq-realm-float-btn cq-realm-map-controls-item cq-realm-map-controls-item--delay-5 flex h-11 w-11 items-center justify-center touch-manipulation"
              aria-label="Reset campus map view"
              title="Reset view"
              tabIndex={expanded ? 0 : -1}
            >
              <Navigation className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>

            <button
              type="button"
              onClick={toggleLayer}
              className={`cq-realm-float-btn cq-realm-map-controls-item cq-realm-map-controls-item--delay-6 flex h-11 w-11 items-center justify-center touch-manipulation${
                mapLayer === "satellite" ? " cq-realm-float-btn--active" : ""
              }`}
              aria-label={mapLayer === "campus" ? "Switch to satellite view" : "Switch to campus view"}
              aria-pressed={mapLayer === "satellite"}
              title={mapLayer === "campus" ? "Satellite view" : "Campus view"}
              tabIndex={expanded ? 0 : -1}
            >
              <Layers className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            className={`cq-realm-float-btn cq-realm-map-controls-toggle flex h-11 w-11 items-center justify-center touch-manipulation${
              expanded ? " cq-realm-map-controls-toggle--expanded" : ""
            }`}
            aria-label={expanded ? "Hide map controls" : "Show map controls"}
            aria-expanded={expanded}
            title={expanded ? "Hide controls" : "Map controls"}
          >
            {expanded ? (
              <PanelRightClose className="h-[18px] w-[18px]" strokeWidth={2.2} />
            ) : (
              <PanelRightOpen className="h-[18px] w-[18px]" strokeWidth={2.2} />
            )}
          </button>
        </div>
      </div>
    </MapControl>
  );
}
