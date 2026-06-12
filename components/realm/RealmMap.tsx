"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compass } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { REALM_LOCATIONS, type RealmLocation, type RealmLocationId } from "@/lib/realm/locations";
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
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { fetchRealmMoments, mapApiMomentToRealmMoment } from "@/lib/client/realmMomentsClient";

type ExternalMapEventMarker = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string | null;
  eventUrl: string | null;
  source: string;
  imported: true;
  x: number;
  y: number;
};
import { RealmCampusMapLayer } from "./RealmCampusMapLayer";
import { RealmDecorLayer } from "./RealmDecorLayer";
import { RealmFootprintsLayer } from "./RealmFootprintsLayer";
import { RealmLocationSheet } from "./RealmLocationSheet";
import { RealmMapDebugPanel } from "./RealmMapDebugPanel";
import { RealmMarkerEditorPanel, type RealmMarkerEditorDebug } from "./RealmMarkerEditorPanel";
import { RealmPathsLayer } from "./RealmPathsLayer";
import { useRealmMapDiagnostics } from "./useRealmMapDiagnostics";

const MAP_ASPECT = REALM_MAP_VIEW_WIDTH / REALM_MAP_VIEW_HEIGHT;
const MAP_BASE_WIDTH = 920;

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
  viewer = null,
  userId = null,
  isAdmin = false,
  userRole = "student",
}: {
  onViewQuests?: (location: RealmLocation) => void;
  onCreatePost?: () => void;
  onViewProfile?: (userId: string) => void;
  viewer?: { id: string; name: string; username: string; avatar: string } | null;
  userId?: string | null;
  isAdmin?: boolean;
  userRole?: string;
}) {
  const [selectedLocation, setSelectedLocation] = useState<RealmLocation | null>(null);
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
  const [momentsLoaded, setMomentsLoaded] = useState(false);
  const [momentsByLocation, setMomentsByLocation] = useState<Record<string, ReturnType<typeof mapApiMomentToRealmMoment>[]>>({});
  const [externalEventMarkers, setExternalEventMarkers] = useState<ExternalMapEventMarker[]>([]);
  const [selectedExternalEvent, setSelectedExternalEvent] = useState<ExternalMapEventMarker | null>(null);
  const [mapScale, setMapScale] = useState(1);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const calibrateMode = useRealmCalibrationMode();

  const locations = useMemo(() => {
    const base = applyMarkerPositionsToLocations(REALM_LOCATIONS, draftPositions);
    return base.map((location) => {
      const moments = momentsByLocation[location.id] ?? [];
      return {
        ...location,
        moments,
        activeMomentCount: moments.length,
      };
    });
  }, [draftPositions, momentsByLocation]);

  const questGlowCount = useMemo(() => locations.filter((l) => l.activeQuests > 0).length, [locations]);
  const momentGlowCount = useMemo(
    () => locations.filter((l) => (l.activeMomentCount ?? 0) > 0).length,
    [locations],
  );

  const { debugMode, report } = useRealmMapDiagnostics({
    uriMapLoaded,
    calibrateMode,
    pinCount: locations.length,
    questGlowCount: questGlowCount + momentGlowCount,
    mapRootRef,
    isAdmin,
  });

  const loadRealmMoments = useCallback(async () => {
    try {
      const rows = await fetchRealmMoments();
      const grouped: Record<string, ReturnType<typeof mapApiMomentToRealmMoment>[]> = {};
      for (const row of rows) {
        const moment = mapApiMomentToRealmMoment(row);
        const list = grouped[row.locationId] ?? [];
        list.push(moment);
        grouped[row.locationId] = list;
      }
      setMomentsByLocation(grouped);
    } catch {
      setMomentsByLocation({});
    } finally {
      setMomentsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadRealmMoments();
  }, [loadRealmMoments]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchAuthed<{ markers: ExternalMapEventMarker[] }>("/api/external/events/map");
        setExternalEventMarkers(data.markers ?? []);
      } catch {
        setExternalEventMarkers([]);
      }
    })();
  }, []);

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
    (location: RealmLocation) => {
      if (editMode) return;
      if (process.env.NODE_ENV === "development") {
        console.log("[RealmMap] pin clicked:", location.id, location.name);
      }
      setSelectedLocation(location);
      setActiveMarkerId(location.id);
      setSheetInitialView("archive");
      setSheetOpen(true);
    },
    [editMode],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && selectedLocation) {
      console.log("[RealmMap] selectedLocation:", selectedLocation.id, selectedLocation.name);
    }
  }, [selectedLocation]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[RealmMap] archive sheet open:", sheetOpen);
    }
  }, [sheetOpen]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setActiveMarkerId(null);
  }, []);

  const handleCreatePost = useCallback(() => {
    closeSheet();
    onCreatePost?.();
  }, [closeSheet, onCreatePost]);

  const handleReset = useCallback(() => {
    transformRef.current?.centerView(1, 420);
  }, []);

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
      [id]: { x: round2(x), y: round2(y) },
    }));
  }, []);

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

  const syncMapScale = useCallback((ref: ReactZoomPanPinchRef) => {
    setMapScale(ref.state.scale);
  }, []);

  return (
    <>
      <div
        ref={mapRootRef}
        data-cq-gesture-block="all"
        data-no-drawer-swipe="true"
        className={`realm-map-shell relative overflow-hidden rounded-2xl ${
          panning ? "realm-map-shell--panning" : ""
        } ${calibrateMode ? "realm-map-shell--calibrate" : ""} ${editMode ? "realm-map-shell--edit" : ""}`}
      >
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
            excluded: ["realm-pin", "realm-map-markers"],
          }}
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
              <div ref={mapStageRef} className="realm-map-stage relative h-full w-full">
                <div className="realm-map-surface relative h-full w-full overflow-hidden rounded-md">
                  <RealmCampusMapLayer calibrateMode={calibrateMode} onLoadStateChange={setUriMapLoaded} />
                  <RealmFootprintsLayer />
                  <RealmPathsLayer />
                  {!calibrateMode ? <RealmDecorLayer /> : null}
                </div>

                <div
                  data-no-drawer-swipe="true"
                  className={`realm-map-markers absolute inset-0 z-[3] ${editMode ? "realm-map-markers--edit" : "pointer-events-none"}`}
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
                    ? externalEventMarkers.map((marker) => (
                        <ExternalEventPin
                          key={marker.id}
                          marker={marker}
                          active={selectedExternalEvent?.id === marker.id}
                          onTap={() => setSelectedExternalEvent(marker)}
                        />
                      ))
                    : null}
                </div>
              </div>
            </div>
          </TransformComponent>
        </TransformWrapper>

        <RealmMarkerEditorPanel
          debug={editorDebug}
          onEnterEdit={handleEnterEdit}
          onExitEdit={handleExitEdit}
          onSave={() => void handleSave()}
          savePending={savePending}
          saveMessage={saveMessage}
        />

        <button
          type="button"
          onClick={handleReset}
          className="realm-map-reset-btn absolute bottom-3 right-3 z-[5] flex h-10 w-10 items-center justify-center rounded-xl touch-manipulation"
          aria-label="Reset and center map"
          title="Center map"
        >
          <Compass className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>

        {calibrateMode ? (
          <p className="absolute right-3 top-3 z-[5] rounded-lg border border-amber-400/40 bg-black/60 px-2 py-1 text-[10px] text-amber-200">
            Calibration mode — full-opacity reference map
          </p>
        ) : null}

        {debugMode ? <RealmMapDebugPanel report={report} /> : null}
      </div>

      <RealmLocationSheet
        location={selectedLocation}
        open={sheetOpen}
        initialView={sheetInitialView}
        momentsLoaded={momentsLoaded}
        viewer={viewer}
        onClose={closeSheet}
        onViewQuests={onViewQuests}
        onCreatePost={handleCreatePost}
        onRefreshMoments={loadRealmMoments}
        onViewProfile={onViewProfile}
      />

      {selectedExternalEvent ? (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/55 p-3">
          <div className="w-full max-w-sm rounded-2xl border border-cyan-400/25 bg-uri-navy p-4 space-y-2 shadow-xl">
            <div className="flex justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">{selectedExternalEvent.title}</h3>
              <button
                type="button"
                className="text-white/60 hover:text-white"
                onClick={() => setSelectedExternalEvent(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-cyan-200/80">Source: URInvolved</p>
            {selectedExternalEvent.startsAt ? (
              <p className="text-xs text-white/65">{new Date(selectedExternalEvent.startsAt).toLocaleString()}</p>
            ) : null}
            {selectedExternalEvent.location ? (
              <p className="text-xs text-white/55">{selectedExternalEvent.location}</p>
            ) : null}
            {selectedExternalEvent.eventUrl ? (
              <a
                href={selectedExternalEvent.eventUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex px-3 py-2 rounded-lg text-xs font-semibold border border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/10"
              >
                View on URInvolved
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function ExternalEventPin({
  marker,
  active,
  onTap,
}: {
  marker: ExternalMapEventMarker;
  active: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      className={`realm-external-event-pin touch-manipulation ${active ? "realm-external-event-pin--active" : ""}`}
      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      aria-label={`${marker.title}. URInvolved event.`}
      data-external-event-id={marker.id}
    >
      <span className="realm-external-event-pin-dot" aria-hidden>
        📅
      </span>
    </button>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  location: RealmLocation;
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
  const hasActiveMoments = (location.activeMomentCount ?? location.moments.length) > 0;
  const dragRef = useRef({ active: false, pointerId: -1, moved: false });

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!editMode) return;

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
    if (!editMode) return;
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

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (editMode) return;
    onTap();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={editMode ? handlePointerDown : (e) => e.stopPropagation()}
      onPointerMove={editMode ? handlePointerMove : undefined}
      onPointerUp={editMode ? handlePointerUp : undefined}
      onPointerCancel={editMode ? handlePointerUp : undefined}
      className={`realm-pin map-pin group touch-manipulation ${
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
