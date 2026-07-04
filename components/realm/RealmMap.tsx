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
import { getCampusLocation } from "@/lib/locations/registry";
import { AddCampusMemorySheet } from "@/components/memories/AddCampusMemorySheet";
import { CampusMemoryViewer } from "@/components/memories/CampusMemoryViewer";
import { LocationMemoriesGallery } from "@/components/memories/LocationMemoriesGallery";
import { useGroupedMapLocations } from "@/lib/client/mapLocationGroupsClient";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { mapLocationActivityCount, mapLocationQuestCount } from "@/lib/mapLocationGroups";
import type { SharePostTarget } from "@/lib/client/dmMessagesClient";
import { REALM_LOCATION_GEO } from "@/lib/realm/locationGeo";
import { geoToRealmMapPercent } from "@/lib/realm/geoToMapPercent";
import { GoogleRealmMap } from "./GoogleRealmMap";
import { RealmCampusMapLayer } from "./RealmCampusMapLayer";
import { RealmDecorLayer } from "./RealmDecorLayer";
import { RealmFootprintsLayer } from "./RealmFootprintsLayer";
import { RealmLocationSheet } from "./RealmLocationSheet";
import { RealmMarkerEditorPanel, type RealmMarkerEditorDebug } from "./RealmMarkerEditorPanel";
import { RealmPathsLayer } from "./RealmPathsLayer";
import { useRealmMapDiagnostics } from "./useRealmMapDiagnostics";
import { useMapMarkerTap } from "@/lib/client/mapMarkerTap";

