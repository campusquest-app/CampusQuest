"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronUp } from "lucide-react";
import {
  collectAthleticsHighlights,
  cycleDiscoverySnap,
  discoverySheetSnaps,
  readSavedPlaceIds,
  snapFromVelocity,
  toggleSavedPlaceId,
  type DiscoverySheetSnap,
  type NearbyPlaceCard,
} from "@/lib/realm/discoverySheet";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { DiscoverForYou } from "./DiscoverForYou";
import { RecommendedPlacesCarousel } from "./RecommendedPlacesCarousel";
import { RhodyHighlights } from "./RhodyHighlights";

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
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startH: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const [viewportH, setViewportH] = useState(() => (typeof window === "undefined" ? 844 : window.innerHeight));
  const [navClearancePx, setNavClearancePx] = useState(88);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => readSavedPlaceIds());

  const snaps = useMemo(() => discoverySheetSnaps(viewportH, 88, navClearancePx), [viewportH, navClearancePx]);
  const height = dragHeight ?? snaps[snap];

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

  useEffect(() => {
    onHeightChange?.(snaps[snap]);
  }, [onHeightChange, snap, snaps]);

  const athletics = useMemo(() => collectAthleticsHighlights(groups), [groups]);
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

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startH: height,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    const dy = drag.lastY - event.clientY;
    drag.velocity = dy / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    if (Math.abs(event.clientY - drag.startY) > 8) drag.moved = true;
    const next = Math.min(snaps.expanded, Math.max(snaps.collapsed, drag.startH + (drag.startY - event.clientY)));
    setDragHeight(next);
  };

  const onHandlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    dragRef.current = null;
    const current = dragHeight ?? height;
    settle(snapFromVelocity(current, drag.velocity, snaps));
    if (moved) {
      (event.currentTarget as HTMLElement).dataset.cqSheetDidDrag = "1";
    }
  };

  const onBodyTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const el = bodyRef.current;
    if (!el || snap !== "expanded") return;
    if (el.scrollTop > 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-cq-horizontal-scroll='true']")) return;
  };

  return (
    <section
      ref={sheetRef}
      className={`cq-realm-sheet cq-realm-sheet--${snap}${dragHeight != null ? " cq-realm-sheet--dragging" : ""}`}
      style={{ height }}
      aria-label="Campus discovery"
      aria-expanded={snap !== "collapsed"}
      data-no-drawer-swipe="true"
    >
      <header
        className="cq-realm-sheet__handle-hit"
        data-cq-gesture-block="all"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
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
          onTouchStart={onBodyTouchStart}
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
            onOpen={onOpenPlace}
            onToggleSave={(id) => setSavedIds(toggleSavedPlaceId(id))}
          />
        </div>
      ) : null}
    </section>
  );
}
