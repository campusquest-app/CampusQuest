"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  ControlPosition,
  Map,
  MapControl,
  useMap,
} from "@vis.gl/react-google-maps";
import { AlertTriangle, Compass, Layers, LocateFixed, MapPinOff } from "lucide-react";
import type { RealmLocationId } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount } from "@/lib/mapLocationGroups";
import { CQ_REALM_MAP_BACKGROUND, CQ_REALM_MAP_STYLE } from "@/lib/realm/campusQuestMapStyles";
import {
  URI_MAP_CENTER,
  URI_MAP_DEFAULT_ZOOM,
  URI_MAP_MAX_ZOOM,
  URI_MAP_MIN_ZOOM,
  URI_MAP_TYPE_ID,
  resetFlatMapOrientation,
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
import { RealmMapMarker } from "./RealmMapMarker";
import { markerRevealOpacity, useMapZoom } from "./useMapZoom";

const MAP_BACKGROUND = CQ_REALM_MAP_BACKGROUND;

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
}: {
  onDenied: (message: string) => void;
  onUserLocation: (pos: { lat: number; lng: number } | null) => void;
  userPos: { lat: number; lng: number } | null;
  mapLayer: "campus" | "satellite";
  onToggleMapLayer: () => void;
  immersive?: boolean;
}) {
  const map = useMap();
  const [locating, setLocating] = useState(false);

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
        if ((map?.getZoom() ?? 0) < 16) map?.setZoom(17);
      },
      () => {
        setLocating(false);
        onDenied("Location permission was denied — you can still explore the map.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }, [map, onDenied, onUserLocation]);

  const resetNorth = useCallback(() => {
    if (!map) return;
    resetFlatMapOrientation(map);
  }, [map]);

  const toggleLayer = useCallback(() => {
    const goingCampus = mapLayer === "satellite";
    onToggleMapLayer();
    if (goingCampus && map) {
      map.panTo(URI_MAP_CENTER);
      map.setZoom(URI_MAP_DEFAULT_ZOOM);
      resetFlatMapOrientation(map);
    }
  }, [map, mapLayer, onToggleMapLayer]);

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
            onClick={resetNorth}
            className="cq-realm-float-btn flex h-11 w-11 items-center justify-center touch-manipulation"
            aria-label="Reset map to north-up"
            title="Reset to north-up"
          >
            <Compass className="h-[18px] w-[18px]" strokeWidth={2.2} />
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

function RealmMapMarkers({
  landmarks,
  geoPositions,
  supplementaryPins,
  activeMarkerId,
  trackedPathDestination,
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
        enabled={!editMode && Boolean(trackedPathDestination && trackedDestination)}
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
}) {
  const [apiError, setApiError] = useState(false);
  const [filter, setFilter] = useState<MapMarkerFilter>("all");
  const [mapLayer, setMapLayer] = useState<"campus" | "satellite">("campus");
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

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
    <APIProvider apiKey={apiKey} onError={() => setApiError(true)}>
      <div className={`absolute inset-0 cq-realm-map-surface${tilesLoaded ? " cq-realm-map-surface--ready" : ""}`}>
        <Map
          className="h-full w-full cq-realm-map-canvas"
          styles={mapLayer === "campus" ? CQ_REALM_MAP_STYLE : undefined}
          mapTypeId={mapLayer === "campus" ? URI_MAP_TYPE_ID : "satellite"}
          defaultCenter={URI_MAP_CENTER}
          defaultZoom={URI_MAP_DEFAULT_ZOOM}
          defaultTilt={0}
          defaultHeading={0}
          minZoom={URI_MAP_MIN_ZOOM}
          maxZoom={URI_MAP_MAX_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          backgroundColor={MAP_BACKGROUND}
          reuseMaps
          onTilesLoaded={() => {
            setTilesLoaded((prev) => {
              if (!prev) onMapReady?.();
              return true;
            });
          }}
          onDragstart={() => document.documentElement.toggleAttribute("data-realm-map-panning", true)}
          onDragend={() => document.documentElement.removeAttribute("data-realm-map-panning")}
          onClick={handleMapClick}
        >
          <RealmMapMarkers
            landmarks={landmarks}
            geoPositions={geoPositions}
            supplementaryPins={supplementaryPins}
            activeMarkerId={activeMarkerId}
            trackedPathDestination={trackedPathDestination}
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

          <MapActionButtons
            onDenied={showNotice}
            onUserLocation={setUserPos}
            userPos={userPos}
            mapLayer={mapLayer}
            onToggleMapLayer={toggleMapLayer}
            immersive={immersive}
          />

          {!editMode ? (
            <MapControl position={ControlPosition.TOP_CENTER}>
              <div
                className={`cq-realm-map-filter${immersive && tilesLoaded ? " cq-realm-map-filter--entered" : ""}`}
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
