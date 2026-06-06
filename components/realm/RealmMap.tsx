"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { REALM_LOCATIONS, type RealmLocation } from "@/lib/realm/locations";
import { REALM_MAP_VIEW_HEIGHT, REALM_MAP_VIEW_WIDTH } from "@/lib/realm/mapGeometry";
import { RealmCampusMapLayer } from "./RealmCampusMapLayer";
import { RealmFootprintsLayer } from "./RealmFootprintsLayer";
import { RealmLocationSheet } from "./RealmLocationSheet";
import { RealmMapDebugPanel } from "./RealmMapDebugPanel";
import { RealmPathsLayer } from "./RealmPathsLayer";
import { useRealmMapDiagnostics } from "./useRealmMapDiagnostics";

const MAP_ASPECT = REALM_MAP_VIEW_WIDTH / REALM_MAP_VIEW_HEIGHT;
const MAP_BASE_WIDTH = 920;

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

export function RealmMap({ onViewQuests }: { onViewQuests?: (location: RealmLocation) => void }) {
  const [selectedLocation, setSelectedLocation] = useState<RealmLocation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [uriMapLoaded, setUriMapLoaded] = useState(false);
  const [panning, setPanning] = useState(false);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const calibrateMode = useRealmCalibrationMode();

  const questGlowCount = useMemo(
    () => REALM_LOCATIONS.filter((l) => l.activeQuests > 0).length,
    [],
  );

  const { debugMode, report } = useRealmMapDiagnostics({
    uriMapLoaded,
    calibrateMode,
    pinCount: REALM_LOCATIONS.length,
    questGlowCount,
    mapRootRef,
  });

  useEffect(() => {
    document.documentElement.toggleAttribute("data-realm-map-panning", panning);
    return () => document.documentElement.removeAttribute("data-realm-map-panning");
  }, [panning]);

  const openLocation = useCallback((location: RealmLocation) => {
    setSelectedLocation(location);
    setActiveMarkerId(location.id);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setActiveMarkerId(null);
  }, []);

  const handleReset = useCallback(() => {
    transformRef.current?.centerView(1, 420);
  }, []);

  return (
    <>
      <div
        ref={mapRootRef}
        className={`realm-map-shell relative overflow-hidden rounded-2xl ${
          panning ? "realm-map-shell--panning" : ""
        } ${calibrateMode ? "realm-map-shell--calibrate" : ""}`}
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
            velocityDisabled: false,
            wheelPanning: false,
            excluded: ["realm-pin", "realm-map-markers"],
          }}
          alignmentAnimation={{ animationTime: 280, velocityAlignmentTime: 320 }}
          onPanningStart={() => setPanning(true)}
          onPanningStop={() => setPanning(false)}
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
              <div className="realm-map-stage relative h-full w-full">
                <div className="realm-map-surface relative h-full w-full overflow-hidden rounded-md">
                  <RealmCampusMapLayer
                    calibrateMode={calibrateMode}
                    onLoadStateChange={setUriMapLoaded}
                  />
                  <RealmFootprintsLayer />
                  <RealmPathsLayer />
                </div>

                <div className="realm-map-markers absolute inset-0 z-[3] pointer-events-none">
                  {REALM_LOCATIONS.map((location) => (
                    <LocationPin
                      key={location.id}
                      location={location}
                      active={activeMarkerId === location.id}
                      onTap={() => openLocation(location)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </TransformComponent>
        </TransformWrapper>

        <button
          type="button"
          onClick={handleReset}
          className="realm-map-reset-btn absolute bottom-3 right-3 z-[5] flex h-10 w-10 items-center justify-center rounded-xl touch-manipulation"
          aria-label="Reset and center map"
          title="Center map"
        >
          <Crosshair className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>

        {calibrateMode ? (
          <p className="absolute left-3 top-3 z-[5] rounded-lg border border-amber-400/40 bg-black/60 px-2 py-1 text-[10px] text-amber-200">
            Calibration mode — full-opacity reference map
          </p>
        ) : null}

        {debugMode ? <RealmMapDebugPanel report={report} /> : null}
      </div>

      <RealmLocationSheet
        location={selectedLocation}
        open={sheetOpen}
        onClose={closeSheet}
        onViewQuests={onViewQuests}
      />
    </>
  );
}

function LocationPin({
  location,
  active,
  onTap,
}: {
  location: RealmLocation;
  active: boolean;
  onTap: () => void;
}) {
  const hasActiveQuest = location.activeQuests > 0;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`realm-pin group touch-manipulation ${
        active ? "realm-pin--active" : ""
      } ${hasActiveQuest ? "realm-pin--quest" : ""}`}
      style={{ left: `${location.x}%`, top: `${location.y}%` }}
      aria-label={`${location.name}. Tap for details.`}
      data-location-id={location.id}
    >
      {hasActiveQuest ? <span className="realm-pin-quest-glow" aria-hidden /> : null}
      <span className="realm-pin-dot" aria-hidden>
        <span className="realm-pin-emoji">{location.markerEmoji}</span>
      </span>
      <span className="realm-pin-label">{location.shortLabel}</span>
    </button>
  );
}
