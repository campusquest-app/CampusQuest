"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compass } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { REALM_LOCATIONS, type RealmLocation, type RealmLocationId } from "@/lib/realm/locations";
import { realmLocationsFromCatalog, type CampusLocationRecord } from "@/lib/locations/campusLocationCatalog";
import { createCampusLocationFromMarker, useCampusLocations } from "@/lib/client/campusLocationsClient";
import type { MapSearchResult } from "@/lib/realm/mapAutocomplete";
import { REALM_MAP_VIEW_HEIGHT, REALM_MAP_VIEW_WIDTH } from "@/lib/realm/mapGeometry";
import {
  applyMarkerPositionsToLocations,
  loadMarkerPositionOverrides,
  loadServerMarkerPositionsCache,
  resolveMarkerPositions,
  saveMarkerPositionOverrides,
  saveServerMarkerPositionsCache,
  type MarkerPositionMap,
} from "@/lib/realm/markerPositionsStore";
import {
  fetchRealmMarkerPositions,
  saveRealmMarkerPositionsToServer,
} from "@/lib/client/realmMarkerPositionsClient";
import { fetchCampusMemoryGroupsAndStats } from "@/lib/client/campusMemoriesClient";
import { subscribeCampusMemoriesChanged } from "@/lib/client/campusMemoriesSync";
import type { CampusMemoryGroup, CampusMemoryLocationStats } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { getCampusLocationName, isCampusLocationCatalogStale } from "@/lib/locations/registry";
import {
  createMarkerTapGate,
  getMarkerUnavailableMessage,
  normalizeGroupedMapContent,
  resolveLandmarkTap,
  resolveSupplementaryTap,
  inferMarkerKindFromGroup,
  logFailedMarkerClick,
} from "@/lib/realm/safeMarkerClick";
import { RealmMarkerErrorBoundary } from "./RealmMarkerErrorBoundary";
import { AddCampusMemorySheet } from "@/components/memories/AddCampusMemorySheet";
import { CampusMemoryViewer } from "@/components/memories/CampusMemoryViewer";
import { LocationMemoriesGallery } from "@/components/memories/LocationMemoriesGallery";
import { useGroupedMapLocations } from "@/lib/client/mapLocationGroupsClient";
import { saveUrinvolvedPlacement } from "@/lib/client/urinvolvedMapPlacementsClient";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount, mapLocationQuestCount } from "@/lib/mapLocationGroups";
import { buildUrinvolvedEditPinsFromGroups, type UrinvolvedEditPin } from "@/lib/realm/urinvolvedEditPins";
import type { SharePostTarget } from "@/lib/client/dmMessagesClient";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { geoToRealmMapPercent, realmMapPercentToGeo } from "@/lib/realm/geoToMapPercent";
import { GoogleRealmMap } from "./GoogleRealmMap";
import { RealmDiscoverySheet } from "./RealmDiscoverySheet";
import { RealmArrivalCard } from "./RealmArrivalCard";
import { RealmIntroCoach } from "./RealmIntroCoach";
import { useRecommendationProfile } from "@/lib/client/useRecommendationProfile";
import type { MapMarkerFilter } from "@/lib/realm/mapMarkerFilters";
import {
  collectMapRecommendationSources,
  findMapFocusForEvent,
  findMapFocusForLocation,
  forYouRecommendationLimit,
  mapRecommendationCounts,
  rankMapRecommendations,
  recommendationScoreBySearchId,
  recommendedMarkerIds,
  type MapRecommendationItem,
} from "@/lib/realm/mapRecommendations";
import {
  consumeRealmMapFocus,
  peekRealmMapFocus,
  campusArrivalName,
} from "@/lib/realm/firstEntry";
import type { RealmDirectionsLoadResult } from "./RealmDirectionsOverlay.types";
import { logWalkRoute } from "@/lib/realm/walkRouteLog";
import {
  buildNearbyPlaceCardsFromLandmarks,
  type DiscoverySheetSnap,
} from "@/lib/realm/discoverySheet";
import { RealmRouteSheet } from "./RealmRouteSheet";
import type {
  RealmDirectionsDestination,
  RealmDirectionsRequest,
  RealmDirectionsStatus,
  RealmTravelMode,
} from "@/lib/realm/realmDirectionsTypes";
import { RealmCampusMapLayer } from "./RealmCampusMapLayer";
import { RealmDecorLayer } from "./RealmDecorLayer";
import { RealmFootprintsLayer } from "./RealmFootprintsLayer";
import { RealmLocationSheet } from "./RealmLocationSheet";
import { RealmMarkerEditorPanel, type RealmMarkerEditorDebug } from "./RealmMarkerEditorPanel";
import { RealmPathsLayer } from "./RealmPathsLayer";
import { useRealmMapDiagnostics } from "./useRealmMapDiagnostics";
import { useMapMarkerTap } from "@/lib/client/mapMarkerTap";
import { markRealmMapStep, isRealmMapTilesReady } from "@/lib/realm/realmMapLifecycle";

function catalogRowsToRealmLocations(rows: CampusLocationRecord[]): RealmLocation[] {
  return rows.map((row) => ({
    id: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    fantasyName: row.fantasyName || row.name,
    flavorText: row.flavorText || row.description,
    markerEmoji: row.markerEmoji,
    shortLabel: row.shortLabel || row.name,
    major: row.major,
    x: row.mapX ?? 50,
    y: row.mapY ?? 50,
    activeQuests: 0,
    upcomingEvents: 0,
    studentPhotos: 0,
    quests: [],
    eventTimer: { status: "countdown" as const, minutesUntilStart: 999, label: "No scheduled events" },
    moments: [],
  }));
}
const MAP_BASE_WIDTH = 920;
const MAP_ASPECT = REALM_MAP_VIEW_WIDTH / REALM_MAP_VIEW_HEIGHT;

const GOOGLE_MAPS_API_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();

type HydratedRealmLocation = RealmLocation & {
  mapContent: GroupedMapLocation | null;
};

type SupplementaryMapPin = GroupedMapLocation & { attachToLandmark: false };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pointerToPercent(stageEl: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = stageEl.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) };
}

/** Admin calibration overlay — opt in via ?realm_calibrate=1 only. */
function useRealmCalibrationMode(): boolean {
  const [calibrate, setCalibrate] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setCalibrate(params.get("realm_calibrate") === "1");
  }, []);
  return calibrate;
}