function catalogRowsToRealmLocations(rows: CampusLocationRecord[]): RealmLocation[] {
  return rows.map((row) => ({
    id: row.slug,
    name: row.name,
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
  viewer = null,
  userId = null,
  isAdmin = false,
  userRole = "student",
  immersive = false,
}: {
  onViewQuests?: (location: RealmLocation) => void;
  onCreatePost?: () => void;
  onViewProfile?: (userId: string) => void;
  onSharePost?: (target: SharePostTarget) => void;
  viewer?: { id: string; name: string; username: string; avatar: string } | null;
  userId?: string | null;
  isAdmin?: boolean;
  userRole?: string;
  immersive?: boolean;
}) {
  const [selectedLocation, setSelectedLocation] = useState<HydratedRealmLocation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [uriMapLoaded, setUriMapLoaded] = useState(false);
  const [panning, setPanning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draftPositions, setDraftPositions] = useState<MarkerPositionMap>(() => resolveMarkerPositions());
  const [editorSelectedId, setEditorSelectedId] = useState<RealmLocationId | null>(null);
  const [draggingId, setDraggingId] = useState<RealmLocationId | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [sheetInitialView, setSheetInitialView] = useState<"archive" | "overview">("archive");
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
  const { groups: mapGroups, loaded: mapGroupsLoaded, reload: reloadMapGroups } = useGroupedMapLocations();
  const [selectedMapContent, setSelectedMapContent] = useState<GroupedMapLocation | null>(null);
  const [mapScale, setMapScale] = useState(1);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const { locations: catalogRows, reload: reloadCatalog } = useCampusLocations();
  const [placingNewLocation, setPlacingNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [createLocationPending, setCreateLocationPending] = useState(false);

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

  const loadCampusMemories = useCallback(async () => {
    setMemoriesLoadError(null);
    try {
      const { stats } = await fetchCampusMemoryGroupsAndStats();
      const statsMap: Record<string, CampusMemoryLocationStats> = {};
      for (const row of stats) statsMap[row.locationId] = row;
      setMemoryStatsByLocation(statsMap);
    } catch {
      setMemoryStatsByLocation({});
      setMemoriesLoadError("Could not load campus memories for The Realm.");
    } finally {
      setMemoriesLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadCampusMemories();
  }, [loadCampusMemories]);

  useEffect(() => subscribeCampusMemoriesChanged(() => void loadCampusMemories()), [loadCampusMemories]);

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
    let cancelled = false;

    const cached = loadServerMarkerPositionsCache();
    if (cached) {
      applyResolvedPositions(cached.positions);
    }

    void (async () => {
      try {
        const remote = await fetchRealmMarkerPositions();
        if (cancelled) return;
        saveServerMarkerPositionsCache(remote.positions, {
          updatedAt: remote.updatedAt,
          updatedBy: remote.updatedBy,
        });
        applyResolvedPositions(remote.positions);
      } catch {
        if (!cancelled && !cached) {
          applyResolvedPositions(loadMarkerPositionOverrides());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyResolvedPositions]);

  const getSavedPositions = useCallback((): MarkerPositionMap => {
    const cached = loadServerMarkerPositionsCache();
    if (cached?.positions) return resolveMarkerPositions(cached.positions);
    return resolveMarkerPositions(loadMarkerPositionOverrides());
  }, []);

  const openLocation = useCallback(
    (location: HydratedRealmLocation) => {
      if (editMode) return;
      setSelectedLocation(location);
      setSelectedMapContent(location.mapContent);
      setActiveMarkerId(location.id);
      setSheetInitialView("archive");
      setSheetOpen(true);
    },
    [editMode],
  );

  const openSupplementaryPin = useCallback((group: GroupedMapLocation) => {
    if (editMode) return;
    setSelectedLocation(null);
    setSelectedMapContent(group);
    setActiveMarkerId(group.groupKey);
    setSheetInitialView("overview");
    setSheetOpen(true);
  }, [editMode]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setActiveMarkerId(null);
    setSelectedMapContent(null);
  }, []);

  const handleCreatePost = useCallback(() => {
    closeSheet();
    onCreatePost?.();
  }, [closeSheet, onCreatePost]);

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

  const handleTapLandmark = useCallback(
    (id: RealmLocationId) => {
      const location = locations.find((l) => l.id === id);
      if (location) openLocation(location);
    },
    [locations, openLocation],
  );

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

  const trackedPathDestination = useMemo((): { lat: number; lng: number } | null => {
    if (editMode || !sheetOpen || !activeMarkerId) return null;
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
  }, [editMode, sheetOpen, activeMarkerId, locations, geoPositions, supplementaryPins]);

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
        {!memoriesLoaded ? (
          <div className="cq-realm-map-banner cq-realm-map-banner--loading" role="status">
            Loading The Realm…
          </div>
        ) : null}
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
            onTapSupplementary={openSupplementaryPin}
            onSelectEditorMarker={setEditorSelectedId}
            onMarkerGeoChange={updateMarkerGeoPosition}
            onMapReady={() => setUriMapLoaded(true)}
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
              excluded: ["realm-pin", "realm-map-markers", "map-pin", "realm-external-event-pin", "realm-marker", "location-marker"],
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
                      : null}
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
        />

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
      </div>

      <RealmLocationSheet
        location={selectedLocation}
        mapContent={selectedMapContent}
        open={sheetOpen}
        initialView={sheetInitialView}
        memoriesLoaded={memoriesLoaded}
        memoryStats={selectedLocation ? memoryStatsByLocation[selectedLocation.id] ?? null : null}
        mapContentLoaded={mapGroupsLoaded}
        viewer={viewer}
        currentUserId={userId}
        onClose={closeSheet}
        onViewQuests={onViewQuests}
        onCreatePost={handleCreatePost}
        onRefreshMemories={loadCampusMemories}
        onRefreshAll={handleRefreshLocationData}
        questReloadToken={questReloadToken}
        onViewProfile={onViewProfile}
        onSharePost={onSharePost}
        onAddMemory={handleAddMemory}
        onOpenMemoryViewer={handleOpenMemoryViewer}
        onOpenMemoryGallery={handleOpenMemoryGallery}
      />

      {memoryGalleryLocationId ? (
        <LocationMemoriesGallery
          locationId={memoryGalleryLocationId}
          locationName={getCampusLocation(memoryGalleryLocationId).name}
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
    </button>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
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
