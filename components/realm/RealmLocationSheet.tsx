"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { X } from "lucide-react";
import type { RealmLocation } from "@/lib/realm/locations";
import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { emptyMapLocationContent } from "@/lib/mapLocationGroups";
import { LocationMemoriesSection } from "@/components/memories/LocationMemoriesSection";
import { CampusMemoryArchivePanel } from "@/components/memories/CampusMemoryArchivePanel";
import type { CampusMemoryGroup, CampusMemoryLocationStats } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { useRegisterMobileDetailLayer } from "@/components/mobile/MobileGestureLayerProvider";
import { PullToRefresh } from "@/components/PullToRefresh";
import type { RealmDirectionsDestination, RealmDirectionsStatus, RealmTravelMode } from "@/lib/realm/realmDirectionsTypes";
import { partitionMapEventsForSheet } from "@/lib/realm/eventCountdown";
import { useNow } from "@/lib/client/useNow";
import {
  buildLocationMetaPills,
  resolveLocationDetailDescription,
} from "@/lib/realm/locationDetailCopy";
import {
  LocationActivitySection,
  LocationHero,
  LocationPrimaryActions,
  LocationUpcomingHighlight,
  pickFeaturedEvent,
} from "@/components/realm/locationDetail";
import { LocationDiningMenuSection } from "@/components/realm/locationDetail/LocationDiningMenuSection";
import { isDiningMapLocation } from "@/lib/dining/uriDiningLocations";
import {
  locationSheetDragIntent,
  locationSheetDragOffset,
  locationSheetRestingOffset,
  nextLocationSheetSnap,
  type LocationSheetSnap,
} from "@/lib/realm/locationSheetSnap";

