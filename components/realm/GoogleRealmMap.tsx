"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  ControlPosition,
  Map,
  MapControl,
  useMap,
} from "@vis.gl/react-google-maps";
import { AlertTriangle, LocateFixed, MapPinOff } from "lucide-react";
import type { RealmLocationId } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount } from "@/lib/mapLocationGroups";
import { CAMPUS_QUEST_MAP_BACKGROUND, CAMPUS_QUEST_MAP_STYLES } from "@/lib/realm/campusQuestMapStyle";
import { CampusQuestMapMarker } from "./CampusQuestMapMarker";

/** URI Kingston campus. */
export const URI_MAP_CENTER = { lat: 41.4862, lng: -71.5309 };
export const URI_MAP_DEFAULT_ZOOM = 16;

export type GoogleRealmMapLandmark = {
  id: RealmLocationId;
  name: string;
  shortLabel: string;
  markerEmoji: string;
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

/** Dominant pin style for a non-landmark activity group. */
function groupPinKind(group: GroupedMapLocation): "qr" | "quest" | "event" {
  if (group.qrCodes.length > 0) return "qr";
  if (group.quests.length > 0) return "quest";
  return "event";
}

const GROUP_PIN_EMOJI: Record<"qr" | "quest" | "event", string> = {
  qr: "📷",
  quest: "⚔️",
  event: "📅",
};

const LandmarkMarkerContent = memo(function LandmarkMarkerContent({
  landmark,
  active,
  editMode,
  editorSelected,
}: {
  landmark: GoogleRealmMapLandmark;
  active: boolean;
  editMode: boolean;
  editorSelected: boolean;
}) {
  const hasQuests = landmark.activeQuests > 0;
  const hasMoments = landmark.activeMomentCount > 0;
  return (
    <div
      className={`cq-gmap-pin${active ? " cq-gmap-pin--active" : ""}${
        hasQuests && !editMode ? " cq-gmap-pin--quest" : ""
      }${hasMoments && !editMode ? " cq-gmap-pin--moments" : ""}${
        editMode ? " cq-gmap-pin--editable" : ""
      }${editorSelected ? " cq-gmap-pin--selected" : ""}`}
      data-map-marker="true"
      data-no-drawer-swipe="true"
    >
      {hasQuests && !editMode ? <span className="cq-gmap-pin-quest-glow" aria-hidden /> : null}
      {hasMoments && !editMode ? <span className="cq-gmap-pin-moments-glow" aria-hidden /> : null}
      <span className="cq-gmap-pin-dot" aria-hidden>
        <span className="cq-gmap-pin-emoji">{landmark.markerEmoji}</span>
      </span>
      <span className="cq-gmap-pin-label">{landmark.shortLabel}</span>
    </div>
  );
});

const GroupMarkerContent = memo(function GroupMarkerContent({
  group,
  active,
}: {
  group: GroupedMapLocation;
  active: boolean;
}) {
  const kind = groupPinKind(group);
  return (
    <div
      className={`cq-gmap-pin cq-gmap-pin--${kind}${active ? " cq-gmap-pin--active" : ""}`}
      data-map-marker="true"
      data-no-drawer-swipe="true"
    >
      {kind === "quest" ? <span className="cq-gmap-pin-quest-glow" aria-hidden /> : null}
      <span className="cq-gmap-pin-dot" aria-hidden>
        <span className="cq-gmap-pin-emoji">{GROUP_PIN_EMOJI[kind]}</span>
      </span>
      <span className="cq-gmap-pin-label">{group.locationName}</span>
    </div>
  );
});

function MapActionButtons({ onDenied }: { onDenied: (message: string) => void }) {
  const map = useMap();
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
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
        setUserPos(next);
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
  }, [map, onDenied]);

  const recenter = useCallback(() => {
    map?.panTo(URI_MAP_CENTER);
    map?.setZoom(URI_MAP_DEFAULT_ZOOM);
  }, [map]);

  return (
    <>
      <MapControl position={ControlPosition.RIGHT_BOTTOM}>
        <div className="mb-3 mr-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="realm-map-reset-btn flex h-10 w-10 items-center justify-center rounded-xl touch-manipulation disabled:opacity-60"
            aria-label="Center map on my location"
            title="My location"
          >
            <LocateFixed className={`h-[18px] w-[18px] ${locating ? "animate-pulse" : ""}`} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={recenter}
            className="realm-map-reset-btn flex h-10 w-10 items-center justify-center rounded-xl touch-manipulation"
            aria-label="Recenter on campus"
            title="Recenter on campus"
          >
            <span className="text-base leading-none" aria-hidden>
              🐏
            </span>
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

export function GoogleRealmMap({
  apiKey,
  landmarks,
  geoPositions,
  supplementaryPins,
  markersLoaded,
  activeMarkerId,
  editMode,
  editorSelectedId,
  onTapLandmark,
  onTapSupplementary,
  onSelectEditorMarker,
  onMarkerGeoChange,
  onMapReady,
}: {
  apiKey: string;
  landmarks: GoogleRealmMapLandmark[];
  geoPositions: Record<RealmLocationId, { lat: number; lng: number }>;
  supplementaryPins: GroupedMapLocation[];
  markersLoaded: boolean;
  activeMarkerId: string | null;
  editMode: boolean;
  editorSelectedId: RealmLocationId | null;
  onTapLandmark: (id: RealmLocationId) => void;
  onTapSupplementary: (group: GroupedMapLocation) => void;
  onSelectEditorMarker: (id: RealmLocationId) => void;
  onMarkerGeoChange: (id: RealmLocationId, lat: number, lng: number) => void;
  onMapReady?: () => void;
}) {
  const [filter, setFilter] = useState<MapMarkerFilter>("all");
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => () => document.documentElement.removeAttribute("data-realm-map-panning"), []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

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

  const noMarkersVisible =
    markersLoaded && tilesLoaded && !editMode && visibleLandmarks.length === 0 && visibleGroups.length === 0;

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
      <div className="cq-gmap-state" role="alert">
        <AlertTriangle className="h-6 w-6 text-amber-300" strokeWidth={1.75} aria-hidden />
        <p className="cq-gmap-state-title">The campus map could not load.</p>
        <p className="cq-gmap-state-copy">Check your connection and Google Maps key, then reload the app.</p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} onError={() => setApiError(true)}>
      <div className="absolute inset-0">
        <Map
          className="h-full w-full"
          defaultCenter={URI_MAP_CENTER}
          defaultZoom={URI_MAP_DEFAULT_ZOOM}
          minZoom={14}
          maxZoom={20}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          styles={CAMPUS_QUEST_MAP_STYLES}
          backgroundColor={CAMPUS_QUEST_MAP_BACKGROUND}
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
          {visibleLandmarks.map((landmark) => {
            const pos = geoPositions[landmark.id];
            if (!pos) return null;
            return (
              <CampusQuestMapMarker
                key={landmark.id}
                position={pos}
                zIndex={activeMarkerId === landmark.id || editorSelectedId === landmark.id ? 30 : 20}
                draggable={editMode}
                onClick={() => {
                  if (editMode) {
                    onSelectEditorMarker(landmark.id);
                    return;
                  }
                  onTapLandmark(landmark.id);
                }}
                onDragEnd={(lat, lng) => {
                  onSelectEditorMarker(landmark.id);
                  onMarkerGeoChange(landmark.id, lat, lng);
                }}
              >
                <LandmarkMarkerContent
                  landmark={landmark}
                  active={activeMarkerId === landmark.id}
                  editMode={editMode}
                  editorSelected={editorSelectedId === landmark.id}
                />
              </CampusQuestMapMarker>
            );
          })}

          {visibleGroups.map((group) =>
            group.lat != null && group.lng != null ? (
              <CampusQuestMapMarker
                key={group.groupKey}
                position={{ lat: group.lat, lng: group.lng }}
                zIndex={activeMarkerId === group.groupKey ? 30 : 10}
                onClick={() => onTapSupplementary(group)}
              >
                <GroupMarkerContent group={group} active={activeMarkerId === group.groupKey} />
              </CampusQuestMapMarker>
            ) : null,
          )}

          <MapActionButtons onDenied={showNotice} />

          {!editMode ? (
            <MapControl position={ControlPosition.TOP_CENTER}>
              <div className="cq-gmap-filter-bar mt-3" role="group" aria-label="Map marker filters">
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFilter(opt.id)}
                    aria-pressed={filter === opt.id}
                    className={`cq-gmap-filter-chip touch-manipulation${
                      filter === opt.id ? " cq-gmap-filter-chip--active" : ""
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
              <p className="cq-gmap-edit-hint mt-3">
                Drag a pin — or select one, then tap the map to place it. Save from the marker editor.
              </p>
            </MapControl>
          ) : null}

          {tilesLoaded && !markersLoaded ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <p className="cq-gmap-toast mb-4">Loading markers…</p>
            </MapControl>
          ) : null}

          {noMarkersVisible ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <div className="cq-gmap-toast cq-gmap-toast--empty mb-4 flex items-center gap-1.5">
                <MapPinOff className="h-3.5 w-3.5" aria-hidden />
                {filter === "all" ? "No markers found right now." : "Nothing matches this filter right now."}
              </div>
            </MapControl>
          ) : null}

          {notice ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <p className="cq-gmap-toast mb-4" role="status">
                {notice}
              </p>
            </MapControl>
          ) : null}
        </Map>

        {!tilesLoaded ? (
          <div className="cq-gmap-state cq-gmap-state--overlay" aria-busy="true">
            <span className="cq-gmap-spinner" aria-hidden />
            <p className="cq-gmap-state-copy">Loading campus map…</p>
          </div>
        ) : null}
      </div>
    </APIProvider>
  );
}
