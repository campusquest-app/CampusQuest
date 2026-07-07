"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  ColorScheme,
  ControlPosition,
  Map,
  MapControl,
  useMap,
} from "@vis.gl/react-google-maps";
import { AlertTriangle, Compass, Layers, LocateFixed, MapPinOff, Move3d, Navigation, RotateCcw, RotateCw } from "lucide-react";
import type { RealmLocationId } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount } from "@/lib/mapLocationGroups";
import { CQ_REALM_MAP_BACKGROUND, CQ_REALM_MAP_STYLE } from "@/lib/realm/campusQuestMapStyles";
import { isRealmVector3dEnabled, REALM_GOOGLE_MAP_ID } from "@/lib/realm/googleMapConfig";
import {
  URI_MAP_CENTER,
  URI_MAP_DEFAULT_ZOOM,
  URI_MAP_CINEMATIC_TILT,
  URI_MAP_MAX_ZOOM,
  URI_MAP_MIN_ZOOM,
  URI_MAP_TYPE_ID,
  resetRealmMapCamera,
} from "@/lib/realm/googleMapPose";
import { vibrateMapMarkerTap } from "@/lib/realm/mapMarkerHaptic";
import {
  getLocationActivityState,
  groupActivityCounts,
  landmarkActivityCounts,
  markerZIndexForActivity,
} from "@/lib/realm/markerActivityState";
import { resolveGroupMarkerVariant, resolveLandmarkMarkerVariant } from "@/lib/realm/realmMapMarkerUtils";
import { CampusQuestMapMarker } from "./CampusQuestMapMarker";
import { QuestPathOverlay } from "./QuestPathOverlay";
import { RealmDirectionsOverlay, type RealmDirectionsLoadResult } from "./RealmDirectionsOverlay";
import { RealmMapFlyTo } from "./RealmMapFlyTo";
import { RealmMapCameraBootstrap } from "./RealmMapCameraBootstrap";
import { RealmMapMarker } from "./RealmMapMarker";
import { useRealmMapCamera } from "./useRealmMapCamera";
import { markerRevealOpacity, useMapZoom } from "./useMapZoom";
import type { RealmDirectionsRequest } from "@/lib/realm/realmDirectionsTypes";
import {
  beginRealmMapSession,
  clearRealmMapWatchdog,
  isRealmMapTilesReady,
  loadGoogleMapsApiOnce,
  markGoogleMapsApiReady,
  markRealmMapStep,
  markRealmMapTilesReady,
  resetGoogleMapsApiLoadPromise,
  resetRealmMapTilesReady,
} from "@/lib/realm/realmMapLifecycle";

const MAP_BACKGROUND = CQ_REALM_MAP_BACKGROUND;
const REALM_VECTOR_3D_ENABLED = isRealmVector3dEnabled();

export type GoogleRealmMapLandmark = {
  id: RealmLocationId;
  name: string;
  shortLabel: string;
  major: boolean;
  activeQuests: number;
  activeMomentCount: number;
  upcomingEvents: number;
  mapContent: GroupedMapLocation | null;
};

export type MapMarkerFilter = "all" | "quests" | "events" | "memories" | "qr";

const FILTER_OPTIONS: { id: MapMarkerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "quests", label: "Quests" },
  { id: "events", label: "Events" },
  { id: "memories", label: "Memories" },
  { id: "qr", label: "QR" },
];

function landmarkMatchesFilter(landmark: GoogleRealmMapLandmark, filter: MapMarkerFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "quests":
      return (landmark.mapContent?.quests.length ?? 0) > 0;
    case "events":
      return landmark.upcomingEvents > 0;
    case "memories":
      return landmark.activeMomentCount > 0;
    case "qr":
      return (landmark.mapContent?.qrCodes.length ?? 0) > 0;
  }
}

