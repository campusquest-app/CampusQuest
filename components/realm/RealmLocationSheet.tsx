"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import type { RealmLocation } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { emptyMapLocationContent, mapLocationQuestCount } from "@/lib/mapLocationGroups";
import { LocationMemoriesSection } from "@/components/memories/LocationMemoriesSection";
import { CampusMemoryArchivePanel } from "@/components/memories/CampusMemoryArchivePanel";
import type { CampusMemoryGroup, CampusMemoryLocationStats } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { useRegisterMobileDetailLayer } from "@/components/mobile/MobileGestureLayerProvider";
import { useSwipeBack } from "@/lib/client/useSwipeBack";
import { useSwipeDownDismiss } from "@/lib/client/useSwipeDownDismiss";
import { SWIPE_TRANSITION_MS } from "@/lib/client/mobileGestures";
import { PullToRefresh } from "@/components/PullToRefresh";
import { LocationQuestSection } from "@/components/realm/LocationQuestSection";
import { RealmDirectionsPanel } from "@/components/realm/RealmDirectionsPanel";
import { RealmLocationActionsBar } from "@/components/realm/RealmLocationActionsBar";
import { getRealmLocationHeroImage } from "@/lib/realm/locationHeroImages";
import type { RealmDirectionsDestination, RealmDirectionsStatus, RealmTravelMode } from "@/lib/realm/realmDirectionsTypes";
import { locationSheetTypeLabel, resolveLocationSheetType } from "@/lib/realm/resolveLocationSheetType";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { EventPinCard } from "@/components/realm/EventPinCard";
import { sortEventsForSheet } from "@/lib/realm/eventCountdown";
import { filterVisibleMapEvents } from "@/lib/realm/eventVisibility";
import { useNow } from "@/lib/client/useNow";
import { buildLocationActivityStatus } from "@/lib/realm/locationActivityStatus";

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
  onRefreshAll?: () => void | Promise<void>;
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
  const [loadedQuestState, setLoadedQuestState] = useState({ count: 0, loading: true });
  const panelRef = useRef<HTMLDivElement>(null);
  const now = useNow(30_000);

  useRegisterImmersiveScreen(open);
  // Keep app tab-swipe navigation disabled while this sheet is up.
  useRegisterMobileDetailLayer(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  const locationRefreshKey = location?.id ?? mapContent?.groupKey ?? null;

  useEffect(() => {
    setArchiveExpanded(false);
    setArchiveAvailable(false);
    setLoadedQuestState({ count: 0, loading: Boolean(location?.id ?? mapContent?.realmLocationId) });
  }, [locationRefreshKey, location?.id, mapContent?.realmLocationId]);

  useEffect(() => {
    if (!open) return;
    onRefreshMemories?.();
    void onRefreshAll?.();
    // Re-run when the sheet switches to a different location while staying open.
  }, [open, locationRefreshKey, onRefreshAll, onRefreshMemories]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function handleSwipeBack() {
    onClose();
  }

  // Edge swipe-back and pull-down both dismiss the shared location detail.
  // `open && mounted` ensures the gesture effects (re)attach only once the panel
  // node is actually in the DOM (the component returns null until then).
  const gesturesEnabled = open && mounted;
  const swipeBack = useSwipeBack({ onBack: handleSwipeBack, enabled: gesturesEnabled, containerRef: panelRef });
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
  // Map lifecycle rule: events vanish from the sheet 24h after they end, so
  // every count/list/preview below only sees currently-visible events.
  // Guard partial/stale payloads so one bad pin never crashes the sheet.
  const content = {
    ...rawContent,
    quests: Array.isArray(rawContent.quests) ? rawContent.quests : [],
    qrCodes: Array.isArray(rawContent.qrCodes) ? rawContent.qrCodes : [],
    events: filterVisibleMapEvents(Array.isArray(rawContent.events) ? rawContent.events : []),
  };
  const displayName = location?.name ?? mapContent?.locationName ?? "Campus location";
  const displayAddress = mapContent?.locationAddress ?? null;
  const locationId = location?.id ?? mapContent?.realmLocationId ?? null;
  const momentCount = memoryStats?.activeCount ?? location?.activeMomentCount ?? 0;
  const activeQuestCount = mapLocationQuestCount(content, locationId);
  const activeEventCount = content.events.length;
  const sheetType = resolveLocationSheetType({
    activeQuestCount,
    activeEventCount,
    momentCount,
    hasQr: content.qrCodes.length > 0,
  });
  const displayQuestCount = Math.max(activeQuestCount, loadedQuestState.count);
  const activityLoading =
    !mapContentLoaded || Boolean(locationId && loadedQuestState.loading);
  const activityStatus = buildLocationActivityStatus({
    quests: displayQuestCount,
    events: activeEventCount,
    memories: momentCount,
    loading: activityLoading,
  });
  const sortedEvents = sortEventsForSheet(content.events, now);
  const hasHappeningContent =
    activeEventCount > 0 ||
    displayQuestCount > 0 ||
    activityLoading;
  const heroDescription =
    location?.description?.trim() ||
    displayAddress?.trim() ||
    `${displayName} campus location.`;

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
        className="cq-swipe-back-surface cq-realm-archive-panel cq-realm-archive-screen cq-realm-archive-sheet mx-auto max-w-lg animate-realm-sheet-up"
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
          <SharedLocationHero
                location={location}
                displayName={displayName}
                description={heroDescription}
                sheetType={sheetType}
                onBack={onClose}
              />

              <div className="cq-realm-location-primary px-4">
                <p
                  className={`cq-realm-location-status${
                    activityLoading ? " cq-realm-location-status--loading" : ""
                  }`}
                  role="status"
                >
                  {activityStatus}
                </p>
                <RealmLocationActionsBar
                  directionsEnabled={directionsEnabled}
                  directionsDestination={directionsDestination}
                  directionsStatus={directionsStatus}
                  onRequestWalking={() => onRequestWalking?.()}
                  onAddMemory={
                    locationId && onAddMemory
                      ? () => onAddMemory(locationId as CampusLocationId)
                      : undefined
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
              </div>

              <PullToRefresh
                className="cq-realm-archive-body cq-realm-archive-body--scroll min-h-0 flex-1"
                onRefresh={async () => {
                  onRefreshMemories?.();
                  await onRefreshAll?.();
                }}
              >
                {hasHappeningContent ? (
                  <section
                    className="cq-realm-happening cq-realm-fade-in"
                    aria-labelledby="realm-happening-title"
                  >
                    <h3 id="realm-happening-title" className="cq-realm-location-section-title">
                      Happening Here
                    </h3>

                    {locationId ? (
                      <LocationQuestSection
                        locationId={locationId as CampusLocationId}
                        mapContent={content}
                        reloadToken={questReloadToken}
                        embedded
                        onStateChange={(next) => {
                          setLoadedQuestState((current) =>
                            current.count === next.count && current.loading === next.loading
                              ? current
                              : next,
                          );
                        }}
                      />
                    ) : null}

                    {sortedEvents.length > 0 ? (
                      <ul className="cq-realm-detail-list cq-realm-happening-events">
                        {sortedEvents.map((event) => (
                          <li key={event.id}>
                            <EventPinCard event={event} now={now} locationName={displayName} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : null}

                {locationId && onAddMemory && onOpenMemoryViewer && onOpenMemoryGallery ? (
                  <LocationMemoriesSection
                    locationId={locationId as CampusLocationId}
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
                      priorityLocationId={locationId as CampusLocationId}
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
              </PullToRefresh>
        </div>
      </div>
    </>,
    document.body,
  );
}

function SharedLocationHero({
  location,
  displayName,
  description,
  sheetType,
  onBack,
}: {
  location: RealmLocation | null;
  displayName: string;
  description: string;
  sheetType: ReturnType<typeof resolveLocationSheetType>;
  onBack: () => void;
}) {
  const heroImage = location ? getRealmLocationHeroImage(location.id) : null;

  return (
    <header className="cq-realm-location-hero cq-realm-hero-enter">
      <div className="cq-realm-location-hero-media" aria-hidden>
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImage} alt="" className="cq-realm-location-hero-image" />
        ) : (
          <div className="cq-realm-location-hero-fallback">
            <span className="text-4xl">{location?.markerEmoji ?? "📍"}</span>
          </div>
        )}
        <div className="cq-realm-location-hero-gradient" />
      </div>

      <div className="cq-realm-location-hero-top">
        <button
          type="button"
          onClick={onBack}
          className="cq-realm-archive-back-btn cq-realm-location-back touch-manipulation"
          aria-label="Back to map"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.4} />
          Back
        </button>
        <div className="cq-realm-archive-grabber cq-realm-location-grabber" aria-hidden />
      </div>

      <div className="cq-realm-location-hero-content">
        <p className="cq-realm-location-hero-badge">
          <span className={`cq-realm-sheet-type cq-realm-sheet-type--${sheetType}`}>
            {location?.category
              ? formatLocationCategory(location.category)
              : locationSheetTypeLabel(sheetType)}
          </span>
        </p>
        <h2 id="realm-sheet-title" className="cq-realm-location-hero-title">
          {displayName}
        </h2>
        <p className="cq-realm-location-hero-flavor">{description}</p>
      </div>
    </header>
  );
}

function formatLocationCategory(category: string): string {
  const normalized = category.trim().replace(/[_-]+/g, " ");
  if (!normalized) return "Location";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
