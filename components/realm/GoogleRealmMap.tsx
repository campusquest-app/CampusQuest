"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  APIProvider,
  ColorScheme,
  ControlPosition,
  Map,
  MapControl,
  useMap,
} from "@vis.gl/react-google-maps";
import { AlertTriangle, MapPinOff } from "lucide-react";
import type { RealmLocationId } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount } from "@/lib/mapLocationGroups";
import type { UrinvolvedEditPin } from "@/lib/realm/urinvolvedEditPins";
import { CQ_REALM_MAP_BACKGROUND, CQ_REALM_MAP_STYLE } from "@/lib/realm/campusQuestMapStyles";
import {
  isRealmVector3dEnabled,
  REALM_GOOGLE_MAP_ID,
  warnIfRealmMapIdMissing,
} from "@/lib/realm/googleMapConfig";
import {
  URI_MAP_CENTER,
  URI_MAP_MAX_ZOOM,
  URI_MAP_MIN_ZOOM,
  URI_MAP_TYPE_ID,
} from "@/lib/realm/googleMapPose";
import { vibrateMapMarkerTap } from "@/lib/realm/mapMarkerHaptic";
import { markUserCameraInteraction } from "@/lib/realm/mapCameraGuard";
import { useUserGeolocation } from "@/lib/client/useUserGeolocation";
import type { MapSearchResult } from "@/lib/realm/mapAutocomplete";
import {
  assignVisibleMarkerColors,
  markerColorHintFromVariant,
  type MarkerPaletteColor,
} from "@/lib/realm/markerColorPalette";
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
import { RealmMapCameraDebugHud } from "./RealmMapCameraDebugHud";
import { RealmMapCameraGestures } from "./RealmMapCameraGestures";
import { RealmMapChromePadding } from "./RealmMapChromePadding";
import { RealmMapControls } from "./RealmMapControls";
import { RealmMapFirstOpenCamera } from "./RealmMapFirstOpenCamera";
import { RealmMapSearch } from "./RealmMapSearch";
import { RealmWelcomeCard } from "./RealmWelcomeCard";
import { RealmUserLocationMarker } from "./RealmUserLocationMarker";
import { RealmOpportunitiesBanner } from "./RealmOpportunitiesBanner";
import { useRealmMapDiscovery } from "./useRealmMapDiscovery";
import { RealmMapVectorInit } from "./RealmMapVectorInit";
import { MagicalParticleLayer } from "./MagicalParticleLayer";
import { RealmAura } from "./RealmAura";
import { RealmRaisedBuildingsOverlay } from "./RealmRaisedBuildingsOverlay";
import { RealmMapMarker } from "./RealmMapMarker";
import { markerRevealOpacity, markerZoomTier, useMapZoom } from "./useMapZoom";
import { useNow } from "@/lib/client/useNow";
import { getGroupCountdown, type GroupCountdown } from "@/lib/realm/eventCountdown";
import type { RealmDirectionsRequest } from "@/lib/realm/realmDirectionsTypes";
import {
  REALM_HEART_OF_CAMPUS,
  discoveryPriorityScore,
  distanceMeters,
  hasSeenRealmWelcome,
  markRealmWelcomeSeen,
} from "@/lib/realm/realmFirstOpen";
import { resetUserCameraInteraction } from "@/lib/realm/mapCameraGuard";
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
import { RealmMapExploreModeController } from "./RealmMapExploreModeController";
import { RealmMapVectorDiagnostics } from "./RealmMapVectorDiagnostics";
import { clearMapExploring } from "@/lib/client/realmMapExploreMode";

const MAP_BACKGROUND = CQ_REALM_MAP_BACKGROUND;
const REALM_VECTOR_3D_ENABLED = isRealmVector3dEnabled();
const REALM_CAMERA_DEBUG = process.env.NODE_ENV === "development";

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

/** NEXT_PUBLIC_DEBUG_MAP_MAGIC=true forces event marker visuals + debug logs. */
const MAP_MAGIC_DEBUG = process.env.NEXT_PUBLIC_DEBUG_MAP_MAGIC === "true";

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