function groupMatchesFilter(group: GroupedMapLocation, filter: MapMarkerFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "quests":
      return group.quests.length > 0;
    case "events":
      return group.events.length > 0;
    case "memories":
      return false;
    case "qr":
      return group.qrCodes.length > 0;
  }
}

export function hasTrackableQuest(landmark: GoogleRealmMapLandmark): boolean {
  const variant = resolveLandmarkMarkerVariant(landmark);
  return variant === "quest" || variant === "legendary";
}

function MapActionButtons({
  onDenied,
  onUserLocation,
  userPos,
  mapLayer,
  onToggleMapLayer,
  immersive = false,
  vector3dEnabled = REALM_VECTOR_3D_ENABLED,
}: {
  onDenied: (message: string) => void;
  onUserLocation: (pos: { lat: number; lng: number } | null) => void;
  userPos: { lat: number; lng: number } | null;
  mapLayer: "campus" | "satellite";
  onToggleMapLayer: () => void;
  immersive?: boolean;
  vector3dEnabled?: boolean;
}) {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const camera = useRealmMapCamera({
    mapLayer,
    vector3dEnabled,
    onNotice: onDenied,
  });

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      onDenied("Location is not supported on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onUserLocation(next);
        setLocating(false);
        map?.panTo(next);
        if ((map?.getZoom() ?? 0) < 16) map?.setZoom(URI_MAP_DEFAULT_ZOOM);
      },
      () => {
        setLocating(false);
        onDenied("Location permission was denied — you can still explore the map.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, [map, onDenied, onUserLocation]);

  const toggleLayer = useCallback(() => {
    const goingCampus = mapLayer === "satellite";
    onToggleMapLayer();
    if (goingCampus && map) {
      resetRealmMapCamera(map, "campus", vector3dEnabled);
    } else if (map) {
      map.setTilt(0);
    }
  }, [map, mapLayer, onToggleMapLayer, vector3dEnabled]);

  return (
    <>
      <MapControl position={ControlPosition.RIGHT_BOTTOM}>
        <div
          className={`cq-realm-map-controls flex flex-col gap-2${immersive ? " cq-realm-map-controls--immersive" : ""}`}
        >
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="cq-realm-float-btn flex h-11 w-11 items-center justify-center touch-manipulation disabled:opacity-60"
            aria-label="Center map on my location"
            title="My location"
          >
            <LocateFixed className={`h-[18px] w-[18px] ${locating ? "animate-pulse" : ""}`} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={camera.toggleTilt}
            className={`cq-realm-float-btn flex h-11 w-11 items-center justify-center touch-manipulation${
              camera.isCinematic ? " cq-realm-float-btn--active" : ""
            }`}
            aria-label={camera.isCinematic ? "Switch to flat map view" : "Switch to 3D tilted view"}
            aria-pressed={camera.isCinematic}
            title={camera.isCinematic ? "Flat view" : "3D tilt"}
          >
            <Move3d className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
          <div className="cq-realm-map-controls-rotate-row flex gap-1.5">
            <button
              type="button"
              onClick={camera.rotateLeft}
              className="cq-realm-float-btn cq-realm-float-btn--compact flex h-9 w-9 items-center justify-center touch-manipulation"
              aria-label="Rotate map left"
              title="Rotate left"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={camera.resetHeading}
              className="cq-realm-float-btn cq-realm-float-btn--compact flex h-9 w-9 items-center justify-center touch-manipulation"
              aria-label="Reset map to north-up"
              title="North up"
            >
              <Compass className="h-4 w-4" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={camera.rotateRight}
              className="cq-realm-float-btn cq-realm-float-btn--compact flex h-9 w-9 items-center justify-center touch-manipulation"
              aria-label="Rotate map right"
              title="Rotate right"
            >
              <RotateCw className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
          <button
            type="button"
            onClick={camera.resetCamera}
            className="cq-realm-float-btn flex h-11 w-11 items-center justify-center touch-manipulation"
            aria-label="Reset campus map view"
            title="Reset view"
          >
            <Navigation className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={toggleLayer}
            className={`cq-realm-float-btn flex h-11 w-11 items-center justify-center touch-manipulation${
              mapLayer === "satellite" ? " cq-realm-float-btn--active" : ""
            }`}
            aria-label={mapLayer === "campus" ? "Switch to satellite view" : "Switch to campus view"}
            aria-pressed={mapLayer === "satellite"}
            title={mapLayer === "campus" ? "Satellite view" : "Campus view"}
          >
            <Layers className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        </div>
      </MapControl>
      {userPos ? (
        <CampusQuestMapMarker position={userPos} zIndex={5}>
          <span className="cq-gmap-user-dot" aria-label="Your location">
            <span className="cq-gmap-user-dot-pulse" aria-hidden />
          </span>
        </CampusQuestMapMarker>
      ) : null}
    </>
  );
}

function RealmMapReadyProbe({ onReady }: { onReady: (source: string) => void }) {
  const map = useMap();
  const readyRef = useRef(isRealmMapTilesReady());
  const mapLoggedRef = useRef(false);

  useEffect(() => {
    if (!map) return undefined;
    if (!mapLoggedRef.current) {
      mapLoggedRef.current = true;
      markRealmMapStep("map-creation");
    }

    const markFromMap = (source: string) => {
      if (readyRef.current) return;
      readyRef.current = true;
      markRealmMapStep("tiles-loaded", { source });
      onReady(source);
    };

    if (isRealmMapTilesReady()) {
      markFromMap("cached-tiles");
      return undefined;
    }

    const idleListener = map.addListener("idle", () => markFromMap("idle"));
    const tilesListener = map.addListener("tilesloaded", () => markFromMap("tilesloaded"));

    if (map.getBounds()) {
      markFromMap("bounds-ready");
    }

    return () => {
      google.maps.event.removeListener(idleListener);
      google.maps.event.removeListener(tilesListener);
    };
  }, [map, onReady]);

  return null;
}

function RealmMapVisibilityHandler({
  visible,
  onRecoverStall,
}: {
  visible: boolean;
  onRecoverStall?: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !visible) return undefined;
    const frame = window.requestAnimationFrame(() => {
      google.maps.event.trigger(map, "resize");
      markRealmMapStep("visibility-resize");
      window.setTimeout(() => {
        if (!map.getBounds()) {
          onRecoverStall?.();
        }
      }, 450);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [map, onRecoverStall, visible]);

  return null;
}

function RealmMapContainerObserver({
  surfaceRef,
}: {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
}) {
  const map = useMap();

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return undefined;

    const reportAndResize = () => {
      const { width, height } = el.getBoundingClientRect();
      markRealmMapStep("container-dimensions", { width: Math.round(width), height: Math.round(height) });
      if (width > 0 && height > 0 && map) {
        google.maps.event.trigger(map, "resize");
      }
    };

    reportAndResize();
    const observer = new ResizeObserver(reportAndResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [map, surfaceRef]);

  return null;
}

function RealmMapMarkers({
  landmarks,
  geoPositions,
  supplementaryPins,
  activeMarkerId,
  trackedPathDestination,
  directionsActive,
  editMode,
  editorSelectedId,
  filter,
  userPos,
  markersReveal = false,
  onTapLandmark,
  onTapSupplementary,
  onSelectEditorMarker,
  onMarkerGeoChange,
}: {
  landmarks: GoogleRealmMapLandmark[];
  geoPositions: Record<RealmLocationId, { lat: number; lng: number }>;
  supplementaryPins: GroupedMapLocation[];
  activeMarkerId: string | null;
  trackedPathDestination: { lat: number; lng: number } | null;
  directionsActive: boolean;
  editMode: boolean;
  editorSelectedId: RealmLocationId | null;
  filter: MapMarkerFilter;
  userPos: { lat: number; lng: number } | null;
  markersReveal?: boolean;
  onTapLandmark: (id: RealmLocationId) => void;
  onTapSupplementary: (group: GroupedMapLocation) => void;
  onSelectEditorMarker: (id: RealmLocationId) => void;
  onMarkerGeoChange: (id: RealmLocationId, lat: number, lng: number) => void;
}) {
  const mapZoom = useMapZoom();
  const markersLoggedRef = useRef(false);

  useEffect(() => {
    if (!markersReveal || markersLoggedRef.current) return;
    markersLoggedRef.current = true;
    markRealmMapStep("marker-creation", {
      landmarks: landmarks.length,
      supplementary: supplementaryPins.length,
    });
  }, [markersReveal, landmarks.length, supplementaryPins.length]);

  const visibleLandmarks = useMemo(
    () => (editMode ? landmarks : landmarks.filter((l) => landmarkMatchesFilter(l, filter))),
    [landmarks, editMode, filter],
  );

  const visibleGroups = useMemo(
    () =>
      editMode
        ? []
        : supplementaryPins.filter(
            (group) => mapLocationActivityCount(group) > 0 && groupMatchesFilter(group, filter),
          ),
    [supplementaryPins, editMode, filter],
  );

  const trackedDestination = trackedPathDestination;
  const pathOrigin = userPos ?? URI_MAP_CENTER;

  const handleLandmarkTap = useCallback(
    (id: RealmLocationId) => {
      vibrateMapMarkerTap();
      onTapLandmark(id);
    },
    [onTapLandmark],
  );

  const handleGroupTap = useCallback(
    (group: GroupedMapLocation) => {
      vibrateMapMarkerTap();
      onTapSupplementary(group);
    },
    [onTapSupplementary],
  );

  return (
    <>
      {visibleLandmarks.map((landmark, index) => {
        const pos = geoPositions[landmark.id];
        if (!pos) return null;
        const reveal = markerRevealOpacity(mapZoom, landmark.major);
        const isSelected = !editMode && activeMarkerId === landmark.id;
        const counts = landmarkActivityCounts(landmark);
        const { state: activityState, activityCount } = getLocationActivityState(counts, isSelected);
        const zIndex = markerZIndexForActivity(activityState, editorSelectedId === landmark.id);

        return (
          <CampusQuestMapMarker
            key={landmark.id}
            position={pos}
            zIndex={zIndex}
            draggable={editMode}
            onClick={() => {
              if (editMode) {
                onSelectEditorMarker(landmark.id);
                return;
              }
              handleLandmarkTap(landmark.id);
            }}
            onDragEnd={(lat, lng) => {
              onSelectEditorMarker(landmark.id);
              onMarkerGeoChange(landmark.id, lat, lng);
            }}
          >
            <RealmMapMarker
              variant={resolveLandmarkMarkerVariant(landmark)}
              label={landmark.shortLabel}
              landmarkId={landmark.id}
              major={landmark.major}
              activityState={editMode ? "idle" : activityState}
              activityCount={activityCount}
              revealOpacity={reveal}
              editMode={editMode}
              editorSelected={editorSelectedId === landmark.id}
              revealIndex={markersReveal ? index : undefined}
            />
          </CampusQuestMapMarker>
        );
      })}

      {visibleGroups.map((group, index) => {
        if (group.lat == null || group.lng == null) return null;
        const isSelected = !editMode && activeMarkerId === group.groupKey;
        const counts = groupActivityCounts(group);
        const { state: activityState, activityCount } = getLocationActivityState(counts, isSelected);
        const zIndex = markerZIndexForActivity(activityState, false);

        return (
          <CampusQuestMapMarker
            key={group.groupKey}
            position={{ lat: group.lat, lng: group.lng }}
            zIndex={zIndex}
            onClick={() => handleGroupTap(group)}
          >
            <RealmMapMarker
              variant={resolveGroupMarkerVariant(group)}
              label={group.locationName}
              activityState={activityState}
              activityCount={activityCount}
              revealOpacity={markerRevealOpacity(mapZoom, false)}
              revealIndex={markersReveal ? visibleLandmarks.length + index : undefined}
            />
          </CampusQuestMapMarker>
        );
      })}

      <QuestPathOverlay
        from={pathOrigin}
        to={trackedDestination}
        enabled={
          !directionsActive &&
          !editMode &&
          Boolean(trackedPathDestination && trackedDestination)
        }
      />
    </>
  );
}

export function GoogleRealmMap({
  apiKey,
  landmarks,
  geoPositions,
  supplementaryPins,
  markersLoaded,
  activeMarkerId,
  trackedPathDestination = null,
  editMode,
  editorSelectedId,
  onTapLandmark,
  onTapSupplementary,
  onSelectEditorMarker,
  onMarkerGeoChange,
  onMapReady,
  immersive = false,
  isActive = true,
  flyToTarget = null,
  flyToEnabled = false,
  directionsRequest = null,
  onDirectionsLoaded,
  onDirectionsError,
}: {
  apiKey: string;
  landmarks: GoogleRealmMapLandmark[];
  geoPositions: Record<RealmLocationId, { lat: number; lng: number }>;
  supplementaryPins: GroupedMapLocation[];
  markersLoaded: boolean;
  activeMarkerId: string | null;
  trackedPathDestination?: { lat: number; lng: number } | null;
  editMode: boolean;
  editorSelectedId: RealmLocationId | null;
  onTapLandmark: (id: RealmLocationId) => void;
  onTapSupplementary: (group: GroupedMapLocation) => void;
  onSelectEditorMarker: (id: RealmLocationId) => void;
  onMarkerGeoChange: (id: RealmLocationId, lat: number, lng: number) => void;
  onMapReady?: () => void;
  immersive?: boolean;
  isActive?: boolean;
  flyToTarget?: { lat: number; lng: number } | null;
  flyToEnabled?: boolean;
  directionsRequest?: RealmDirectionsRequest | null;
  onDirectionsLoaded?: (result: RealmDirectionsLoadResult & { ok: true }) => void;
  onDirectionsError?: (result: RealmDirectionsLoadResult & { ok: false }) => void;
}) {
  const [apiError, setApiError] = useState(false);
  const [filter, setFilter] = useState<MapMarkerFilter>("all");
  const [mapLayer, setMapLayer] = useState<"campus" | "satellite">("campus");
  const [tilesLoaded, setTilesLoaded] = useState(() => isRealmMapTilesReady());
  const [notice, setNotice] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const tilesReadyRef = useRef(isRealmMapTilesReady());
  const sessionStartedRef = useRef(false);
  const vector3dEnabled = REALM_VECTOR_3D_ENABLED;
  const useVectorMapId = vector3dEnabled && mapLayer === "campus";

  const markTilesReady = useCallback(
    (source: string) => {
      if (tilesReadyRef.current) return;
      tilesReadyRef.current = true;
      try {
        markRealmMapTilesReady();
        markRealmMapStep("loading-overlay-removal", { source });
        setTilesLoaded(true);
        onMapReady?.();
        clearRealmMapWatchdog();
      } finally {
        setTilesLoaded(true);
      }
    },
    [onMapReady],
  );

  const recoverMapStall = useCallback(() => {
    resetRealmMapTilesReady();
    tilesReadyRef.current = false;
    setTilesLoaded(false);
    markRealmMapStep("visibility-resize", { recovered: true });
  }, []);

  useEffect(() => {
    if (!isActive) {
      sessionStartedRef.current = false;
      return undefined;
    }
    if (!sessionStartedRef.current) {
      beginRealmMapSession();
      sessionStartedRef.current = true;
    }
    void loadGoogleMapsApiOnce().catch(() => {
      resetGoogleMapsApiLoadPromise();
    });
    if (isRealmMapTilesReady()) {
      markTilesReady("session-cache");
    }
    return () => {
      clearRealmMapWatchdog();
    };
  }, [isActive, markTilesReady]);

  const toggleMapLayer = useCallback(() => {
    setMapLayer((prev) => (prev === "campus" ? "satellite" : "campus"));
  }, []);

  useEffect(() => () => document.documentElement.removeAttribute("data-realm-map-panning"), []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  const visibleLandmarkCount = useMemo(() => {
    if (editMode) return landmarks.length;
    return landmarks.filter((l) => landmarkMatchesFilter(l, filter)).length;
  }, [landmarks, editMode, filter]);

  const visibleGroupCount = useMemo(() => {
    if (editMode) return 0;
    return supplementaryPins.filter(
      (group) => mapLocationActivityCount(group) > 0 && groupMatchesFilter(group, filter),
    ).length;
  }, [supplementaryPins, editMode, filter]);

  const noMarkersVisible =
    markersLoaded && tilesLoaded && !editMode && visibleLandmarkCount === 0 && visibleGroupCount === 0;

  const handleMapClick = useCallback(
    (event: { detail: { latLng: { lat: number; lng: number } | null } }) => {
      if (!editMode || !editorSelectedId) return;
      const latLng = event.detail.latLng;
      if (!latLng) return;
      onMarkerGeoChange(editorSelectedId, latLng.lat, latLng.lng);
    },
    [editMode, editorSelectedId, onMarkerGeoChange],
  );

  const directionsActive = Boolean(directionsRequest);

  const handleDirectionsLoaded = useCallback(
    (result: RealmDirectionsLoadResult & { ok: true }) => {
      onDirectionsLoaded?.(result);
    },
    [onDirectionsLoaded],
  );

  const handleDirectionsError = useCallback(
    (result: RealmDirectionsLoadResult & { ok: false }) => {
      onDirectionsError?.(result);
    },
    [onDirectionsError],
  );

  if (apiError) {
    return (
      <div className="cq-realm-map-loading" role="alert">
        <AlertTriangle className="h-6 w-6 text-amber-300" strokeWidth={1.75} aria-hidden />
        <p className="cq-realm-map-loading-title">The campus map could not load.</p>
        <p className="cq-realm-map-loading-copy">Check your connection and Google Maps key, then reload the app.</p>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      onLoad={() => {
        markGoogleMapsApiReady();
        markRealmMapStep("api-load");
      }}
      onError={() => {
        resetGoogleMapsApiLoadPromise();
        resetRealmMapTilesReady();
        tilesReadyRef.current = false;
        setApiError(true);
      }}
    >
      <div
        ref={surfaceRef}
        className={`absolute inset-0 cq-realm-map-surface${tilesLoaded ? " cq-realm-map-surface--ready" : ""}`}
      >
        <Map
          className="h-full w-full cq-realm-map-canvas"
          /* Vector Map ID enables raised 3D buildings — inline styles apply only without mapId. */
          mapId={useVectorMapId ? REALM_GOOGLE_MAP_ID : undefined}
          colorScheme={useVectorMapId ? ColorScheme.DARK : undefined}
          styles={useVectorMapId ? undefined : mapLayer === "campus" ? CQ_REALM_MAP_STYLE : undefined}
          mapTypeId={mapLayer === "campus" ? URI_MAP_TYPE_ID : "satellite"}
          defaultCenter={URI_MAP_CENTER}
          defaultZoom={URI_MAP_DEFAULT_ZOOM}
          defaultTilt={vector3dEnabled && mapLayer === "campus" ? URI_MAP_CINEMATIC_TILT : 0}
          defaultHeading={0}
          minZoom={URI_MAP_MIN_ZOOM}
          maxZoom={URI_MAP_MAX_ZOOM}
          gestureHandling="greedy"
          rotateControl
          disableDefaultUI
          clickableIcons={false}
          backgroundColor={MAP_BACKGROUND}
          reuseMaps
          onTilesLoaded={() => markTilesReady("onTilesLoaded")}
          onDragstart={() => document.documentElement.toggleAttribute("data-realm-map-panning", true)}
          onDragend={() => document.documentElement.removeAttribute("data-realm-map-panning")}
          onClick={handleMapClick}
        >
          <RealmMapReadyProbe onReady={markTilesReady} />
          <RealmMapVisibilityHandler visible={isActive} onRecoverStall={recoverMapStall} />
          <RealmMapFlyTo target={flyToTarget} enabled={flyToEnabled && isActive} />
          <RealmMapContainerObserver surfaceRef={surfaceRef} />
          <RealmMapCameraBootstrap
            mapLayer={mapLayer}
            vector3dEnabled={vector3dEnabled}
            tilesLoaded={tilesLoaded}
            onTiltUnsupported={() =>
              showNotice("3D buildings aren't available on this device — showing flat view.")
            }
          />

          <RealmMapMarkers
            landmarks={landmarks}
            geoPositions={geoPositions}
            supplementaryPins={supplementaryPins}
            activeMarkerId={activeMarkerId}
            trackedPathDestination={trackedPathDestination}
            directionsActive={directionsActive}
            editMode={editMode}
            editorSelectedId={editorSelectedId}
            filter={filter}
            userPos={userPos}
            markersReveal={tilesLoaded && markersLoaded}
            onTapLandmark={onTapLandmark}
            onTapSupplementary={onTapSupplementary}
            onSelectEditorMarker={onSelectEditorMarker}
            onMarkerGeoChange={onMarkerGeoChange}
          />

          <RealmDirectionsOverlay
            request={directionsRequest}
            enabled={!editMode && directionsActive}
            onLoaded={handleDirectionsLoaded}
            onError={handleDirectionsError}
          />

          <MapActionButtons
            onDenied={showNotice}
            onUserLocation={setUserPos}
            userPos={userPos}
            mapLayer={mapLayer}
            onToggleMapLayer={toggleMapLayer}
            immersive={immersive}
            vector3dEnabled={vector3dEnabled}
          />

          {!editMode ? (
            <MapControl position={ControlPosition.TOP_CENTER}>
              <div
                className={`cq-realm-map-filter${immersive ? " cq-realm-map-filter--immersive" : ""}${
                  tilesLoaded ? " cq-realm-map-filter--entered" : ""
                }`}
                role="group"
                aria-label="Map marker filters"
              >
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFilter(opt.id)}
                    aria-pressed={filter === opt.id}
                    className={`cq-realm-map-filter-chip touch-manipulation${
                      filter === opt.id ? " cq-realm-map-filter-chip--active" : ""
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </MapControl>
          ) : null}

          {editMode ? (
            <MapControl position={ControlPosition.TOP_CENTER}>
              <p className="cq-realm-map-edit-hint mt-3">
                Drag a pin — or select one, then tap the map to place it. Save from the marker editor.
              </p>
            </MapControl>
          ) : null}

          {tilesLoaded && !markersLoaded ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <p className="cq-realm-map-toast mb-4">Loading markers…</p>
            </MapControl>
          ) : null}

          {noMarkersVisible ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <div className="cq-realm-map-toast cq-realm-map-toast--empty mb-4 flex items-center gap-1.5">
                <MapPinOff className="h-3.5 w-3.5" aria-hidden />
                {filter === "all" ? "No markers found right now." : "Nothing matches this filter right now."}
              </div>
            </MapControl>
          ) : null}

          {notice ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <p className="cq-realm-map-toast mb-4" role="status">
                {notice}
              </p>
            </MapControl>
          ) : null}
        </Map>

        {!tilesLoaded ? (
          <div className="cq-realm-map-loading absolute inset-0 z-[4]" aria-busy="true">
            <span className="cq-realm-map-spinner" aria-hidden />
            <p className="cq-realm-map-loading-copy">Loading campus map…</p>
          </div>
        ) : null}
      </div>
    </APIProvider>
  );
}
