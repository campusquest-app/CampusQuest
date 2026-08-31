"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronUp } from "lucide-react";
import {
  buildRhodyHighlights,
  campusWalkTimeStatus,
  cycleDiscoverySnap,
  discoverySheetSnaps,
  readSavedPlaceIds,
  snapFromVelocity,
  toggleSavedPlaceId,
  type DiscoverySheetSnap,
  type NearbyPlaceCard,
  type WalkOrigin,
  type WalkTimeStatus,
} from "@/lib/realm/discoverySheet";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { DiscoverForYou } from "./DiscoverForYou";
import { RecommendedPlacesCarousel } from "./RecommendedPlacesCarousel";
import { RhodyHighlights } from "./RhodyHighlights";

type SheetDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  startH: number;
  lastY: number;
  lastT: number;
  velocity: number;
  moved: boolean;
  mode: "pending" | "sheet" | "scroll";
  fromHandle: boolean;
};

function isSheetInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [data-cq-sheet-no-drag], .cq-nearby-places__scroller',
    ),
  );
}

export function RealmDiscoverySheet({
  items,
  groups,
  nearbyPlaces,
  snap,
  onSnapChange,
  onHeightChange,
  onOpenRecommendation,
  onOpenPlace,
  onViewAthletics,
  onFindMyCampus,
  onViewAllRecommendations,
  walkOrigin = null,
  locating = false,
}: {
  items: MapRecommendationItem[];
  groups: GroupedMapLocation[];
  nearbyPlaces: NearbyPlaceCard[];
  snap: DiscoverySheetSnap;
  onSnapChange: (next: DiscoverySheetSnap) => void;
  onHeightChange?: (heightPx: number) => void;
  onOpenRecommendation: (item: MapRecommendationItem) => void;
  onOpenPlace: (place: NearbyPlaceCard) => void;
  onViewAthletics?: () => void;
  onFindMyCampus?: () => void;
  onViewAllRecommendations?: () => void;
  walkOrigin?: WalkOrigin | null;
  locating?: boolean;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLElement>(null);
  const dragRef = useRef<SheetDrag | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const [viewportH, setViewportH] = useState(() => (typeof window === "undefined" ? 844 : window.innerHeight));
  const [navClearancePx, setNavClearancePx] = useState(88);
  const [contentHeightPx, setContentHeightPx] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => readSavedPlaceIds());

  const snaps = useMemo(
    () => discoverySheetSnaps(viewportH, 120, navClearancePx, contentHeightPx ?? undefined),
    [viewportH, navClearancePx, contentHeightPx],
  );
  const walkStatus: WalkTimeStatus = campusWalkTimeStatus(walkOrigin, locating);
  const useAutoDefault = snap === "default" && dragHeight == null;
  const height = dragHeight ?? snaps[snap];

  useEffect(() => {
    dragHeightRef.current = dragHeight;
  }, [dragHeight]);

  useEffect(() => {
    onHeightChange?.(height);
  }, [height, onHeightChange]);

  useEffect(() => {
    const measure = () => {
      setViewportH(window.innerHeight);
      const dock = document.querySelector(".cq-dock-nav");
      if (dock instanceof HTMLElement) {
        const top = dock.getBoundingClientRect().top;
        if (top > 0) setNavClearancePx(Math.max(64, Math.round(window.innerHeight - top)));
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  const measureContent = useCallback(() => {
    const body = bodyRef.current;
    const handle = handleRef.current;
    if (!body) return;
    const next = Math.round(body.scrollHeight + (handle?.offsetHeight ?? 28));
    setContentHeightPx((prev) => (prev === next ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measureContent();
  }, [items, groups, nearbyPlaces, snap, measureContent]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measureContent());
    observer.observe(body);
    return () => observer.disconnect();
  }, [measureContent, snap]);

  const athletics = useMemo(() => buildRhodyHighlights(groups), [groups]);
  const forYouRows = useMemo(
    () => items.filter((item) => item.kind !== "place").slice(0, 4),
    [items],
  );

  const settle = useCallback(
    (next: DiscoverySheetSnap) => {
      setDragHeight(null);
      onSnapChange(next);
    },
    [onSnapChange],
  );

  const measuredSheetHeight = () => sheetRef.current?.offsetHeight ?? height;

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    fromHandle: boolean,
  ) => {
    if (event.button !== 0) return false;
    if (!fromHandle && isSheetInteractiveTarget(event.target)) return false;
    const body = bodyRef.current;
    if (!fromHandle && body && body.scrollTop > 1) return false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startH: measuredSheetHeight(),
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      moved: false,
      mode: fromHandle ? "sheet" : "pending",
      fromHandle,
    };
    if (fromHandle) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    return true;
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const dt = Math.max(1, event.timeStamp - drag.lastT);
    const dy = drag.lastY - event.clientY;
    drag.velocity = dy / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;

    const totalDx = event.clientX - drag.startX;
    const totalDy = event.clientY - drag.startY;
    const absDx = Math.abs(totalDx);
    const absDy = Math.abs(totalDy);

    if (drag.mode === "pending") {
      if (absDx < 8 && absDy < 8) return;
      // Prefer horizontal carousels / map pans over sheet drag.
      if (absDx > absDy) {
        dragRef.current = null;
        return;
      }
      const fingerDown = totalDy > 0;
      const body = bodyRef.current;
      const atTop = !body || body.scrollTop <= 1;
      if (fingerDown && atTop) {
        drag.mode = "sheet";
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (!fingerDown && snap !== "expanded") {
        drag.mode = "sheet";
        event.currentTarget.setPointerCapture(event.pointerId);
      } else {
        drag.mode = "scroll";
        return;
      }
    }

    if (drag.mode !== "sheet") return;

    if (absDy > 8) drag.moved = true;
    event.preventDefault();
    const next = Math.min(
      snaps.expanded,
      Math.max(snaps.collapsed, drag.startH + (drag.startY - event.clientY)),
    );
    setDragHeight(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    const velocity = drag.velocity;
    const startH = drag.startH;
    const startY = drag.startY;
    const mode = drag.mode;
    dragRef.current = null;

    if (mode !== "sheet") return;

    const current =
      dragHeightRef.current ??
      Math.min(snaps.expanded, Math.max(snaps.collapsed, startH + (startY - event.clientY)));
    settle(snapFromVelocity(current, velocity, snaps));

    if (moved && drag.fromHandle) {
      (event.currentTarget as HTMLElement).dataset.cqSheetDidDrag = "1";
    }
  };

  return (
    <section
      ref={sheetRef}
      className={`cq-realm-sheet cq-realm-sheet--${snap}${dragHeight != null ? " cq-realm-sheet--dragging" : ""}${
        useAutoDefault ? " cq-realm-sheet--auto" : ""
      }`}
      style={useAutoDefault ? { height: "auto", maxHeight: snaps.default } : { height }}
      aria-label="Campus discovery"
      data-no-drawer-swipe="true"
    >
      <header
        ref={handleRef}
        className="cq-realm-sheet__handle-hit"
        data-cq-gesture-block="all"
        onPointerDown={(event) => beginDrag(event, true)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={(event) => {
          if ((event.currentTarget as HTMLElement).dataset.cqSheetDidDrag === "1") {
            delete (event.currentTarget as HTMLElement).dataset.cqSheetDidDrag;
            return;
          }
          settle(cycleDiscoverySnap(snap));
        }}
      >
        <span className="cq-realm-sheet__handle" aria-hidden />
        {snap === "collapsed" ? (
          <p className="cq-realm-sheet__peek">
            Discover Around Campus
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </p>
        ) : null}
      </header>
      {snap !== "collapsed" ? (
        <div
          ref={bodyRef}
          className="cq-realm-sheet__body"
          onPointerDown={(event) => beginDrag(event, false)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="cq-realm-sheet__split">
            <RhodyHighlights items={athletics} onViewAthletics={onViewAthletics} />
            <DiscoverForYou
              items={forYouRows}
              onStartGeniusMining={onFindMyCampus}
              onViewAll={onViewAllRecommendations}
              onOpenItem={onOpenRecommendation}
            />
          </div>
          <RecommendedPlacesCarousel
            items={nearbyPlaces}
            savedIds={savedIds}
            walkStatus={walkStatus}
            onOpen={onOpenPlace}
            onToggleSave={(id) => setSavedIds(toggleSavedPlaceId(id))}
          />
        </div>
      ) : null}
    </section>
  );
}
