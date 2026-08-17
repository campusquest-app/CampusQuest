"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { RealmLocation } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { emptyMapLocationContent } from "@/lib/mapLocationGroups";
import { LocationMemoriesSection } from "@/components/memories/LocationMemoriesSection";
import { CampusMemoryArchivePanel } from "@/components/memories/CampusMemoryArchivePanel";
import type { CampusMemoryGroup, CampusMemoryLocationStats } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { useRegisterMobileDetailLayer } from "@/components/mobile/MobileGestureLayerProvider";
import { useSwipeBack } from "@/lib/client/useSwipeBack";
import { useSwipeDownDismiss } from "@/lib/client/useSwipeDownDismiss";
import { SWIPE_TRANSITION_MS } from "@/lib/client/mobileGestures";
import { PullToRefresh } from "@/components/PullToRefresh";
import { RealmDirectionsPanel } from "@/components/realm/RealmDirectionsPanel";
import type { RealmDirectionsDestination, RealmDirectionsStatus, RealmTravelMode } from "@/lib/realm/realmDirectionsTypes";
import {
  getEventCountdownState,
  isEventCancelled,
  sortEventsForSheet,
} from "@/lib/realm/eventCountdown";
import { filterVisibleMapEvents } from "@/lib/realm/eventVisibility";
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
  directionsEnabled = false,
  directionsDestination = null,
  directionsStatus = { status: "idle" },
  activeTravelMode = null,
  onRequestWalking,
  onRequestDriving,
  onClearDirections,
  onOpenInRealmMap,
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
}) {
  const [mounted, setMounted] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [archiveAvailable, setArchiveAvailable] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const gesturesEnabled = open && mounted;
  const swipeBack = useSwipeBack({ onBack: onClose, enabled: gesturesEnabled, containerRef: panelRef });
  const swipeDown = useSwipeDownDismiss({ onDismiss: onClose, enabled: gesturesEnabled, containerRef: panelRef });
  const draggingGesture = swipeBack.dragging || swipeDown.dragging;
  const offsetX = swipeBack.dragX > 0 ? swipeBack.dragX : 0;
  const offsetY = swipeDown.dragY > 0 ? swipeDown.dragY : 0;
  const panelStyle: CSSProperties = {
    transform: offsetX > 0 || offsetY > 0 ? `translate3d(${offsetX}px, ${offsetY}px, 0)` : undefined,
    transition: draggingGesture
      ? "none"
      : offsetX > 0 || offsetY > 0
        ? `transform ${SWIPE_TRANSITION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
        : undefined,
  };
  const backdropOpacity = 1 - 0.5 * swipeDown.progress;

  if (!mounted || !open || typeof document === "undefined") return null;
  if (!location && !mapContent) return null;

  const rawContent = mapContent ?? emptyMapLocationContent();
  const content = {
    ...rawContent,
    quests: Array.isArray(rawContent.quests) ? rawContent.quests : [],
    qrCodes: Array.isArray(rawContent.qrCodes) ? rawContent.qrCodes : [],
    events: filterVisibleMapEvents(Array.isArray(rawContent.events) ? rawContent.events : []),
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
  const sortedEvents = sortEventsForSheet(content.events, now).filter((event) => {
    if (isEventCancelled(event)) return false;
    return getEventCountdownState(event.startsAt, event.endsAt, now, false).kind !== "ended";
  });
  const featuredEvent = pickFeaturedEvent(sortedEvents, now);
  const heroFallbackImage =
    featuredEvent?.imageUrl ?? sortedEvents.find((event) => event.imageUrl)?.imageUrl ?? null;
  const heroDescription = resolveLocationDetailDescription({
    location,
    displayName,
    address: displayAddress,
  });
  const pills = buildLocationMetaPills({
    location,
    eventCount: sortedEvents.length,
    memoryCount: momentCount,
  });
  // Always mount when this location can show activity; visibility (incl. empty)
  // is owned by LocationActivitySection so we never remount on load flips.
  const hasActivitySection = sortedEvents.length > 0 || Boolean(questLocationId);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close location details"
        className="realm-sheet-backdrop fixed inset-0 bg-black/60 backdrop-blur-[3px]"
        style={{ opacity: backdropOpacity }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        data-cq-swipe-back-root=""
        className="cq-swipe-back-surface cq-realm-archive-panel cq-realm-archive-screen cq-realm-archive-sheet cq-loc-sheet mx-auto max-w-lg animate-realm-sheet-up"
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="realm-sheet-title"
      >
        <div className="cq-realm-archive-atmosphere" aria-hidden />
        <div className="cq-realm-archive-screen-panel">
          <div className="cq-realm-sheet-grabber-wrap" aria-hidden>
            <div className="cq-realm-sheet-grabber" />
          </div>

          <PullToRefresh
            className="cq-realm-archive-body cq-realm-archive-body--scroll cq-loc-scroll min-h-0 flex-1"
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
            />

            <div className="cq-loc-content">
              {featuredEvent ? <LocationUpcomingHighlight event={featuredEvent} now={now} /> : null}

              <LocationPrimaryActions
                directionsEnabled={directionsEnabled}
                directionsDestination={directionsDestination}
                directionsStatus={directionsStatus}
                onRequestWalking={() => onRequestWalking?.()}
                onAddMemory={
                  locationId && onAddMemory ? () => onAddMemory(locationId) : undefined
                }
              />

              <RealmDirectionsPanel
                destination={directionsDestination}
                directionsEnabled={directionsEnabled}
                directionsStatus={directionsStatus}
                activeTravelMode={activeTravelMode}
                hidePrimaryWalk
                onRequestWalking={() => onRequestWalking?.()}
                onRequestDriving={() => onRequestDriving?.()}
                onClearDirections={() => onClearDirections?.()}
                onOpenInRealmMap={() => onOpenInRealmMap?.()}
              />

              {locationId && isDiningMapLocation(locationId) ? (
                <LocationDiningMenuSection campusQuestLocationId={locationId} />
              ) : null}

              {hasActivitySection ? (
                <LocationActivitySection
                  events={sortedEvents}
                  now={now}
                  locationName={displayName}
                  locationId={questLocationId}
                  mapContent={content}
                  questReloadToken={questReloadToken}
                  eventsLoaded={mapContentLoaded}
                  showAll={showAllEvents}
                  onSeeAll={
                    sortedEvents.length > 4 ? () => setShowAllEvents(true) : undefined
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
    </>,
    document.body,
  );
}