function RealmMapInstanceRef({ mapRef }: { mapRef: MutableRefObject<google.maps.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map ?? null;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
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

function resolveDiscoveryForMarker(
  markerId: string,
  nearest: { markerId: string; label: string; mode: "nearest" | "spotlight" } | null,
  spotlight: { markerId: string; label: string; mode: "nearest" | "spotlight" } | null,
  labelsHidden: boolean,
): { mode: "nearest" | "spotlight" | null; label: string | null } {
  if (labelsHidden) return { mode: null, label: null };
  if (spotlight?.markerId === markerId) {
    return { mode: "spotlight", label: spotlight.label };
  }
  if (nearest?.markerId === markerId) {
    return { mode: "nearest", label: nearest.label };
  }
  return { mode: null, label: null };
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
  discoveryCenter = null,
  markersReveal = false,
  discoveryNearest = null,
  discoverySpotlight = null,
  discoveryLabelsHidden = false,
  onTapLandmark,
  onTapSupplementary,
  onSelectEditorMarker,
  onMarkerGeoChange,
  urinvolvedEditPins = [],
  selectedUrinvolvedEventId = null,
  onSelectUrinvolvedEvent,
  onUrinvolvedEventDragEnd,
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
  /** Camera/discovery focus — nearby + active content reveal first. */
  discoveryCenter?: { lat: number; lng: number } | null;
  markersReveal?: boolean;
  discoveryNearest?: { markerId: string; label: string; mode: "nearest" | "spotlight" } | null;
  discoverySpotlight?: { markerId: string; label: string; mode: "nearest" | "spotlight" } | null;
  discoveryLabelsHidden?: boolean;
  onTapLandmark: (id: RealmLocationId) => void;
  onTapSupplementary: (group: GroupedMapLocation) => void;
  onSelectEditorMarker: (id: RealmLocationId) => void;
  onMarkerGeoChange: (id: RealmLocationId, lat: number, lng: number) => void;
  urinvolvedEditPins?: UrinvolvedEditPin[];
  selectedUrinvolvedEventId?: string | null;
  onSelectUrinvolvedEvent?: (externalEventId: string) => void;
  onUrinvolvedEventDragEnd?: (externalEventId: string, lat: number, lng: number) => void;
}) {
  const mapZoom = useMapZoom();
  const zoomTier = markerZoomTier(mapZoom);
  const markersLoggedRef = useRef(false);
  // One shared 30s clock drives every marker countdown — no per-marker timers.
  const now = useNow(30_000, !editMode);

  useEffect(() => {
    if (!markersReveal || markersLoggedRef.current) return;
    markersLoggedRef.current = true;
    markRealmMapStep("marker-creation", {
      landmarks: landmarks.length,
      supplementary: supplementaryPins.length,
    });
  }, [markersReveal, landmarks.length, supplementaryPins.length]);

  // Note: keyed object (not Map) — the global Map constructor is shadowed by
  // the vis.gl <Map> component import in this file.
  const countdownByGroup = useMemo<Record<string, GroupCountdown>>(() => {
    if (editMode) return {};
    const result: Record<string, GroupCountdown> = {};
    for (const landmark of landmarks) {
      const countdown = getGroupCountdown(landmark.mapContent?.events ?? [], now);
      if (countdown) result[landmark.id] = countdown;
    }
    for (const group of supplementaryPins) {
      const countdown = getGroupCountdown(group.events, now);
      if (countdown) result[group.groupKey] = countdown;
    }
    return result;
  }, [editMode, landmarks, supplementaryPins, now]);

  const visibleLandmarks = useMemo(() => {
    const origin = discoveryCenter ?? userPos ?? REALM_HEART_OF_CAMPUS;
    const base = editMode ? landmarks : landmarks.filter((l) => landmarkMatchesFilter(l, filter));
    // Never blank: if a filter empties the map, keep major landmarks as anchors.
    const list =
      !editMode && base.length === 0 ? landmarks.filter((l) => l.major) : base;

    return [...list].sort((a, b) => {
      const posA = geoPositions[a.id] ?? REALM_HEART_OF_CAMPUS;
      const posB = geoPositions[b.id] ?? REALM_HEART_OF_CAMPUS;
      const scoreA = discoveryPriorityScore({
        hasEvents: (a.mapContent?.events.length ?? 0) > 0 || a.upcomingEvents > 0,
        hasQuests: (a.mapContent?.quests.length ?? 0) > 0 || a.activeQuests > 0,
        hasMemories: a.activeMomentCount > 0,
        major: a.major,
        distanceM: distanceMeters(origin, posA),
      });
      const scoreB = discoveryPriorityScore({
        hasEvents: (b.mapContent?.events.length ?? 0) > 0 || b.upcomingEvents > 0,
        hasQuests: (b.mapContent?.quests.length ?? 0) > 0 || b.activeQuests > 0,
        hasMemories: b.activeMomentCount > 0,
        major: b.major,
        distanceM: distanceMeters(origin, posB),
      });
      return scoreB - scoreA;
    });
  }, [landmarks, editMode, filter, discoveryCenter, userPos, geoPositions]);

  const visibleGroups = useMemo(() => {
    const origin = discoveryCenter ?? userPos ?? REALM_HEART_OF_CAMPUS;
    if (editMode) return [];
    const filtered = supplementaryPins.filter(
      (group) => mapLocationActivityCount(group) > 0 && groupMatchesFilter(group, filter),
    );
    return [...filtered].sort((a, b) => {
      const posA = { lat: a.lat ?? origin.lat, lng: a.lng ?? origin.lng };
      const posB = { lat: b.lat ?? origin.lat, lng: b.lng ?? origin.lng };
      const scoreA = discoveryPriorityScore({
        hasEvents: a.events.length > 0,
        hasQuests: a.quests.length > 0,
        hasMemories: false,
        major: false,
        distanceM: distanceMeters(origin, posA),
      });
      const scoreB = discoveryPriorityScore({
        hasEvents: b.events.length > 0,
        hasQuests: b.quests.length > 0,
        hasMemories: false,
        major: false,
        distanceM: distanceMeters(origin, posB),
      });
      return scoreB - scoreA;
    });
  }, [supplementaryPins, editMode, filter, discoveryCenter, userPos]);

  const markerColors = useMemo(() => {
    const origin = discoveryCenter ?? userPos ?? REALM_HEART_OF_CAMPUS;
    const entries: Array<{
      id: string;
      lat: number;
      lng: number;
      hint: ReturnType<typeof markerColorHintFromVariant>;
      preferGold: boolean;
      distanceM: number;
    }> = [];

    for (const landmark of visibleLandmarks) {
      const pos = geoPositions[landmark.id] ?? REALM_HEART_OF_CAMPUS;
      const variant = resolveLandmarkMarkerVariant(landmark);
      entries.push({
        id: landmark.id,
        lat: pos.lat,
        lng: pos.lng,
        hint: markerColorHintFromVariant(variant),
        preferGold: false,
        distanceM: distanceMeters(origin, pos),
      });
    }
    for (const group of visibleGroups) {
      if (group.lat == null || group.lng == null) continue;
      const variant = resolveGroupMarkerVariant(group);
      entries.push({
        id: group.groupKey,
        lat: group.lat,
        lng: group.lng,
        hint: markerColorHintFromVariant(variant),
        preferGold: false,
        distanceM: distanceMeters(origin, { lat: group.lat, lng: group.lng }),
      });
    }

    // Gold reserved for the closest opportunity-bearing marker when possible.
    const withContent = entries
      .filter((e) => {
        const landmark = visibleLandmarks.find((l) => l.id === e.id);
        if (landmark) {
          return (
            (landmark.mapContent?.quests.length ?? 0) > 0 ||
            (landmark.mapContent?.events.length ?? 0) > 0 ||
            landmark.upcomingEvents > 0 ||
            landmark.activeMomentCount > 0 ||
            (landmark.mapContent?.qrCodes.length ?? 0) > 0
          );
        }
        const group = visibleGroups.find((g) => g.groupKey === e.id);
        return Boolean(group && mapLocationActivityCount(group) > 0);
      })
      .sort((a, b) => a.distanceM - b.distanceM);
    if (withContent[0]) withContent[0].preferGold = true;

    return assignVisibleMarkerColors(entries);
  }, [visibleLandmarks, visibleGroups, geoPositions, discoveryCenter, userPos]);

  function colorFor(id: string): MarkerPaletteColor {
    return markerColors.get(id) ?? "electric-blue";
  }

  function landmarkOpportunityCount(landmark: GoogleRealmMapLandmark): number {
    const content = landmark.mapContent;
    return (
      (content?.quests.length ?? 0) +
      (content?.events.length ?? 0) +
      (content?.qrCodes.length ?? 0) +
      Math.max(0, landmark.activeMomentCount)
    );
  }

  function groupOpportunityCount(group: GroupedMapLocation): number {
    return group.quests.length + group.events.length + group.qrCodes.length;
  }

  // Dev debug panel: full pipeline summary from map data to rendered markers.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" && !MAP_MAGIC_DEBUG) return;
    const allGroups = [
      ...landmarks.map((l) => ({ key: l.id, events: l.mapContent?.events ?? [] })),
      ...supplementaryPins.map((g) => ({ key: g.groupKey, events: g.events })),
    ];
    const eventPins = allGroups.flatMap((g) => g.events);
    const externalPins = eventPins.filter((e) => e.source === "urinvolved");
    console.groupCollapsed("[cq:event-pins] map debug panel");
    console.info("total event pins loaded:", eventPins.length);
    console.info("external (URInvolved) event pins:", externalPins.length);
    console.info(
      "grouped event marker locations:",
      allGroups.filter((g) => g.events.length > 0).map((g) => `${g.key} (${g.events.length})`),
    );
    console.info(
      "countdown states:",
      Object.entries(countdownByGroup).map(([key, value]) => ({
        location: key,
        label: value.state.label,
        kind: value.state.kind,
        events: value.eventCount,
        allCancelled: value.allCancelled,
      })),
    );
    console.info(
      "visible markers:",
      visibleLandmarks.length + visibleGroups.length,
      `(landmarks ${visibleLandmarks.length}, supplementary ${visibleGroups.length}, filter "${filter}", editMode ${editMode})`,
    );
    console.groupEnd();
  }, [countdownByGroup, landmarks, supplementaryPins, visibleLandmarks, visibleGroups, filter, editMode]);

  const trackedDestination = trackedPathDestination;
  const pathOrigin = userPos ?? URI_MAP_CENTER;

  const handleLandmarkTap = useCallback(
    (id: RealmLocationId) => {
      try {
        vibrateMapMarkerTap();
        onTapLandmark(id);
      } catch (exception) {
        console.warn("[cq:realm-marker] landmark tap failed", { id, exception });
      }
    },
    [onTapLandmark],
  );

  const handleGroupTap = useCallback(
    (group: GroupedMapLocation) => {
      try {
        vibrateMapMarkerTap();
        onTapSupplementary(group);
      } catch (exception) {
        console.warn("[cq:realm-marker] group tap failed", { groupKey: group?.groupKey, exception });
      }
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
        const discovery = resolveDiscoveryForMarker(
          landmark.id,
          discoveryNearest,
          discoverySpotlight,
          discoveryLabelsHidden,
        );
        const zIndex =
          markerZIndexForActivity(activityState, editorSelectedId === landmark.id) +
          (discovery.mode === "spotlight" ? 80 : discovery.mode === "nearest" ? 40 : 0);

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
              opportunityCount={landmarkOpportunityCount(landmark)}
              color={colorFor(landmark.id)}
              zoomTier={zoomTier}
              revealOpacity={reveal}
              editMode={editMode}
              editorSelected={editorSelectedId === landmark.id}
              revealIndex={markersReveal ? index : undefined}
              countdown={countdownByGroup[landmark.id] ?? null}
              discoveryMode={discovery.mode}
              discoveryLabel={discovery.label}
            />
          </CampusQuestMapMarker>
        );
      })}

      {visibleGroups.map((group, index) => {
        if (group.lat == null || group.lng == null) return null;
        const isSelected = !editMode && activeMarkerId === group.groupKey;
        const counts = groupActivityCounts(group);
        const { state: activityState, activityCount } = getLocationActivityState(counts, isSelected);
        const discovery = resolveDiscoveryForMarker(
          group.groupKey,
          discoveryNearest,
          discoverySpotlight,
          discoveryLabelsHidden,
        );
        const zIndex =
          markerZIndexForActivity(activityState, false) +
          (discovery.mode === "spotlight" ? 80 : discovery.mode === "nearest" ? 40 : 0);

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
              opportunityCount={groupOpportunityCount(group)}
              color={colorFor(group.groupKey)}
              zoomTier={zoomTier}
              revealOpacity={markerRevealOpacity(mapZoom, false)}
              revealIndex={markersReveal ? visibleLandmarks.length + index : undefined}
              countdown={countdownByGroup[group.groupKey] ?? null}
              locationAdjusted={group.events.some((event) => event.locationManuallyAdjusted)}
              discoveryMode={discovery.mode}
              discoveryLabel={discovery.label}
            />
          </CampusQuestMapMarker>
        );
      })}

      {editMode
        ? urinvolvedEditPins.map((pin, index) => {
            const selected = selectedUrinvolvedEventId === pin.externalEventId;
            return (
              <CampusQuestMapMarker
                key={`urinvolved-edit:${pin.externalEventId}`}
                position={{ lat: pin.lat, lng: pin.lng }}
                zIndex={selected ? 4000 : 3200}
                draggable
                onClick={() => onSelectUrinvolvedEvent?.(pin.externalEventId)}
                onDragEnd={(lat, lng) => onUrinvolvedEventDragEnd?.(pin.externalEventId, lat, lng)}
              >
                <RealmMapMarker
                  variant="event"
                  label={pin.title}
                  editMode
                  editorSelected={selected}
                  locationAdjusted={pin.locationManuallyAdjusted}
                  revealIndex={markersReveal ? visibleLandmarks.length + visibleGroups.length + index : undefined}
                />
              </CampusQuestMapMarker>
            );
          })
        : null}

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
  routeSheetOpen = false,
  directionsRequest = null,
  onDirectionsLoaded,
  onDirectionsError,
  urinvolvedEditPins = [],
  selectedUrinvolvedEventId = null,
  onSelectUrinvolvedEvent,
  onUrinvolvedEventDragEnd,
  onPlaceSelected,
  searchPin = null,
  flyToForce = false,
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
  flyToForce?: boolean;
  routeSheetOpen?: boolean;
  directionsRequest?: RealmDirectionsRequest | null;
  onDirectionsLoaded?: (result: RealmDirectionsLoadResult & { ok: true }) => void;
  onDirectionsError?: (result: RealmDirectionsLoadResult & { ok: false }) => void;
  urinvolvedEditPins?: UrinvolvedEditPin[];
  selectedUrinvolvedEventId?: string | null;
  onSelectUrinvolvedEvent?: (externalEventId: string) => void;
  onUrinvolvedEventDragEnd?: (externalEventId: string, lat: number, lng: number) => void;
  onPlaceSelected?: (result: MapSearchResult) => void;
  searchPin?: { lat: number; lng: number; name: string } | null;
}) {
  const [apiError, setApiError] = useState(false);
  const filter: MapMarkerFilter = "all";
  const [mapLayer, setMapLayer] = useState<"campus" | "satellite">("campus");
  const [tilesLoaded, setTilesLoaded] = useState(() => isRealmMapTilesReady());
  const [notice, setNotice] = useState<string | null>(null);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [showFallbackBuildings, setShowFallbackBuildings] = useState(false);
  const [discoveryCenter, setDiscoveryCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [particlesReady, setParticlesReady] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const tilesReadyRef = useRef(isRealmMapTilesReady());
  const sessionStartedRef = useRef(false);
  const firstOpenDoneRef = useRef(false);
  const exploreApiRef = useRef<{ expandChrome: () => void; noteMapInteraction: () => void } | null>(null);

  useEffect(() => {
    // Build stamp on load — proves which deployment the (PWA-cached) client runs.
    console.info("[cq:build]", process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ?? "dev/unknown");
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      console.info("[cq:event-pins] prefers-reduced-motion detected — shake off, soft pulse only");
    }
  }, []);
  const vector3dEnabled = REALM_VECTOR_3D_ENABLED;
  /**
   * Keep mapId / renderingType / colorScheme STABLE for the map lifetime.
   * Toggling them with campus↔satellite recreates or reuses a different cached
   * map instance in @vis.gl/react-google-maps and injects heading:0/tilt:0 via
   * defaultTilt/defaultHeading falsy checks — which kills vector camera state.
   */
  const useVectorMapId = vector3dEnabled;

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
      firstOpenDoneRef.current = false;
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

  useEffect(() => {
    if (!tilesLoaded || editMode) return undefined;
    // Fallback so particles still activate if first-open camera is skipped.
    const timer = window.setTimeout(() => setParticlesReady(true), 1400);
    return () => window.clearTimeout(timer);
  }, [tilesLoaded, editMode]);

  const toggleMapLayer = useCallback(() => {
    setMapLayer((prev) => (prev === "campus" ? "satellite" : "campus"));
  }, []);

  useEffect(() => () => {
    document.documentElement.removeAttribute("data-realm-map-panning");
    clearMapExploring();
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  const mapRef = useRef<google.maps.Map | null>(null);
  const geolocation = useUserGeolocation({
    onFollowPan: (pos) => {
      mapRef.current?.panTo(pos);
    },
    onDenied: showNotice,
  });
  const userPos = geolocation.userPos;

  const sheetOpen = Boolean(activeMarkerId) || routeSheetOpen;
  const forceChromeExpanded =
    sheetOpen || searchActive || editMode || controlsExpanded || Boolean(directionsRequest);

  const discovery = useRealmMapDiscovery({
    enabled: isActive && !editMode,
    markersReady: tilesLoaded && markersLoaded,
    sheetOpen,
    landmarks,
    geoPositions,
    supplementaryPins,
    userPos,
    knownRouteDurationSeconds: null,
  });

  const dismissWelcome = useCallback(() => {
    setWelcomeVisible(false);
    markRealmWelcomeSeen();
  }, []);

  const onCameraResolved = discovery.onCameraResolved;
  const handleDiscoveryResolved = useCallback(
    (center: { lat: number; lng: number }) => {
      setDiscoveryCenter(center);
      onCameraResolved(center);
      // Sequence: markers → pulses → particles → welcome card.
      window.setTimeout(() => setParticlesReady(true), 420);
      window.setTimeout(() => {
        if (!hasSeenRealmWelcome()) setWelcomeVisible(true);
      }, 900);
    },
    [onCameraResolved],
  );

  const searchBuildings = useMemo(
    () =>
      landmarks
        .map((landmark) => {
          const geo = geoPositions[landmark.id];
          if (!geo) return null;
          return {
            id: landmark.id,
            name: landmark.name,
            shortLabel: landmark.shortLabel,
            address: landmark.mapContent?.locationAddress ?? null,
            lat: geo.lat,
            lng: geo.lng,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null),
    [landmarks, geoPositions],
  );

  // Dismiss welcome on first meaningful map interaction.
  useEffect(() => {
    if (!welcomeVisible) return undefined;
    const onPointer = () => dismissWelcome();
    // Delay binding so the welcome card's own mount click doesn't instantly dismiss.
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onPointer, { once: true, capture: true });
    }, 600);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [welcomeVisible, dismissWelcome]);

  const visibleLandmarkCount = useMemo(() => {
    if (editMode) return landmarks.length;
    const filtered = landmarks.filter((l) => landmarkMatchesFilter(l, filter));
    if (filtered.length > 0) return filtered.length;
    return landmarks.filter((l) => l.major).length;
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
      setControlsExpanded(false);
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

  const retryMapLoad = useCallback(() => {
    resetGoogleMapsApiLoadPromise();
    resetRealmMapTilesReady();
    tilesReadyRef.current = false;
    setTilesLoaded(false);
    setApiError(false);
    void loadGoogleMapsApiOnce().catch(() => {
      setApiError(true);
    });
  }, []);

  if (apiError) {
    return (
      <div className="cq-realm-map-loading" role="alert">
        <AlertTriangle className="h-6 w-6 text-amber-300" strokeWidth={1.75} aria-hidden />
        <p className="cq-realm-map-loading-title">The campus map could not load.</p>
        <p className="cq-realm-map-loading-copy">
          Check your connection and Google Maps key, then try again.
        </p>
        <button
          type="button"
          className="cq-realm-map-toast-action touch-manipulation mt-2"
          onClick={retryMapLoad}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={["places"]}
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
        data-cq-gesture-block="all"
        data-no-drawer-swipe="true"
      >
        <Map
          className="h-full w-full cq-realm-map-canvas"
          /* Vector Map ID enables raised 3D buildings — inline styles apply only without mapId.
           * Also set NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID on Vercel and redeploy (build-time inline).
           * Do NOT pass defaultTilt/defaultHeading — vis.gl treats 0 as falsy and re-injects
           * heading:0/tilt:0 into setOptions when reusing maps, resetting the camera. */
          mapId={useVectorMapId ? REALM_GOOGLE_MAP_ID : undefined}
          renderingType={useVectorMapId ? "VECTOR" : undefined}
          colorScheme={useVectorMapId ? ColorScheme.DARK : undefined}
          styles={useVectorMapId ? undefined : mapLayer === "campus" ? CQ_REALM_MAP_STYLE : undefined}
          mapTypeId={mapLayer === "campus" ? URI_MAP_TYPE_ID : "satellite"}
          defaultCenter={URI_MAP_CENTER}
          defaultZoom={17}
          minZoom={URI_MAP_MIN_ZOOM}
          maxZoom={URI_MAP_MAX_ZOOM}
          gestureHandling="greedy"
          rotateControl
          tiltInteractionEnabled
          headingInteractionEnabled
          zoomControl
          keyboardShortcuts
          isFractionalZoomEnabled
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          disableDefaultUI={false}
          clickableIcons={false}
          backgroundColor={MAP_BACKGROUND}
          reuseMaps
          onTilesLoaded={() => markTilesReady("onTilesLoaded")}
          onDragstart={() => document.documentElement.toggleAttribute("data-realm-map-panning", true)}
          onDragend={() => {
            document.documentElement.removeAttribute("data-realm-map-panning");
            markUserCameraInteraction();
          }}
          onClick={handleMapClick}
        >
          <RealmMapInstanceRef mapRef={mapRef} />
          <RealmMapReadyProbe onReady={markTilesReady} />
          <RealmMapVisibilityHandler visible={isActive} onRecoverStall={recoverMapStall} />
          <RealmMapExploreModeController
            enabled={isActive && tilesLoaded && !editMode}
            forceExpanded={forceChromeExpanded}
            surfaceRef={surfaceRef}
            exploreApiRef={exploreApiRef}
          />
          {/* Keep Google logo/attribution clear of dock, FABs, and CQ gradients. */}
          <RealmMapChromePadding enabled={isActive} />
          <RealmMapCameraGestures enabled={isActive && tilesLoaded} />
          <RealmMapVectorDiagnostics enabled={isActive && tilesLoaded && !editMode} />
          {REALM_CAMERA_DEBUG ? <RealmMapCameraDebugHud enabled={isActive && tilesLoaded} /> : null}
          {tilesLoaded && isActive && !editMode && !firstOpenDoneRef.current ? (
            <RealmMapFirstOpenCamera
              enabled
              locateOnce={geolocation.locateOnce}
              onResolved={(center) => {
                firstOpenDoneRef.current = true;
                handleDiscoveryResolved(center);
              }}
            />
          ) : null}
          <RealmMapFlyTo target={flyToTarget} enabled={flyToEnabled && isActive} force={flyToForce} />
          <RealmMapContainerObserver surfaceRef={surfaceRef} />
          <RealmMapVectorInit vector3dEnabled={vector3dEnabled} tilesLoaded={tilesLoaded} />
          <RealmMapCameraBootstrap
            mapLayer={mapLayer}
            vector3dEnabled={vector3dEnabled}
            tilesLoaded={tilesLoaded}
          />

          <MagicalParticleLayer
            enabled={particlesReady && tilesLoaded && mapLayer === "campus" && !editMode}
          />

          <RealmRaisedBuildingsOverlay
            enabled={showFallbackBuildings && mapLayer === "campus" && !editMode}
            landmarks={landmarks.map((landmark) => ({ id: landmark.id, major: landmark.major }))}
            geoPositions={geoPositions}
            activeMarkerId={activeMarkerId}
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
            discoveryCenter={discoveryCenter}
            markersReveal={tilesLoaded && markersLoaded}
            discoveryNearest={discovery.nearest}
            discoverySpotlight={discovery.spotlight}
            discoveryLabelsHidden={discovery.labelsHidden}
            onTapLandmark={(id) => {
              dismissWelcome();
              exploreApiRef.current?.expandChrome();
              onTapLandmark(id);
            }}
            onTapSupplementary={(group) => {
              dismissWelcome();
              exploreApiRef.current?.expandChrome();
              onTapSupplementary(group);
            }}
            onSelectEditorMarker={onSelectEditorMarker}
            onMarkerGeoChange={onMarkerGeoChange}
            urinvolvedEditPins={urinvolvedEditPins}
            selectedUrinvolvedEventId={selectedUrinvolvedEventId}
            onSelectUrinvolvedEvent={onSelectUrinvolvedEvent}
            onUrinvolvedEventDragEnd={onUrinvolvedEventDragEnd}
          />

          <RealmDirectionsOverlay
            request={directionsRequest}
            enabled={!editMode && directionsActive}
            routeSheetOpen={routeSheetOpen}
            userLocation={userPos}
            onUserLocation={geolocation.setFix}
            onLoaded={handleDirectionsLoaded}
            onError={handleDirectionsError}
          />

          {!editMode ? (
            <MapControl position={ControlPosition.TOP_CENTER}>
              <div
                className={`cq-realm-map-top-chrome${immersive ? " cq-realm-map-top-chrome--immersive" : ""}${
                  tilesLoaded ? " cq-realm-map-top-chrome--entered" : ""
                }`}
              >
                {onPlaceSelected ? (
                  <RealmMapSearch
                    buildings={searchBuildings}
                    groups={[
                      ...landmarks
                        .map((landmark) => landmark.mapContent)
                        .filter((group): group is GroupedMapLocation => Boolean(group)),
                      ...supplementaryPins,
                    ]}
                    onSelect={(result) => {
                      exploreApiRef.current?.expandChrome();
                      onPlaceSelected(result);
                    }}
                    onActiveChange={setSearchActive}
                    disabled={!tilesLoaded}
                  />
                ) : null}
                <RealmOpportunitiesBanner
                  visible={discovery.bannerVisible}
                  copy={discovery.bannerCopy}
                  onDismiss={discovery.dismissBanner}
                />
                <RealmWelcomeCard visible={welcomeVisible} onDismiss={dismissWelcome} />
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

          {geolocation.fix ? (
            <RealmUserLocationMarker
              position={{ lat: geolocation.fix.lat, lng: geolocation.fix.lng }}
              accuracyMeters={geolocation.fix.accuracy}
              heading={geolocation.fix.heading}
              showLabel={!discovery.labelsHidden}
            />
          ) : null}

          {searchPin ? (
            <CampusQuestMapMarker position={searchPin} zIndex={4500}>
              <RealmMapMarker
                variant="default"
                label={searchPin.name}
                activityState="active"
                activityCount={0}
                revealOpacity={1}
                color="gold"
                zoomTier="near"
              />
            </CampusQuestMapMarker>
          ) : null}

          <RealmMapControls
            expanded={controlsExpanded}
            onExpandedChange={setControlsExpanded}
            onDenied={showNotice}
            userPos={userPos}
            locating={geolocation.locating}
            followMode={geolocation.followMode}
            onLocate={geolocation.locateOnce}
            onToggleFollow={geolocation.toggleFollow}
            mapLayer={mapLayer}
            onToggleMapLayer={toggleMapLayer}
            immersive={immersive}
            vector3dEnabled={vector3dEnabled}
            onBuildingsOverlayChange={setShowFallbackBuildings}
            mapRef={mapRef}
          />

          {tilesLoaded && !markersLoaded ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <p className="cq-realm-map-toast">Loading markers…</p>
            </MapControl>
          ) : null}

          {noMarkersVisible ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <div className="cq-realm-map-toast cq-realm-map-toast--empty flex items-center gap-1.5">
                <MapPinOff className="h-3.5 w-3.5" aria-hidden />
                Exploring campus landmarks — check back for live quests and events.
              </div>
            </MapControl>
          ) : null}

          {notice ? (
            <MapControl position={ControlPosition.BOTTOM_CENTER}>
              <p className="cq-realm-map-toast" role="status">
                {notice}
              </p>
            </MapControl>
          ) : null}
        </Map>

        {tilesLoaded ? <RealmAura /> : null}

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