export function RealmLocationSheet({
  location,
  mapContent = null,
  open,
  memoryStats = null,
  mapContentLoaded = true,
  currentUserId = null,
  onClose,
  onRefreshMemories,
  onAddMemory,
  onOpenMemoryViewer,
  onOpenMemoryGallery,
  questReloadToken = 0,
  onRefreshAll,
  onPullRefreshAll,
  onOpenEvent,
}: {
  location: RealmLocation | null;
  mapContent?: GroupedMapLocation | null;
  open: boolean;
  memoryStats?: CampusMemoryLocationStats | null;
  mapContentLoaded?: boolean;
  currentUserId?: string | null;
  onClose: () => void;
  onRefreshMemories?: () => void;
  onAddMemory?: (locationId: CampusLocationId) => void;
  onOpenMemoryViewer?: (group: CampusMemoryGroup, initialMemoryId?: string, includeExpired?: boolean) => void;
  onOpenMemoryGallery?: (locationId: CampusLocationId) => void;
  questReloadToken?: number;
  /** Soft refresh on sheet open (no quest reload-token bump). */
  onRefreshAll?: () => void | Promise<void>;
  /** Explicit pull-to-refresh (may bump quest reload token). */
  onPullRefreshAll?: () => void | Promise<void>;
  directionsEnabled?: boolean;
  directionsDestination?: RealmDirectionsDestination | null;
  directionsStatus?: RealmDirectionsStatus;
  activeTravelMode?: RealmTravelMode | null;
  onRequestWalking?: () => void;
  onRequestDriving?: () => void;
  onClearDirections?: () => void;
  onOpenInRealmMap?: () => void;
  onOpenEvent?: (event: MapEventPin) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [archiveAvailable, setArchiveAvailable] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [snap, setSnap] = useState<LocationSheetSnap>("peek");
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const snapRef = useRef<LocationSheetSnap>("peek");
  const now = useNow(30_000);

  useRegisterMobileDetailLayer(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  const locationRefreshKey = location?.id ?? mapContent?.groupKey ?? null;

  useEffect(() => {
    setArchiveExpanded(false);
    setArchiveAvailable(false);
    setShowAllEvents(false);
    snapRef.current = "peek";
    setSnap("peek");
    if (panelRef.current) panelRef.current.style.transform = "";
  }, [locationRefreshKey, location?.id, mapContent?.realmLocationId]);

  useEffect(() => {
    if (!open) return;
    onRefreshMemories?.();
    void onRefreshAll?.();
    // Intentionally omit unstable callback identities that would re-fire while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open + location identity only
  }, [open, locationRefreshKey]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 40);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (snapRef.current === "expanded") {
        snapRef.current = "peek";
        setSnap("peek");
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const sheet = panelRef.current;
    const scroller = scrollRef.current;
    if (!sheet) return undefined;

    let drag: {
      pointerId: number;
      startY: number;
      lastY: number;
      startX: number;
      onHandle: boolean;
      active: boolean;
      resting: number;
      height: number;
    } | null = null;
    let frame = 0;
    let pendingY = 0;

    const paint = () => {
      frame = 0;
      sheet.style.transform = `translate3d(0, ${pendingY}px, 0)`;
    };

    const schedule = (y: number) => {
      pendingY = y;
      if (frame) return;
      frame = window.requestAnimationFrame(paint);
    };

    const releaseDragChrome = () => {
      sheet.classList.remove("cq-loc-sheet--dragging");
      document.documentElement.removeAttribute("data-realm-sheet-dragging");
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const interactive = Boolean(
        target.closest("button, a, input, textarea, select, label, [data-cq-horizontal-scroll]"),
      );
      const onHandle = Boolean(target.closest("[data-cq-sheet-handle]"));
      const intent = locationSheetDragIntent({
        interactive,
        onHandle,
        scrollTop: scroller?.scrollTop ?? 0,
        dx: 0,
        dy: 0,
        canScroll: false,
      });
      if (intent === "ignore") return;
      const height = sheet.getBoundingClientRect().height;
      drag = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        startX: event.clientX,
        onHandle,
        active: false,
        resting: locationSheetRestingOffset(height, snapRef.current),
        height,
      };
      if (onHandle) sheet.setPointerCapture(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.lastY = event.clientY;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.active) {
        const canScroll = Boolean(scroller && scroller.scrollHeight > scroller.clientHeight + 1);
        const intent = locationSheetDragIntent({
          interactive: false,
          onHandle: drag.onHandle,
          scrollTop: scroller?.scrollTop ?? 0,
          dx,
          dy,
          canScroll,
        });
        if (intent === "wait") return;
        if (intent === "cancel" || intent === "ignore") {
          if (sheet.hasPointerCapture(event.pointerId)) sheet.releasePointerCapture(event.pointerId);
          drag = null;
          return;
        }
        drag.active = true;
        sheet.classList.add("cq-loc-sheet--dragging");
        document.documentElement.setAttribute("data-realm-sheet-dragging", "true");
        if (!sheet.hasPointerCapture(event.pointerId)) sheet.setPointerCapture(event.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      schedule(locationSheetDragOffset(drag.resting, dy, drag.height));
    };

    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const finished = drag;
      drag = null;
      if (sheet.hasPointerCapture(event.pointerId)) sheet.releasePointerCapture(event.pointerId);
      releaseDragChrome();
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        sheet.style.transform = `translate3d(0, ${pendingY}px, 0)`;
      }
      if (!finished.active) {
        sheet.style.transform = "";
        return;
      }
      const next = nextLocationSheetSnap(snapRef.current, finished.lastY - finished.startY);
      if (next === "closed") {
        onClose();
        return;
      }
      flushSync(() => {
        snapRef.current = next;
        setSnap(next);
      });
      window.requestAnimationFrame(() => {
        sheet.style.transform = "";
      });
    };

    sheet.addEventListener("pointerdown", onDown);
    sheet.addEventListener("pointermove", onMove, { passive: false });
    sheet.addEventListener("pointerup", onUp);
    sheet.addEventListener("pointercancel", onUp);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      sheet.removeEventListener("pointerdown", onDown);
      sheet.removeEventListener("pointermove", onMove);
      sheet.removeEventListener("pointerup", onUp);
      sheet.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (frame) window.cancelAnimationFrame(frame);
      releaseDragChrome();
    };
  }, [open, onClose]);

  if (!mounted || !open || typeof document === "undefined") return null;
  if (!location && !mapContent) return null;

  const rawContent = mapContent ?? emptyMapLocationContent();
  const rawEvents = Array.isArray(rawContent.events) ? rawContent.events : [];
  const { upcoming: upcomingEvents, history: historyEvents } = partitionMapEventsForSheet(rawEvents, now);
  const content = {
    ...rawContent,
    quests: Array.isArray(rawContent.quests) ? rawContent.quests : [],
    qrCodes: Array.isArray(rawContent.qrCodes) ? rawContent.qrCodes : [],
    events: [...upcomingEvents, ...historyEvents],
  };
  const displayName = location?.name ?? mapContent?.locationName ?? "Campus location";
  const displayAddress = mapContent?.locationAddress ?? null;
  const locationId = (location?.id ?? mapContent?.realmLocationId ?? null) as CampusLocationId | null;
  const questLocationId = (
    locationId ??
    (content.quests.length > 0 || content.qrCodes.length > 0
      ? mapContent?.locationKey ?? mapContent?.groupKey ?? null
      : null)
  ) as CampusLocationId | null;
  const momentCount = memoryStats?.activeCount ?? location?.activeMomentCount ?? 0;
  const featuredEvent = pickFeaturedEvent(upcomingEvents, now);
  const heroFallbackImage =
    featuredEvent?.imageUrl ??
    upcomingEvents.find((event) => event.imageUrl)?.imageUrl ??
    historyEvents.find((event) => event.imageUrl)?.imageUrl ??
    null;
  const heroDescription = resolveLocationDetailDescription({
    location,
    displayName,
    address: displayAddress,
  });
  const pills = buildLocationMetaPills({
    location,
    eventCount: upcomingEvents.length,
    memoryCount: momentCount,
  });
  // Always mount when this location can show activity; visibility (incl. empty)
  // is owned by LocationActivitySection so we never remount on load flips.
  const hasActivitySection =
    upcomingEvents.length > 0 || historyEvents.length > 0 || Boolean(questLocationId);

  return createPortal(
    <div
      ref={panelRef}
      data-cq-location-sheet={snap}
      data-cq-gesture-block="all"
      className={`cq-realm-archive-panel cq-realm-archive-screen cq-loc-sheet cq-loc-sheet--dock${
        snap === "expanded" ? " cq-loc-sheet--expanded" : ""
      }`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="realm-sheet-title"
    >
        <div className="cq-realm-archive-screen-panel">
          <div className="cq-loc-sheet-handle" data-cq-sheet-handle>
            <div className="cq-realm-sheet-grabber" aria-hidden />
            <button
              ref={closeRef}
              type="button"
              className="cq-loc-sheet-close touch-manipulation"
              onClick={onClose}
              aria-label="Close location details"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>

          <div ref={scrollRef} className="cq-loc-scroll" data-cq-scroll-root>
          <PullToRefresh
            disabled
            className="cq-realm-archive-body min-h-0 flex-1"
            onRefresh={async () => {
              onRefreshMemories?.();
              await (onPullRefreshAll ?? onRefreshAll)?.();
            }}
          >
            <LocationHero
              location={location}
              displayName={displayName}
              description={heroDescription}
              pills={pills}
              fallbackImageUrl={heroFallbackImage}
              onBack={onClose}
              showBack={false}
            />

            <div className="cq-loc-content">
              {featuredEvent ? (
                <LocationUpcomingHighlight event={featuredEvent} now={now} onOpen={onOpenEvent} />
              ) : null}

              <LocationPrimaryActions
                onAddMemory={
                  locationId && onAddMemory ? () => onAddMemory(locationId) : undefined
                }
              />

              {locationId && isDiningMapLocation(locationId) ? (
                <LocationDiningMenuSection key={locationId} campusQuestLocationId={locationId} />
              ) : null}

              {hasActivitySection ? (
                <LocationActivitySection
                  events={upcomingEvents}
                  historyEvents={historyEvents}
                  now={now}
                  locationName={displayName}
                  locationId={questLocationId}
                  mapContent={content}
                  questReloadToken={questReloadToken}
                  eventsLoaded={mapContentLoaded}
                  showAll={showAllEvents}
                  onOpenEvent={onOpenEvent}
                  onSeeAll={
                    upcomingEvents.length > 4 || historyEvents.length > 3
                      ? () => setShowAllEvents(true)
                      : undefined
                  }
                />
              ) : null}

              {locationId && onAddMemory && onOpenMemoryViewer && onOpenMemoryGallery ? (
                <LocationMemoriesSection
                  locationId={locationId}
                  locationName={displayName}
                  onAddMemory={onAddMemory}
                  onOpenViewer={onOpenMemoryViewer}
                  onOpenGallery={onOpenMemoryGallery}
                />
              ) : null}

              {locationId ? (
                <>
                  {archiveAvailable ? (
                    <section className="cq-realm-past-memories">
                      <button
                        type="button"
                        className="cq-realm-past-memories-toggle"
                        onClick={() => setArchiveExpanded((value) => !value)}
                        aria-expanded={archiveExpanded}
                      >
                        {archiveExpanded ? "Hide past memories" : "View past memories"}
                      </button>
                    </section>
                  ) : null}
                  <CampusMemoryArchivePanel
                    userId={currentUserId ?? undefined}
                    priorityLocationId={locationId}
                    locationOnly
                    collapsed={!archiveExpanded}
                    onAvailabilityChange={setArchiveAvailable}
                    onOpenMemory={(memory) => {
                      if (!onOpenMemoryViewer) return;
                      onOpenMemoryViewer(
                        {
                          locationId: memory.locationId,
                          locationKey: memory.locationKey,
                          locationName: memory.locationName,
                          count: 1,
                          latestCreatedAt: memory.createdAt,
                          latestPreview: memory.mediaUrl,
                          latestMediaType: memory.mediaType,
                          latestAuthorAvatar: memory.authorAvatar,
                          hasRecent: false,
                        },
                        memory.id,
                        true,
                      );
                    }}
                  />
                </>
              ) : null}
            </div>
          </PullToRefresh>
          </div>
        </div>
    </div>,
    document.body,
  );
}