export function RealmMap({
  onViewQuests,
  onCreatePost,
  onViewProfile,
  onSharePost,
  onOpenOrganization,
  viewer = null,
  userId = null,
  isAdmin = false,
  userRole = "student",
  immersive = false,
  isActive = true,
  personalization = null,
  showArrival = false,
  showIntro = false,
  onArrivalExplore,
  onArrivalViewFeed,
  onIntroComplete,
  onIntroSkip,
  onViewAthletics,
  onFindMyCampus,
  onViewAllRecommendations,
  onOpenNotifications,
  onOpenOwnProfile,
  unreadCount = 0,
}: {
  onViewQuests?: (location: RealmLocation) => void;
  onCreatePost?: () => void;
  onViewProfile?: (userId: string) => void;
  onSharePost?: (target: SharePostTarget) => void;
  onOpenOrganization?: (organizationId: string) => void;
  viewer?: { id: string; name: string; username: string; avatar: string } | null;
  userId?: string | null;
  isAdmin?: boolean;
  userRole?: string;
  immersive?: boolean;
  isActive?: boolean;
  personalization?: {
    schoolName?: string | null;
    institutionId?: string | null;
    interests?: string[] | null;
    communities?: string[] | null;
    studentStatus?: string | null;
    classYear?: number | null;
    major?: string | null;
    academicArea?: string | null;
  } | null;
  showArrival?: boolean;
  showIntro?: boolean;
  onArrivalExplore?: () => void;
  onArrivalViewFeed?: () => void;
  onIntroComplete?: () => void;
  onIntroSkip?: () => void;
  onViewAthletics?: () => void;
  onFindMyCampus?: () => void;
  onViewAllRecommendations?: () => void;
  onOpenNotifications?: () => void;
  onOpenOwnProfile?: () => void;
  unreadCount?: number;
}) {
  const [selectedLocation, setSelectedLocation] = useState<HydratedRealmLocation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [markerNotice, setMarkerNotice] = useState<string | null>(null);
  const markerTapGateRef = useRef(createMarkerTapGate(400));
  const markerNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [uriMapLoaded, setUriMapLoaded] = useState(() => isRealmMapTilesReady());
  const [panning, setPanning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draftPositions, setDraftPositions] = useState<MarkerPositionMap>(() => resolveMarkerPositions());
  const [editorSelectedId, setEditorSelectedId] = useState<RealmLocationId | null>(null);
  const [draggingId, setDraggingId] = useState<RealmLocationId | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [memoriesLoadError, setMemoriesLoadError] = useState<string | null>(null);
  const [memoryStatsByLocation, setMemoryStatsByLocation] = useState<Record<string, CampusMemoryLocationStats>>({});
  const [memoryViewerGroup, setMemoryViewerGroup] = useState<CampusMemoryGroup | null>(null);
  const [memoryViewerInitialId, setMemoryViewerInitialId] = useState<string | undefined>();
  const [memoryViewerIncludeExpired, setMemoryViewerIncludeExpired] = useState(false);
  const [memoryGalleryLocationId, setMemoryGalleryLocationId] = useState<CampusLocationId | null>(null);
  const [questReloadToken, setQuestReloadToken] = useState(0);
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [addMemoryLocationId, setAddMemoryLocationId] = useState<CampusLocationId>("the-quad");
  const { groups: mapGroups, loaded: mapGroupsLoaded, reload: reloadMapGroups } = useGroupedMapLocations({
    active: isActive,
  });
  const [selectedMapContent, setSelectedMapContent] = useState<GroupedMapLocation | null>(null);
  const [mapScale, setMapScale] = useState(1);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const { locations: catalogRows, reload: reloadCatalog } = useCampusLocations({ active: isActive });
  const [placingNewLocation, setPlacingNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [createLocationPending, setCreateLocationPending] = useState(false);
  const [selectedUrinvolvedEventId, setSelectedUrinvolvedEventId] = useState<string | null>(null);
  const [directionsRequest, setDirectionsRequest] = useState<RealmDirectionsRequest | null>(null);
  const [directionsStatus, setDirectionsStatus] = useState<RealmDirectionsStatus>({ status: "idle" });
  const [activeRouteDestination, setActiveRouteDestination] = useState<RealmDirectionsDestination | null>(null);
  const [isRouteSheetOpen, setIsRouteSheetOpen] = useState(false);
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [flyToForce, setFlyToForce] = useState(false);
  const [markerFilter, setMarkerFilter] = useState<MapMarkerFilter>("for_you");
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const [railFocus, setRailFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [discoverySnap, setDiscoverySnap] = useState<DiscoverySheetSnap>("default");
  const [userFix, setUserFix] = useState<{ lat: number; lng: number; accuracy?: number | null } | null>(null);
  const [userLocating, setUserLocating] = useState(true);
  const locateAttemptedRef = useRef(false);
  const recProfile = useRecommendationProfile(personalization);
  const focusSeqRef = useRef(0);
  const pendingWalkAfterFocusRef = useRef(false);
  const pendingRouteOpenRef = useRef(false);
  const routeRequestIdRef = useRef(0);
  const routeInFlightRef = useRef(false);

  const cancelInFlightRoute = useCallback(() => {
    routeInFlightRef.current = false;
    routeRequestIdRef.current += 1;
  }, []);

  const catalogRealmLocations = useMemo(
    () => (catalogRows.length > 0 ? catalogRowsToRealmLocations(catalogRows) : realmLocationsFromCatalog()),
    [catalogRows],
  );
  const calibrateMode = useRealmCalibrationMode();

  const groupsByRealmId = useMemo(() => {
    const map = new Map<string, GroupedMapLocation>();
    for (const group of mapGroups) {
      if (group.realmLocationId) map.set(group.realmLocationId, group);
    }
    return map;
  }, [mapGroups]);

  const supplementaryPins = useMemo(
    () => mapGroups.filter((group): group is SupplementaryMapPin => !group.attachToLandmark && mapLocationActivityCount(group) > 0),
    [mapGroups],
  );

  const urinvolvedEditPins = useMemo(
    () => (editMode && isAdmin ? buildUrinvolvedEditPinsFromGroups(mapGroups) : []),
    [editMode, isAdmin, mapGroups],
  );

  const handleUrinvolvedEventDragEnd = useCallback(
    async (externalEventId: string, lat: number, lng: number) => {
      try {
        await saveUrinvolvedPlacement({
          externalEventId,
          customLat: round6(lat),
          customLng: round6(lng),
          realmLocationId: null,
          matchStatus: "manually_adjusted",
        });
        setSelectedUrinvolvedEventId(externalEventId);
        setEditorSelectedId(null);
        await reloadMapGroups();
      } catch (error) {
        console.error("[cq:urinvolved-edit] drag save failed", error);
      }
    },
    [reloadMapGroups],
  );

  const locations = useMemo((): HydratedRealmLocation[] => {
    const base = applyMarkerPositionsToLocations(catalogRealmLocations, draftPositions);
    return base.map((location) => {
      const stats = memoryStatsByLocation[location.id];
      const activeMomentCount = stats?.activeCount ?? 0;
      const mapContent = groupsByRealmId.get(location.id) ?? null;
      const activeQuests = mapContent ? mapLocationQuestCount(mapContent, location.id) : 0;
      const upcomingEvents = mapContent?.events.length ?? 0;
      return {
        ...location,
        moments: [],
        activeMomentCount,
        activeQuests,
        upcomingEvents,
        quests: [],
        eventTimer:
          upcomingEvents > 0 && mapContent?.events[0]
            ? {
                status: new Date(mapContent.events[0].startsAt) <= new Date() ? ("active" as const) : ("countdown" as const),
                label: mapContent.events[0].title,
                minutesUntilStart: Math.max(
                  0,
                  Math.round((new Date(mapContent.events[0].startsAt).getTime() - Date.now()) / 60_000),
                ),
              }
            : { status: "countdown" as const, minutesUntilStart: 999, label: "No scheduled events" },
        mapContent,
      };
    });
  }, [catalogRealmLocations, draftPositions, memoryStatsByLocation, groupsByRealmId]);

  const questGlowCount = useMemo(() => locations.filter((l) => l.activeQuests > 0).length, [locations]);
  const momentGlowCount = useMemo(
    () => locations.filter((l) => (l.activeMomentCount ?? 0) > 0).length,
    [locations],
  );

  const { report } = useRealmMapDiagnostics({
    uriMapLoaded,
    calibrateMode,
    pinCount: locations.length,
    questGlowCount: questGlowCount + momentGlowCount,
    mapRootRef,
    isAdmin,
  });

  // After the map is interactive, warm today's dining menus in the background.
  useEffect(() => {
    if (!isActive || !uriMapLoaded) return;
    void import("@/lib/dining/diningMenuSessionCache").then(({ scheduleDiningMenuPrefetch }) => {
      scheduleDiningMenuPrefetch({ delayMs: 2_800 });
    });
  }, [isActive, uriMapLoaded]);

  const loadCampusMemories = useCallback(async (signal?: AbortSignal) => {
    setMemoriesLoadError(null);
    markRealmMapStep("data-fetch-start", { source: "memories" });
    try {
      const { stats } = await fetchCampusMemoryGroupsAndStats({ signal });
      if (signal?.aborted) return;
      const statsMap: Record<string, CampusMemoryLocationStats> = {};
      for (const row of stats) statsMap[row.locationId] = row;
      setMemoryStatsByLocation(statsMap);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMemoryStatsByLocation({});
      setMemoriesLoadError("Could not load campus memories for The Realm.");
    } finally {
      if (!signal?.aborted) {
        setMemoriesLoaded(true);
        markRealmMapStep("data-fetch-end", { source: "memories" });
      }
    }
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    const controller = new AbortController();
    void loadCampusMemories(controller.signal);
    return () => controller.abort();
  }, [loadCampusMemories, isActive]);

  useEffect(() => {
    if (!isActive) return undefined;
    return subscribeCampusMemoriesChanged(() => void loadCampusMemories());
  }, [loadCampusMemories, isActive]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-realm-map-panning", panning);
    return () => document.documentElement.removeAttribute("data-realm-map-panning");
  }, [panning]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-realm-map-edit", editMode);
    return () => document.documentElement.removeAttribute("data-realm-map-edit");
  }, [editMode]);

  const applyResolvedPositions = useCallback((overrides: MarkerPositionMap) => {
    setDraftPositions(resolveMarkerPositions(overrides));
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    let cancelled = false;
    const controller = new AbortController();

    const cached = loadServerMarkerPositionsCache();
    if (cached) {
      applyResolvedPositions(cached.positions);
    }

    void (async () => {
      try {
        const remote = await fetchRealmMarkerPositions({ signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        saveServerMarkerPositionsCache(remote.positions, {
          updatedAt: remote.updatedAt,
          updatedBy: remote.updatedBy,
        });
        applyResolvedPositions(remote.positions);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!cancelled && !cached) {
          applyResolvedPositions(loadMarkerPositionOverrides());
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [applyResolvedPositions, isActive]);

  const getSavedPositions = useCallback((): MarkerPositionMap => {
    const cached = loadServerMarkerPositionsCache();
    if (cached?.positions) return resolveMarkerPositions(cached.positions);
    return resolveMarkerPositions(loadMarkerPositionOverrides());
  }, []);

  const showMarkerNotice = useCallback((message: string) => {
    setMarkerNotice(message);
    if (markerNoticeTimerRef.current) clearTimeout(markerNoticeTimerRef.current);
    markerNoticeTimerRef.current = setTimeout(() => setMarkerNotice(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (markerNoticeTimerRef.current) clearTimeout(markerNoticeTimerRef.current);
    };
  }, []);

  const openLocation = useCallback(
    (location: HydratedRealmLocation) => {
      if (editMode) return;
      if (!markerTapGateRef.current.tryOpen(location.id)) return;
      try {
        if (isCampusLocationCatalogStale()) {
          void reloadCatalog();
        }
        setSelectedLocation(location);
        setSelectedMapContent(normalizeGroupedMapContent(location.mapContent));
        setActiveMarkerId(location.id);
        setSheetOpen(true);
        setMarkerNotice(null);
      } catch (exception) {
        logFailedMarkerClick({
          markerType: "landmark",
          markerId: location.id,
          source: "openLocation",
          lookupResult: "error",
          exception,
        });
        showMarkerNotice(getMarkerUnavailableMessage());
      }
    },
    [editMode, reloadCatalog, showMarkerNotice],
  );

  const openSupplementaryPin = useCallback(
    (group: GroupedMapLocation) => {
      if (editMode) return;
      const resolved = resolveSupplementaryTap({ group, source: "openSupplementaryPin" });
      if (!resolved.ok) {
        showMarkerNotice(resolved.message);
        return;
      }
      if (!markerTapGateRef.current.tryOpen(resolved.id)) return;
      try {
        setSelectedLocation(null);
        setSelectedMapContent(normalizeGroupedMapContent(group));
        setActiveMarkerId(group.groupKey);
        setSheetOpen(true);
        setMarkerNotice(null);
      } catch (exception) {
        logFailedMarkerClick({
          markerType: inferMarkerKindFromGroup(group),
          markerId: group.groupKey,
          source: "openSupplementaryPin",
          lookupResult: "error",
          exception,
        });
        showMarkerNotice(getMarkerUnavailableMessage());
      }
    },
    [editMode, showMarkerNotice],
  );

  const handlePlaceSelected = useCallback(
    (result: MapSearchResult) => {
      if (editMode) return;

      try {
        setFlyToForce(true);

        if (result.kind === "club") {
          const orgName = result.title.trim().toLowerCase();
          const matchingGroup = [...locations.map((l) => l.mapContent), ...supplementaryPins]
            .filter((group): group is GroupedMapLocation => Boolean(group))
            .find((group) =>
              group.events.some(
                (event) => event.organizationName?.trim().toLowerCase() === orgName,
              ),
            );

          if (matchingGroup?.lat != null && matchingGroup?.lng != null) {
            setSearchPin({ lat: matchingGroup.lat, lng: matchingGroup.lng, name: result.title });
            if (matchingGroup.realmLocationId) {
              const location = locations.find((l) => l.id === matchingGroup.realmLocationId);
              if (location) {
                openLocation(location);
                return;
              }
            }
            setSelectedLocation(null);
            setSelectedMapContent(normalizeGroupedMapContent(matchingGroup));
            setActiveMarkerId(matchingGroup.groupKey);
            setSheetOpen(true);
            return;
          }

          if (result.organizationId && onOpenOrganization) {
            onOpenOrganization(result.organizationId);
            return;
          }

          showMarkerNotice(`Open Organizations to view ${result.title}.`);
          return;
        }

        if (result.lat != null && result.lng != null) {
          setSearchPin({ lat: result.lat, lng: result.lng, name: result.title });
        }

        if (result.realmLocationId) {
          const location = locations.find((l) => l.id === result.realmLocationId);
          if (location) {
            openLocation(location);
            return;
          }
        }

        const group =
          (result.groupKey
            ? supplementaryPins.find((g) => g.groupKey === result.groupKey)
            : null) ??
          (result.markerId
            ? supplementaryPins.find((g) => g.groupKey === result.markerId)
            : null);

        if (group) {
          setSelectedLocation(null);
          setSelectedMapContent(normalizeGroupedMapContent(group));
          setActiveMarkerId(group.groupKey);
          setSheetOpen(true);
          return;
        }

        if (result.markerId) {
          const location = locations.find((l) => l.id === result.markerId);
          if (location) {
            openLocation(location);
            return;
          }
        }

        showMarkerNotice("We couldn’t open that result on the map.");
      } catch (error) {
        console.warn("[cq:map-search] failed to open result", error);
        showMarkerNotice("Search couldn’t open that place. Try another result.");
      }
    },
    [editMode, locations, supplementaryPins, openLocation, onOpenOrganization, showMarkerNotice],
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setSearchPin(null);
    setFlyToForce(false);
    if (!isRouteSheetOpen) {
      setActiveMarkerId(null);
      setSelectedMapContent(null);
      cancelInFlightRoute();
      setDirectionsRequest(null);
      setDirectionsStatus({ status: "idle" });
      setActiveRouteDestination(null);
    }
  }, [cancelInFlightRoute, isRouteSheetOpen]);

  useEffect(() => {
    if (!isActive && sheetOpen) closeSheet();
  }, [closeSheet, isActive, sheetOpen]);

  const handleAddMemory = useCallback((locationId: CampusLocationId) => {
    setAddMemoryLocationId(locationId);
    setShowAddMemory(true);
  }, []);

  const handleOpenMemoryViewer = useCallback((group: CampusMemoryGroup, initialMemoryId?: string, includeExpired = false) => {
    setMemoryViewerGroup(group);
    setMemoryViewerInitialId(initialMemoryId);
    setMemoryViewerIncludeExpired(includeExpired);
  }, []);

  const handleOpenMemoryGallery = useCallback((locationId: CampusLocationId) => {
    setMemoryGalleryLocationId(locationId);
  }, []);

  const handleRefreshLocationData = useCallback(async () => {
    await Promise.all([loadCampusMemories(), reloadMapGroups()]);
    setQuestReloadToken((token) => token + 1);
  }, [loadCampusMemories, reloadMapGroups]);

  /** Soft refresh when a sheet opens — map pins only. Do not bump questReloadToken
   * (LocationQuestSection already loads on mount) and do not re-fetch campus
   * memories here (open effect already calls onRefreshMemories once). */
  const handleSoftRefreshLocationData = useCallback(async () => {
    await reloadMapGroups();
  }, [reloadMapGroups]);

  const handleReset = useCallback(() => {
    transformRef.current?.centerView(1, 420);
  }, []);

  const handleCreateLocationAt = useCallback(
    async (coords: { x: number; y: number; lat?: number; lng?: number }) => {
      const name = newLocationName.trim();
      if (!name) {
        setSaveMessage("Enter a location name first.");
        return;
      }
      setCreateLocationPending(true);
      try {
        const row = await createCampusLocationFromMarker({
          name,
          mapX: coords.x,
          mapY: coords.y,
          latitude: coords.lat ?? null,
          longitude: coords.lng ?? null,
        });
        setDraftPositions((prev) => ({
          ...prev,
          [row.slug]: { x: coords.x, y: coords.y, lat: coords.lat, lng: coords.lng },
        }));
        setEditorSelectedId(row.slug);
        setPlacingNewLocation(false);
        setNewLocationName("");
        setSaveMessage(`Created ${row.name}. Save positions to persist the map layout.`);
        await reloadCatalog();
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : "Could not create location.");
      } finally {
        setCreateLocationPending(false);
      }
    },
    [newLocationName, reloadCatalog],
  );

  const handleMapStageClickForNewLocation = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editMode || !placingNewLocation || !mapStageRef.current) return;
      if ((e.target as HTMLElement).closest(".realm-pin")) return;
      const { x, y } = pointerToPercent(mapStageRef.current, e.clientX, e.clientY);
      void handleCreateLocationAt({ x, y });
    },
    [editMode, placingNewLocation, handleCreateLocationAt],
  );

  const handleEnterEdit = useCallback(() => {
    if (!isAdmin) return;
    setEditMode(true);
    setSheetOpen(false);
    setSelectedLocation(null);
    setActiveMarkerId(null);
    setSaveMessage(null);
    setDraftPositions(getSavedPositions());
  }, [isAdmin, getSavedPositions]);

  const handleExitEdit = useCallback(() => {
    setEditMode(false);
    setEditorSelectedId(null);
    setSelectedUrinvolvedEventId(null);
    setDraggingId(null);
    setSaveMessage(null);
    setDraftPositions(getSavedPositions());
  }, [getSavedPositions]);

  const handleSave = useCallback(async () => {
    if (!isAdmin || savePending) return;
    const positions = { ...draftPositions };
    setSavePending(true);
    setSaveMessage(null);
    try {
      const saved = await saveRealmMarkerPositionsToServer(positions);
      saveServerMarkerPositionsCache(saved.positions, {
        updatedAt: saved.updatedAt,
        updatedBy: saved.updatedBy,
      });
      setDraftPositions(resolveMarkerPositions(saved.positions));
      setSaveMessage("Saved — marker positions updated for all students.");
      if (process.env.NODE_ENV === "development") {
        console.info("[Realm Marker Editor] saved to server:", saved.positions);
      }
    } catch (e) {
      saveMarkerPositionOverrides(positions);
      setSaveMessage(
        e instanceof Error
          ? `Saved locally only — server save failed: ${e.message}`
          : "Saved locally only — could not reach server.",
      );
    } finally {
      setSavePending(false);
      window.setTimeout(() => setSaveMessage(null), 5000);
    }
  }, [draftPositions, isAdmin, savePending]);

  const updateMarkerPosition = useCallback((id: RealmLocationId, x: number, y: number) => {
    setDraftPositions((prev) => ({
      ...prev,
      [id]: { ...prev[id], x: round2(x), y: round2(y) },
    }));
  }, []);

  /** Google map layer: admin placed a marker at real-world coordinates. */
  const updateMarkerGeoPosition = useCallback((id: RealmLocationId, lat: number, lng: number) => {
    const percent = geoToRealmMapPercent(lat, lng);
    setDraftPositions((prev) => ({
      ...prev,
      [id]: {
        x: round2(percent.x),
        y: round2(percent.y),
        lat: round6(lat),
        lng: round6(lng),
      },
    }));
  }, []);

  /** Landmark geo positions — admin overrides first, then canonical campus coordinates. */
  const geoPositions = useMemo(() => {
    const out: Record<string, { lat: number; lng: number }> = {};
    for (const location of catalogRealmLocations) {
      const draft = draftPositions[location.id];
      const catalogRow = catalogRows.find((row) => row.slug === location.id);
      out[location.id] =
        draft && typeof draft.lat === "number" && typeof draft.lng === "number"
          ? { lat: draft.lat, lng: draft.lng }
          : {
              lat: catalogRow?.latitude ?? REALM_LOCATION_GEO[location.id as keyof typeof REALM_LOCATION_GEO]?.latitude ?? 41.4871,
              lng: catalogRow?.longitude ?? REALM_LOCATION_GEO[location.id as keyof typeof REALM_LOCATION_GEO]?.longitude ?? -71.5305,
            };
    }
    return out;
  }, [catalogRealmLocations, catalogRows, draftPositions]);

  const recommendationLandmarks = useMemo(
    () =>
      locations.map((location) => ({
        id: location.id,
        name: location.name,
        category: location.category ?? null,
        major: location.major,
        lat: geoPositions[location.id]?.lat ?? 0,
        lng: geoPositions[location.id]?.lng ?? 0,
        mapContent: location.mapContent,
      })),
    [locations, geoPositions],
  );

  const mapRecommendations = useMemo(() => {
    if (typeof window === "undefined") {
      return rankMapRecommendations({
        landmarks: recommendationLandmarks,
        groups: supplementaryPins,
        profile: recProfile,
        now: new Date(),
        limit: 6,
      });
    }
    return rankMapRecommendations({
      landmarks: recommendationLandmarks,
      groups: supplementaryPins,
      profile: recProfile,
      now: new Date(),
      limit: forYouRecommendationLimit(window.innerWidth),
    });
  }, [recommendationLandmarks, supplementaryPins, recProfile]);

  const forYouMarkerIds = useMemo(() => recommendedMarkerIds(mapRecommendations), [mapRecommendations]);
  const searchRecScores = useMemo(() => recommendationScoreBySearchId(mapRecommendations), [mapRecommendations]);
  const recCounts = useMemo(() => mapRecommendationCounts(mapRecommendations), [mapRecommendations]);

  const discoveryItems = useMemo(
    () =>
      rankMapRecommendations({
        landmarks: recommendationLandmarks,
        groups: supplementaryPins,
        profile: recProfile,
        now: new Date(),
        limit: 16,
      }),
    [recommendationLandmarks, supplementaryPins, recProfile],
  );

  const discoveryGroups = useMemo(() => {
    const fromLandmarks = locations
      .map((location) => location.mapContent)
      .filter((group): group is GroupedMapLocation => Boolean(group));
    return [...fromLandmarks, ...supplementaryPins];
  }, [locations, supplementaryPins]);

  const nearbyPlaces = useMemo(
    () => buildNearbyPlaceCardsFromLandmarks(recommendationLandmarks, userFix, 6),
    [recommendationLandmarks, userFix],
  );

  const handleUserFix = useCallback((pos: { lat: number; lng: number; accuracy?: number | null } | null) => {
    setUserFix((prev) => {
      if (!pos && !prev) return prev;
      if (
        pos &&
        prev &&
        pos.lat === prev.lat &&
        pos.lng === prev.lng &&
        pos.accuracy === prev.accuracy
      ) {
        return prev;
      }
      return pos;
    });
  }, []);

  const handleUserLocating = useCallback((locating: boolean) => {
    if (locating) locateAttemptedRef.current = true;
    if (!locating && !locateAttemptedRef.current) return;
    setUserLocating(locating);
  }, []);

  const showDiscoverySheet =
    !showArrival && !showIntro && !editMode && !sheetOpen && !isRouteSheetOpen;

  const syncRecommendationForMarker = useCallback(
    (markerId: string) => {
      const match = mapRecommendations.find((item) => item.markerId === markerId);
      setSelectedRecommendationId(match?.id ?? null);
    },
    [mapRecommendations],
  );

  const focusRecommendation = useCallback((item: MapRecommendationItem, openSheet: boolean) => {
    setSelectedRecommendationId(item.id);
    setActiveMarkerId(item.markerId);
    setRailFocus({ lat: item.lat, lng: item.lng });
    setFlyToForce(true);
    setMarkerFilter("for_you");
    if (!openSheet) return;

    const location = locations.find((row) => row.id === item.markerId);
    if (location) {
      openLocation(location);
      return;
    }
    const group = supplementaryPins.find((row) => row.groupKey === item.markerId);
    if (group) {
      openSupplementaryPin(group);
    }
  }, [locations, supplementaryPins, openLocation, openSupplementaryPin]);

  const openPlaceFromCarousel = useCallback(
    (place: { markerId: string }) => {
      const rec =
        discoveryItems.find((item) => item.markerId === place.markerId) ??
        mapRecommendations.find((item) => item.markerId === place.markerId);
      if (rec) {
        focusRecommendation(rec, true);
        return;
      }
      const location = locations.find((row) => row.id === place.markerId);
      if (location) {
        openLocation(location);
        syncRecommendationForMarker(place.markerId);
      }
    },
    [discoveryItems, mapRecommendations, locations, focusRecommendation, openLocation, syncRecommendationForMarker],
  );

  const handleTapLandmark = useCallback(
    (id: RealmLocationId) => {
      const resolved = resolveLandmarkTap({
        markerId: id,
        locations,
        source: "handleTapLandmark",
      });
      if (!resolved.ok) {
        // Stale catalog / sync race: refresh data and surface a local toast (never crash).
        if (resolved.reason === "missing" || resolved.reason === "stale") {
          void reloadCatalog();
          void reloadMapGroups();
        }
        showMarkerNotice(resolved.message);
        return;
      }
      const location = locations.find((l) => l.id === resolved.id);
      if (!location) {
        void reloadCatalog();
        showMarkerNotice(getMarkerUnavailableMessage());
        return;
      }
      openLocation(location);
      syncRecommendationForMarker(location.id);
    },
    [locations, openLocation, reloadCatalog, reloadMapGroups, showMarkerNotice, syncRecommendationForMarker],
  );

  useEffect(() => {
    if (!isActive || !mapGroupsLoaded) return;
    const seq = ++focusSeqRef.current;
    const pending = peekRealmMapFocus();
    if (!pending) return;

    const sources = collectMapRecommendationSources({
      landmarks: recommendationLandmarks,
      groups: [...locations.map((row) => row.mapContent).filter((row): row is GroupedMapLocation => Boolean(row)), ...supplementaryPins],
      now: new Date(),
    });

    if (pending.eventId) {
      const found = findMapFocusForEvent(pending.eventId, sources);
      if (!found) {
        consumeRealmMapFocus();
        showMarkerNotice("That event isn’t placed on the map yet.");
        return;
      }
      if (seq !== focusSeqRef.current) return;
      consumeRealmMapFocus();
      pendingWalkAfterFocusRef.current = pending.walk === true;
      setMarkerFilter((prev) => (prev === "live" ? prev : "for_you"));
      setActiveMarkerId(found.markerId);
      setRailFocus({ lat: found.lat, lng: found.lng });
      setFlyToForce(true);
      const location = locations.find((row) => row.id === found.markerId);
      if (location) openLocation(location);
      else {
        const group = supplementaryPins.find((row) => row.groupKey === found.markerId);
        if (group) openSupplementaryPin(group);
      }
      const rec = mapRecommendations.find((item) => item.eventId === pending.eventId || item.markerId === found.markerId);
      setSelectedRecommendationId(rec?.id ?? null);
      return;
    }

    if (pending.locationId) {
      const found = findMapFocusForLocation(pending.locationId, recommendationLandmarks, supplementaryPins);
      if (!found) {
        consumeRealmMapFocus();
        return;
      }
      if (seq !== focusSeqRef.current) return;
      consumeRealmMapFocus();
      setActiveMarkerId(found.markerId);
      setRailFocus({ lat: found.lat, lng: found.lng });
      setFlyToForce(true);
      const location = locations.find((row) => row.id === found.markerId);
      if (location) openLocation(location);
    }
  }, [isActive, mapGroupsLoaded, recommendationLandmarks, locations, supplementaryPins, mapRecommendations, openLocation, openSupplementaryPin, showMarkerNotice]);

  const editorDebug: RealmMarkerEditorDebug = useMemo(() => {
    const selectedCoords = editorSelectedId && draftPositions[editorSelectedId]
      ? draftPositions[editorSelectedId]!
      : null;
    return {
      userId,
      role: userRole,
      isAdmin,
      editMode,
      selectedMarkerId: editorSelectedId,
      selectedCoords,
    };
  }, [userId, userRole, isAdmin, editMode, editorSelectedId, draftPositions]);

  const mapPanningDisabled = editMode;
  const useGoogleMap = GOOGLE_MAPS_API_KEY.length > 0;

  const syncMapScale = useCallback((ref: ReactZoomPanPinchRef) => {
    setMapScale(ref.state.scale);
  }, []);

  const selectedDestination = useMemo((): RealmDirectionsDestination | null => {
    if (!sheetOpen || editMode) return null;
    if (selectedLocation) {
      const geo = geoPositions[selectedLocation.id];
      return {
        id: selectedLocation.id,
        label: selectedLocation.name,
        lat: geo?.lat,
        lng: geo?.lng,
      };
    }
    if (selectedMapContent) {
      return {
        label: selectedMapContent.locationName,
        lat: selectedMapContent.lat ?? undefined,
        lng: selectedMapContent.lng ?? undefined,
      };
    }
    return null;
  }, [sheetOpen, editMode, selectedLocation, selectedMapContent, geoPositions]);

  const routeDestination = activeRouteDestination ?? selectedDestination;

  const requestDirections = useCallback(
    (travelMode: RealmTravelMode, destinationOverride?: RealmDirectionsDestination | null) => {
      const dest = destinationOverride ?? routeDestination;
      if (!dest?.label || !useGoogleMap || editMode) {
        setDirectionsStatus({
          status: "error",
          travelMode,
          destinationLabel: dest?.label ?? "destination",
          message: dest?.label
            ? "Unable to load the route. Try again."
            : "We couldn't locate this campus destination.",
        });
        return;
      }

      // Same destination already loading — ignore duplicate taps from rerenders.
      if (
        routeInFlightRef.current &&
        directionsStatus.status === "loading" &&
        (directionsStatus.destinationId === dest.id ||
          directionsStatus.destinationLabel === dest.label)
      ) {
        return;
      }

      cancelInFlightRoute();
      const requestId = ++routeRequestIdRef.current;
      routeInFlightRef.current = true;
      setActiveRouteDestination(dest);
      setDirectionsRequest({
        id: requestId,
        destination: dest,
        travelMode,
      });
      setDirectionsStatus({
        status: "loading",
        travelMode,
        destinationLabel: dest.label,
        destinationId: dest.id,
        destinationLat: dest.lat,
        destinationLng: dest.lng,
      });
      logWalkRoute("route requested", {
        requestId,
        destination: dest.label,
        travelMode,
        hasCoords: dest.lat != null && dest.lng != null,
      });
    },
    [cancelInFlightRoute, directionsStatus, editMode, routeDestination, useGoogleMap],
  );

  const clearDirections = useCallback(() => {
    pendingRouteOpenRef.current = false;
    cancelInFlightRoute();
    setDirectionsRequest(null);
    setDirectionsStatus({ status: "idle" });
    setActiveRouteDestination(null);
    setIsRouteSheetOpen(false);
  }, [cancelInFlightRoute]);

  /** Walk to [Location]: respond immediately, calculate route, open map when ready. */
  const startWalkingRoute = useCallback(() => {
    const dest = selectedDestination ?? activeRouteDestination;
    logWalkRoute("button tapped", {
      destination: dest?.label,
      id: dest?.id,
      hasCoords: dest?.lat != null && dest?.lng != null,
    });

    if (!dest?.label || !useGoogleMap || editMode) {
      setDirectionsStatus({
        status: "error",
        travelMode: "WALKING",
        destinationLabel: dest?.label ?? "destination",
        message: dest?.label
          ? "Unable to load the route. Try again."
          : "We couldn't locate this campus destination.",
      });
      return;
    }

    // Close the location sheet first so GPS prompts and gestures are not trapped
    // under the modal — then show the lightweight route sheet loading state.
    pendingRouteOpenRef.current = true;
    setActiveRouteDestination(dest);
    setSheetOpen(false);
    setIsRouteSheetOpen(true);
    requestDirections("WALKING", dest);
  }, [activeRouteDestination, editMode, requestDirections, selectedDestination, useGoogleMap]);

  useEffect(() => {
    if (!pendingWalkAfterFocusRef.current) return;
    if (!selectedDestination) return;
    pendingWalkAfterFocusRef.current = false;
    startWalkingRoute();
  }, [selectedDestination, startWalkingRoute]);

  const openRouteOnMap = useCallback(() => {
    const dest = selectedDestination ?? activeRouteDestination;
    if (!dest?.label || !useGoogleMap || editMode) {
      setDirectionsStatus({
        status: "error",
        travelMode: "WALKING",
        destinationLabel: dest?.label ?? "destination",
        message: dest?.label
          ? "Turn on location access to create a route."
          : "We couldn't locate this campus destination.",
      });
      return;
    }

    setActiveRouteDestination(dest);
    setSheetOpen(false);
    setIsRouteSheetOpen(true);
    logWalkRoute("map opened", { destination: dest.label, from: "open-in-realm-map" });

    if (directionsStatus.status === "ready" && directionsRequest?.travelMode === "WALKING") {
      return;
    }

    pendingRouteOpenRef.current = true;
    requestDirections("WALKING", dest);
  }, [
    activeRouteDestination,
    directionsRequest?.travelMode,
    directionsStatus.status,
    editMode,
    requestDirections,
    selectedDestination,
    useGoogleMap,
  ]);

  const closeRoute = useCallback(() => {
    clearDirections();
  }, [clearDirections]);

  const handleDirectionsLoaded = useCallback((result: RealmDirectionsLoadResult & { ok: true }) => {
    if (result.requestId !== routeRequestIdRef.current) return;
    routeInFlightRef.current = false;
    setDirectionsStatus({
      status: "ready",
      travelMode: result.travelMode,
      destinationLabel: result.destinationLabel,
      summary: result.summary,
      origin: result.origin,
    });
    if (pendingRouteOpenRef.current && result.travelMode === "WALKING") {
      pendingRouteOpenRef.current = false;
      setSheetOpen(false);
      setIsRouteSheetOpen(true);
      logWalkRoute("map opened", {
        requestId: result.requestId,
        destination: result.destinationLabel,
      });
    }
  }, []);

  const handleDirectionsError = useCallback((result: RealmDirectionsLoadResult & { ok: false }) => {
    if (result.requestId !== routeRequestIdRef.current) return;
    routeInFlightRef.current = false;
    pendingRouteOpenRef.current = false;
    setDirectionsStatus({
      status: "error",
      travelMode: result.travelMode,
      destinationLabel: result.destinationLabel,
      message: result.message || "Unable to load the route. Try again.",
      destinationLat: result.destinationLat,
      destinationLng: result.destinationLng,
    });
    logWalkRoute("failure", {
      requestId: result.requestId,
      message: result.message,
    });
  }, []);

  useEffect(() => {
    return () => {
      routeInFlightRef.current = false;
      routeRequestIdRef.current += 1;
    };
  }, []);

  // Cancel in-flight routing when the user selects a different marker (not on every render).
  const selectedMarkerKey = selectedDestination
    ? `${selectedDestination.id ?? ""}:${selectedDestination.label}`
    : null;
  const prevSelectedMarkerKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSelectedMarkerKeyRef.current;
    prevSelectedMarkerKeyRef.current = selectedMarkerKey;
    if (prev == null || selectedMarkerKey == null || prev === selectedMarkerKey) return;
    if (isRouteSheetOpen) return;
    cancelInFlightRoute();
    setDirectionsRequest(null);
    setDirectionsStatus({ status: "idle" });
    setActiveRouteDestination(null);
  }, [cancelInFlightRoute, isRouteSheetOpen, selectedMarkerKey]);

  const trackedPathDestination = useMemo((): { lat: number; lng: number } | null => {
    if (editMode || directionsRequest || isRouteSheetOpen || !sheetOpen || !activeMarkerId) return null;
    const landmark = locations.find((l) => l.id === activeMarkerId);
    if (landmark) {
      const hasQuest =
        landmark.activeQuests > 0 || (landmark.mapContent?.quests.length ?? 0) > 0;
      if (hasQuest) return geoPositions[landmark.id] ?? null;
    }
    const group = supplementaryPins.find((g) => g.groupKey === activeMarkerId);
    if (group && group.quests.length > 0 && group.lat != null && group.lng != null) {
      return { lat: group.lat, lng: group.lng };
    }
    return null;
  }, [editMode, directionsRequest, isRouteSheetOpen, sheetOpen, activeMarkerId, locations, geoPositions, supplementaryPins]);

  const flyToTarget = useMemo((): { lat: number; lng: number } | null => {
    if (editMode) return null;
    if (railFocus) return railFocus;
    if (!sheetOpen || !activeMarkerId) return null;
    const landmarkGeo = geoPositions[activeMarkerId as RealmLocationId];
    if (landmarkGeo) return landmarkGeo;
    const group = supplementaryPins.find((g) => g.groupKey === activeMarkerId);
    if (group?.lat != null && group?.lng != null) {
      return { lat: group.lat, lng: group.lng };
    }
    return null;
  }, [sheetOpen, editMode, activeMarkerId, geoPositions, supplementaryPins, railFocus]);

  return (
    <>
      <div
        ref={mapRootRef}
        data-cq-gesture-block="all"
        data-no-drawer-swipe="true"
        className={`realm-map-shell relative overflow-hidden ${
          immersive ? "realm-map-shell--immersive" : "rounded-2xl"
        } ${useGoogleMap ? "realm-map-shell--google" : ""} ${panning ? "realm-map-shell--panning" : ""} ${
          calibrateMode ? "realm-map-shell--calibrate" : ""
        } ${editMode ? "realm-map-shell--edit" : ""}`}
      >
        {memoriesLoadError ? (
          <div className="cq-realm-map-banner cq-realm-map-banner--error">
            <span>{memoriesLoadError}</span>
            <button
              type="button"
              onClick={() => {
                setMemoriesLoaded(false);
                void loadCampusMemories();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {useGoogleMap ? (
          <GoogleRealmMap
            apiKey={GOOGLE_MAPS_API_KEY}
            immersive={immersive}
            isActive={isActive}
            landmarks={locations.map((location) => ({
              id: location.id,
              name: location.name,
              shortLabel: location.shortLabel,
              major: location.major,
              activeQuests: location.activeQuests,
              activeMomentCount: location.activeMomentCount ?? 0,
              upcomingEvents: location.upcomingEvents,
              mapContent: location.mapContent,
            }))}
            geoPositions={geoPositions}
            supplementaryPins={supplementaryPins}
            markersLoaded={mapGroupsLoaded}
            activeMarkerId={editMode ? editorSelectedId : activeMarkerId}
            trackedPathDestination={trackedPathDestination}
            editMode={editMode}
            editorSelectedId={editorSelectedId}
            onTapLandmark={handleTapLandmark}
            onTapSupplementary={(group) => {
              openSupplementaryPin(group);
              syncRecommendationForMarker(group.groupKey);
            }}
            onSelectEditorMarker={setEditorSelectedId}
            onMarkerGeoChange={updateMarkerGeoPosition}
            onMapReady={() => setUriMapLoaded(true)}
            directionsRequest={directionsRequest}
            onDirectionsLoaded={handleDirectionsLoaded}
            onDirectionsError={handleDirectionsError}
            flyToTarget={flyToTarget}
            flyToEnabled={(sheetOpen || Boolean(railFocus)) && !editMode}
            flyToForce={flyToForce}
            routeSheetOpen={isRouteSheetOpen}
            markerFilter={markerFilter}
            onMarkerFilterChange={setMarkerFilter}
            recommendedMarkerIds={forYouMarkerIds}
            suppressLegacyWelcome={showArrival || showIntro}
            recommendationScoreById={searchRecScores}
            onUserFix={handleUserFix}
            onUserLocating={handleUserLocating}
            viewerAvatar={viewer?.avatar ?? null}
            viewerName={viewer?.name ?? null}
            unreadCount={unreadCount}
            onOpenProfile={onOpenOwnProfile}
            onOpenNotifications={onOpenNotifications}
            urinvolvedEditPins={urinvolvedEditPins}
            selectedUrinvolvedEventId={selectedUrinvolvedEventId}
            onSelectUrinvolvedEvent={setSelectedUrinvolvedEventId}
            onUrinvolvedEventDragEnd={(id, lat, lng) => void handleUrinvolvedEventDragEnd(id, lat, lng)}
            onPlaceSelected={handlePlaceSelected}
            searchPin={searchPin}
          />
        ) : (
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.72}
            maxScale={3.6}
            centerOnInit
            limitToBounds
            smooth
            wheel={{ step: 0.09, smoothStep: 0.004 }}
            pinch={{ step: 6 }}
            panning={{
              disabled: mapPanningDisabled,
              velocityDisabled: false,
              wheelPanning: false,
              excluded: [
                "realm-pin",
                "realm-map-markers",
                "map-pin",
                "realm-external-event-pin",
                "realm-marker",
                "location-marker",
                "cq-realm-foryou-rail",
                "cq-realm-foryou-card",
              ],
            }}
            doubleClick={{ disabled: true }}
            alignmentAnimation={{ animationTime: 280, velocityAlignmentTime: 320 }}
            onPanningStart={() => {
              if (!mapPanningDisabled) setPanning(true);
            }}
            onPanningStop={() => setPanning(false)}
            onInit={syncMapScale}
            onTransformed={syncMapScale}
          >
            <TransformComponent
              wrapperClass="realm-map-viewport !w-full !h-full"
              contentClass="realm-map-transform-content"
            >
              <div
                className="realm-map-scene"
                style={{
                  width: MAP_BASE_WIDTH,
                  aspectRatio: String(MAP_ASPECT),
                }}
              >
                <div
                  ref={mapStageRef}
                  className="realm-map-stage relative h-full w-full"
                  onClick={placingNewLocation ? handleMapStageClickForNewLocation : undefined}
                >
                  <div className="realm-map-surface relative h-full w-full overflow-hidden rounded-md">
                    <RealmCampusMapLayer calibrateMode={calibrateMode} onLoadStateChange={setUriMapLoaded} />
                    <RealmFootprintsLayer />
                    <RealmPathsLayer />
                    {!calibrateMode ? <RealmDecorLayer /> : null}
                  </div>

                  <div
                    data-no-drawer-swipe="true"
                    className={`realm-map-markers absolute inset-0 z-[10] ${editMode ? "realm-map-markers--edit" : ""}`}
                    style={{ "--realm-map-scale": mapScale } as React.CSSProperties}
                  >
                    {locations.map((location) => (
                      <LocationPin
                        key={location.id}
                        location={location}
                        active={editMode ? editorSelectedId === location.id : activeMarkerId === location.id}
                        editMode={editMode}
                        dragging={draggingId === location.id}
                        mapStageRef={mapStageRef}
                        onTap={() => openLocation(location)}
                        onSelect={() => setEditorSelectedId(location.id)}
                        onDragStart={() => setDraggingId(location.id)}
                        onDragEnd={() => setDraggingId(null)}
                        onPositionChange={(x, y) => updateMarkerPosition(location.id, x, y)}
                      />
                    ))}
                    {!editMode
                      ? supplementaryPins.map((group) => (
                          <SupplementaryLocationPin
                            key={group.groupKey}
                            group={group}
                            active={activeMarkerId === group.groupKey}
                            onTap={() => openSupplementaryPin(group)}
                          />
                        ))
                      : urinvolvedEditPins.map((pin) => (
                          <UrinvolvedEventEditPin
                            key={pin.externalEventId}
                            pin={pin}
                            selected={selectedUrinvolvedEventId === pin.externalEventId}
                            mapStageRef={mapStageRef}
                            onSelect={() => {
                              setSelectedUrinvolvedEventId(pin.externalEventId);
                              setEditorSelectedId(null);
                            }}
                            onDragEnd={(lat, lng) => void handleUrinvolvedEventDragEnd(pin.externalEventId, lat, lng)}
                          />
                        ))}
                  </div>
                </div>
              </div>
            </TransformComponent>
          </TransformWrapper>
        )}

        <RealmMarkerEditorPanel
          debug={editorDebug}
          report={report}
          onEnterEdit={handleEnterEdit}
          onExitEdit={handleExitEdit}
          onSave={() => void handleSave()}
          savePending={savePending}
          saveMessage={saveMessage}
          newLocationName={newLocationName}
          onNewLocationNameChange={setNewLocationName}
          placingNewLocation={placingNewLocation}
          onStartPlacingNewLocation={() => setPlacingNewLocation(true)}
          onCancelPlacingNewLocation={() => setPlacingNewLocation(false)}
          createLocationPending={createLocationPending}
          selectedUrinvolvedEventId={selectedUrinvolvedEventId}
          onSelectUrinvolvedEventId={setSelectedUrinvolvedEventId}
          onUrinvolvedPlacementsChanged={() => void reloadMapGroups()}
          selectedLandmarkRealmId={editorSelectedId}
        />

        {useGoogleMap && isRouteSheetOpen ? (
          <RealmRouteSheet
            open={isRouteSheetOpen}
            destinationLabel={activeRouteDestination?.label ?? routeDestination?.label ?? "destination"}
            directionsStatus={directionsStatus}
            onClose={closeRoute}
            onRetry={() => {
              const dest = activeRouteDestination ?? routeDestination;
              if (dest) requestDirections("WALKING", dest);
            }}
          />
        ) : null}

        {!useGoogleMap ? (
          <button
            type="button"
            onClick={handleReset}
            className={`absolute z-[5] flex h-11 w-11 items-center justify-center touch-manipulation ${
              immersive ? "cq-realm-float-btn cq-realm-map-controls--classic-reset" : "realm-map-reset-btn bottom-3 right-3"
            }`}
            aria-label="Reset and center map"
            title="Center map"
          >
            <Compass className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
        ) : null}

        {calibrateMode ? (
          <p className="absolute right-3 top-3 z-[5] rounded-lg border border-amber-400/40 bg-black/60 px-2 py-1 text-[10px] text-amber-200">
            Calibration mode — full-opacity reference map
          </p>
        ) : null}

        {!useGoogleMap && isAdmin ? (
          <p className="absolute right-3 top-3 z-[5] rounded-lg border border-amber-400/40 bg-black/60 px-2 py-1 text-[10px] text-amber-200">
            Google Maps key missing — showing classic Realm map
          </p>
        ) : null}

        {showIntro && !editMode ? (
          <RealmIntroCoach
            visible
            onComplete={() => {
              setMarkerFilter("for_you");
              onIntroComplete?.();
            }}
            onSkip={() => onIntroSkip?.()}
          />
        ) : null}

        {showArrival && !showIntro && !editMode ? (
          <div className="cq-realm-arrival-slot">
            <RealmArrivalCard
              campusName={campusArrivalName(personalization?.schoolName, personalization?.institutionId)}
              eventCount={recCounts.events}
              placeCount={recCounts.places}
              liveCount={recCounts.live}
              dataReady={mapGroupsLoaded}
              onExploreForYou={() => {
                setMarkerFilter("for_you");
                onArrivalExplore?.();
              }}
              onViewFeed={() => onArrivalViewFeed?.()}
            />
          </div>
        ) : null}

        {showDiscoverySheet ? (
          <RealmDiscoverySheet
            items={discoveryItems}
            groups={discoveryGroups}
            nearbyPlaces={nearbyPlaces}
            snap={discoverySnap}
            onSnapChange={setDiscoverySnap}
            onOpenRecommendation={(item) => focusRecommendation(item, true)}
            onOpenPlace={openPlaceFromCarousel}
            onViewAthletics={onViewAthletics}
            onFindMyCampus={onFindMyCampus}
            onViewAllRecommendations={onViewAllRecommendations}
            walkOrigin={userFix}
            locating={userLocating}
          />
        ) : null}
      </div>

      <RealmMarkerErrorBoundary
        markerId={activeMarkerId}
        markerType={
          selectedLocation
            ? "landmark"
            : selectedMapContent
              ? inferMarkerKindFromGroup(selectedMapContent)
              : "landmark"
        }
        onRecover={closeSheet}
      >
        <RealmLocationSheet
          location={selectedLocation}
          mapContent={selectedMapContent}
          open={sheetOpen}
          memoryStats={selectedLocation ? memoryStatsByLocation[selectedLocation.id] ?? null : null}
          mapContentLoaded={mapGroupsLoaded}
          currentUserId={userId}
          onClose={closeSheet}
          onRefreshMemories={loadCampusMemories}
          onRefreshAll={handleSoftRefreshLocationData}
          onPullRefreshAll={handleRefreshLocationData}
          questReloadToken={questReloadToken}
          onAddMemory={handleAddMemory}
          onOpenMemoryViewer={handleOpenMemoryViewer}
          onOpenMemoryGallery={handleOpenMemoryGallery}
          directionsEnabled={useGoogleMap && !editMode}
          directionsDestination={selectedDestination}
          directionsStatus={directionsStatus}
          activeTravelMode={directionsRequest?.travelMode ?? null}
          onRequestWalking={startWalkingRoute}
          onRequestDriving={() => requestDirections("DRIVING")}
          onClearDirections={clearDirections}
          onOpenInRealmMap={openRouteOnMap}
        />
      </RealmMarkerErrorBoundary>

      {markerNotice ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[75] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
          role="status"
        >
          <p className="cq-realm-map-toast pointer-events-auto max-w-sm text-center">{markerNotice}</p>
        </div>
      ) : null}

      {memoryGalleryLocationId ? (
        <LocationMemoriesGallery
          locationId={memoryGalleryLocationId}
          locationName={
            locations.find((l) => l.id === memoryGalleryLocationId)?.name ??
            getCampusLocationName(memoryGalleryLocationId)
          }
          open
          onClose={() => setMemoryGalleryLocationId(null)}
          onAddMemory={handleAddMemory}
          onOpenMemory={(group, memoryId) => {
            setMemoryGalleryLocationId(null);
            handleOpenMemoryViewer(group, memoryId, true);
          }}
        />
      ) : null}

      {memoryViewerGroup && userId ? (
        <CampusMemoryViewer
          group={memoryViewerGroup}
          currentUserId={userId}
          initialMemoryId={memoryViewerInitialId}
          includeExpired={memoryViewerIncludeExpired}
          onClose={() => {
            setMemoryViewerGroup(null);
            setMemoryViewerInitialId(undefined);
            setMemoryViewerIncludeExpired(false);
          }}
        />
      ) : null}

      {showAddMemory ? (
        <AddCampusMemorySheet
          defaultLocationId={addMemoryLocationId}
          onClose={() => setShowAddMemory(false)}
          onCreated={() => void loadCampusMemories()}
        />
      ) : null}
    </>
  );
}

function SupplementaryLocationPin({
  group,
  active,
  onTap,
}: {
  group: GroupedMapLocation;
  active: boolean;
  onTap: () => void;
}) {
  const { onPointerDown, onPointerUp, onClick } = useMapMarkerTap(onTap);
  const count = mapLocationActivityCount(group);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className={`realm-pin realm-marker location-marker map-pin touch-manipulation realm-pin--quest ${active ? "realm-pin--active" : ""}`}
      style={{ left: `${group.x}%`, top: `${group.y}%` }}
      aria-label={`${group.locationName}. ${count} active items.`}
      data-map-marker="true"
      data-no-drawer-swipe="true"
    >
      <span className="realm-pin-quest-glow" aria-hidden />
      <span className="realm-pin-dot" aria-hidden>
        <span className="realm-pin-emoji">📍</span>
      </span>
      <span className="realm-pin-label">{group.locationName}</span>
      {group.events.some((event) => event.locationManuallyAdjusted) ? (
        <span className="cq-realm-marker-adjusted cq-realm-marker-adjusted--canvas">Adjusted</span>
      ) : null}
    </button>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function UrinvolvedEventEditPin({
  pin,
  selected,
  mapStageRef,
  onSelect,
  onDragEnd,
}: {
  pin: UrinvolvedEditPin;
  selected: boolean;
  mapStageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onDragEnd: (lat: number, lng: number) => void;
}) {
  const mapPos = geoToRealmMapPercent(pin.lat, pin.lng);
  const [pos, setPos] = useState(mapPos);
  const dragRef = useRef({ active: false, pointerId: -1, moved: false });

  useEffect(() => {
    setPos(geoToRealmMapPercent(pin.lat, pin.lng));
  }, [pin.lat, pin.lng]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    dragRef.current = { active: true, pointerId: e.pointerId, moved: false };
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
    const stage = mapStageRef.current;
    if (!stage) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current.moved = true;
    setPos(pointerToPercent(stage, e.clientX, e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== dragRef.current.pointerId) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const wasDrag = dragRef.current.moved;
    dragRef.current = { active: false, pointerId: -1, moved: false };
    if (wasDrag) {
      const geo = realmMapPercentToGeo(pos.x, pos.y);
      onDragEnd(geo.latitude, geo.longitude);
    } else {
      onSelect();
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`realm-pin realm-marker location-marker map-pin touch-manipulation realm-pin--editable ${
        selected ? "realm-pin--active" : ""
      }`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, touchAction: "none" }}
      aria-label={`${pin.title}. Drag to reposition URInvolved event pin.`}
      data-map-marker="true"
      data-no-drawer-swipe="true"
    >
      <span className="realm-pin-dot" aria-hidden>
        <span className="realm-pin-emoji">📅</span>
      </span>
      <span className="realm-pin-label">{pin.title}</span>
      {pin.locationManuallyAdjusted ? (
        <span className="cq-realm-marker-adjusted cq-realm-marker-adjusted--canvas">Adjusted</span>
      ) : null}
    </button>
  );
}

function LocationPin({
  location,
  active,
  editMode,
  dragging,
  mapStageRef,
  onTap,
  onSelect,
  onDragStart,
  onDragEnd,
  onPositionChange,
}: {
  location: HydratedRealmLocation;
  active: boolean;
  editMode: boolean;
  dragging: boolean;
  mapStageRef: React.RefObject<HTMLDivElement | null>;
  onTap: () => void;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPositionChange: (x: number, y: number) => void;
}) {
  const hasActiveQuest = location.activeQuests > 0;
  const hasActiveMoments = (location.activeMomentCount ?? 0) > 0;
  const dragRef = useRef({ active: false, pointerId: -1, moved: false });
  const { onPointerDown: onTapPointerDown, onPointerUp: onTapPointerUp, onClick: onTapClick } = useMapMarkerTap(
    onTap,
    editMode,
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!editMode) {
      onTapPointerDown(e);
      return;
    }

    dragRef.current = { active: true, pointerId: e.pointerId, moved: false };
    onSelect();
    onDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!editMode || !dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
    const stage = mapStageRef.current;
    if (!stage) return;

    e.preventDefault();
    e.stopPropagation();
    dragRef.current.moved = true;
    const { x, y } = pointerToPercent(stage, e.clientX, e.clientY);
    onPositionChange(x, y);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!editMode) {
      onTapPointerUp(e);
      return;
    }
    if (e.pointerId !== dragRef.current.pointerId) return;

    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const wasDrag = dragRef.current.moved;
    dragRef.current = { active: false, pointerId: -1, moved: false };
    onDragEnd();

    if (!wasDrag) {
      onSelect();
    }
  };

  return (
    <button
      type="button"
      onClick={editMode ? (e) => e.stopPropagation() : onTapClick}
      onPointerDown={handlePointerDown}
      onPointerMove={editMode ? handlePointerMove : undefined}
      onPointerUp={handlePointerUp}
      onPointerCancel={editMode ? handlePointerUp : undefined}
      className={`realm-pin realm-marker location-marker map-pin group touch-manipulation ${
        active ? "realm-pin--active" : ""
      } ${hasActiveQuest && !editMode ? "realm-pin--quest" : ""} ${
        hasActiveMoments && !editMode ? "realm-pin--moments" : ""
      } ${editMode ? "realm-pin--editable" : ""} ${dragging ? "realm-pin--dragging" : ""}`}
      style={{ left: `${location.x}%`, top: `${location.y}%`, touchAction: editMode ? "none" : "manipulation" }}
      data-cq-gesture-block="all"
      aria-label={
        editMode
          ? `${location.name}. Drag to reposition.`
          : `${location.name}. Tap for details.`
      }
      data-location-id={location.id}
      data-map-marker="true"
      data-no-drawer-swipe="true"
    >
      {hasActiveQuest && !editMode ? <span className="realm-pin-quest-glow" aria-hidden /> : null}
      {hasActiveMoments && !editMode ? <span className="realm-pin-moments-glow" aria-hidden /> : null}
      <span className="realm-pin-dot" aria-hidden>
        <span className="realm-pin-emoji">{location.markerEmoji}</span>
      </span>
      <span className="realm-pin-label">{location.shortLabel}</span>
      {editMode ? (
        <span className="realm-pin-coords" aria-live="polite">
          {location.x.toFixed(1)}%, {location.y.toFixed(1)}%
        </span>
      ) : null}
    </button>
  );
}
