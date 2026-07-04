"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, Sparkles, TrendingUp, X } from "lucide-react";
import type { RealmLocation } from "@/lib/realm/locations";
import { formatRealmEventLabel, getRealmEventUrgency } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { emptyMapLocationContent, mapLocationActivityCount, mapLocationQuestCount } from "@/lib/mapLocationGroups";
import {
  getQuestCardKey,
  getQuestCardScanPath,
  getQuestCardTitle,
  getQuestCardXp,
  hasQrQuestCard,
  mergeLocationQuestCards,
  type LocationQuestCard,
} from "@/lib/realm/locationQuestDedupe";
import { RealmArchiveExperience } from "./RealmArchiveExperience";
import { LocationMemoriesSection } from "@/components/memories/LocationMemoriesSection";
import { CampusMemoryArchivePanel } from "@/components/memories/CampusMemoryArchivePanel";
import type { CampusMemoryGroup, CampusMemoryLocationStats } from "@/lib/types";
import type { CampusLocationId } from "@/lib/locations/registry";
import { useRegisterMobileDetailLayer } from "@/components/mobile/MobileGestureLayerProvider";
import { useSwipeBack } from "@/lib/client/useSwipeBack";
import { useSwipeDownDismiss } from "@/lib/client/useSwipeDownDismiss";
import { SWIPE_TRANSITION_MS } from "@/lib/client/mobileGestures";
import type { SharePostTarget } from "@/lib/client/dmMessagesClient";
import { PullToRefresh } from "@/components/PullToRefresh";
import { LocationQuestSection } from "@/components/realm/LocationQuestSection";
import { getRealmLocationHeroImage } from "@/lib/realm/locationHeroImages";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";

type SheetView = "archive" | "overview" | "quests" | "events";

type ArchiveViewer = { id: string; name: string; username: string; avatar: string };

export function RealmLocationSheet({
  location,
  mapContent = null,
  open,
  initialView = "archive",
  memoriesLoaded = true,
  memoryStats = null,
  mapContentLoaded = true,
  viewer = null,
  currentUserId = null,
  onCreatePost,
  onClose,
  onViewQuests,
  onRefreshMemories,
  onViewProfile,
  onSharePost,
  onAddMemory,
  onOpenMemoryViewer,
  onOpenMemoryGallery,
  questReloadToken = 0,
  onRefreshAll,
}: {
  location: RealmLocation | null;
  mapContent?: GroupedMapLocation | null;
  open: boolean;
  initialView?: SheetView;
  memoriesLoaded?: boolean;
  memoryStats?: CampusMemoryLocationStats | null;
  mapContentLoaded?: boolean;
  viewer?: ArchiveViewer | null;
  currentUserId?: string | null;
  onCreatePost?: () => void;
  onClose: () => void;
  onViewQuests?: (location: RealmLocation) => void;
  onRefreshMemories?: () => void;
  onViewProfile?: (userId: string) => void;
  onSharePost?: (target: SharePostTarget) => void;
  onAddMemory?: (locationId: CampusLocationId) => void;
  onOpenMemoryViewer?: (group: CampusMemoryGroup, initialMemoryId?: string, includeExpired?: boolean) => void;
  onOpenMemoryGallery?: (locationId: CampusLocationId) => void;
  questReloadToken?: number;
  onRefreshAll?: () => void | Promise<void>;
}) {
  const [view, setView] = useState<SheetView>("archive");
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useRegisterImmersiveScreen(open);
  // Keep app tab-swipe navigation disabled while this sheet is up.
  useRegisterMobileDetailLayer(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setView("archive");
      return;
    }
    setView(initialView);
  }, [open, initialView]);

  const locationRefreshKey = location?.id ?? mapContent?.groupKey ?? null;

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
    if (view === "quests" || view === "events") {
      setView("overview");
      return;
    }
    if (view === "overview" && location) {
      setView("archive");
      return;
    }
    onClose();
  }

  // Edge swipe-back (horizontal) navigates sub-views / closes; pull-down (vertical) dismisses.
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

  const content = mapContent ?? emptyMapLocationContent();
  const displayName = location?.name ?? mapContent?.locationName ?? "Campus location";
  const displayAddress = mapContent?.locationAddress ?? null;
  const locationId = location?.id ?? mapContent?.realmLocationId ?? null;
  const momentCount = memoryStats?.activeCount ?? location?.activeMomentCount ?? 0;
  const archivedCount = memoryStats?.archivedCount ?? 0;
  const activeQuestCount = mapLocationQuestCount(content, locationId);
  const activeEventCount = content.events.length;
  const urgency = getRealmEventUrgency(
    activeEventCount > 0 && content.events[0]
      ? {
          status: new Date(content.events[0].startsAt) <= new Date() ? "active" : "countdown",
          label: content.events[0].title,
          minutesUntilStart: Math.max(
            0,
            Math.round((new Date(content.events[0].startsAt).getTime() - Date.now()) / 60_000),
          ),
        }
      : { status: "countdown", minutesUntilStart: 999, label: "No scheduled events" },
  );
  const eventLabel = formatRealmEventLabel(
    activeEventCount > 0 && content.events[0]
      ? {
          status: new Date(content.events[0].startsAt) <= new Date() ? "active" : "countdown",
          label: content.events[0].title,
          minutesUntilStart: Math.max(
            0,
            Math.round((new Date(content.events[0].startsAt).getTime() - Date.now()) / 60_000),
          ),
        }
      : { status: "countdown", minutesUntilStart: 999, label: "No scheduled events" },
  );
  const activityLine = buildActivityLine({
    activeQuests: activeQuestCount,
    activeEvents: activeEventCount,
    momentCount,
  });

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close location archive"
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
          {view === "archive" && location ? (
            <>
              <RealmArchiveHeader
                location={location}
                momentCount={momentCount}
                archivedCount={archivedCount}
                activeQuestCount={activeQuestCount}
                activeEventCount={activeEventCount}
                memoriesLoaded={memoriesLoaded}
                mapContentLoaded={mapContentLoaded}
                onBack={onClose}
              />

              <PullToRefresh
                className="cq-realm-archive-body cq-realm-archive-body--scroll min-h-0 flex-1"
                onRefresh={async () => {
                  onRefreshMemories?.();
                  await onRefreshAll?.();
                }}
              >
                {onAddMemory && onOpenMemoryViewer && onOpenMemoryGallery ? (
                  <LocationMemoriesSection
                    locationId={location.id}
                    locationName={location.name}
                    onAddMemory={onAddMemory}
                    onOpenViewer={onOpenMemoryViewer}
                    onOpenGallery={onOpenMemoryGallery}
                  />
                ) : (
                  <RealmArchiveExperience
                    location={location}
                    moments={location.moments}
                    loaded={memoriesLoaded}
                    viewer={viewer}
                    onCreatePost={onCreatePost}
                    onViewProfile={onViewProfile}
                    onSharePost={onSharePost}
                  />
                )}

                <LocationQuestSection
                  locationId={location.id}
                  mapContent={content}
                  reloadToken={questReloadToken}
                />

                <p className="cq-realm-archive-section-label cq-realm-archive-section-label--spaced">
                  <span className="cq-realm-archive-section-label-icon" aria-hidden>
                    ✦
                  </span>
                  Memory Archive
                </p>
                <CampusMemoryArchivePanel
                  userId={currentUserId ?? undefined}
                  priorityLocationId={location.id}
                  locationOnly
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

                <MapActivityPreview
                  content={content}
                  locationId={locationId}
                  loaded={mapContentLoaded}
                  urgency={urgency}
                  eventLabel={eventLabel}
                  onViewOverview={() => setView("overview")}
                  onViewQuests={() => setView("quests")}
                  onViewEvents={() => setView("events")}
                  onAddMemory={onAddMemory ? () => onAddMemory(location.id) : undefined}
                />

                <footer className="cq-realm-archive-activity">
                  <TrendingUp className="cq-realm-archive-activity-icon" aria-hidden />
                  <p>{activityLine}</p>
                </footer>
              </PullToRefresh>
            </>
          ) : view !== "archive" ? (
            <RealmDetailView
              view={view}
              location={location}
              displayName={displayName}
              displayAddress={displayAddress}
              content={content}
              locationId={locationId}
              loaded={mapContentLoaded}
              urgency={urgency}
              eventLabel={eventLabel}
              momentCount={momentCount}
              activeQuestCount={activeQuestCount}
              activeEventCount={activeEventCount}
              onBack={() => {
                if (location) {
                  setView(view === "overview" ? "archive" : "overview");
                } else {
                  onClose();
                }
              }}
              onClose={onClose}
              onViewQuests={() => {
                if (location) onViewQuests?.(location);
                setView("quests");
              }}
              onOpenArchive={() => setView("archive")}
            />
          ) : null}
        </div>
      </div>
    </>,
    document.body,
  );
}

function RealmArchiveHeader({
  location,
  momentCount,
  archivedCount,
  activeQuestCount,
  activeEventCount,
  memoriesLoaded,
  mapContentLoaded,
  onBack,
}: {
  location: RealmLocation;
  momentCount: number;
  archivedCount: number;
  activeQuestCount: number;
  activeEventCount: number;
  memoriesLoaded: boolean;
  mapContentLoaded: boolean;
  onBack: () => void;
}) {
  const heroImage = getRealmLocationHeroImage(location.id);

  return (
    <header className="cq-realm-location-hero cq-realm-hero-enter">
      <div className="cq-realm-location-hero-media" aria-hidden>
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImage} alt="" className="cq-realm-location-hero-image" />
        ) : (
          <div className="cq-realm-location-hero-fallback">
            <span className="text-4xl">{location.markerEmoji}</span>
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
          <span aria-hidden>{location.markerEmoji}</span>
          <span>{location.fantasyName}</span>
        </p>
        <h2 id="realm-sheet-title" className="cq-realm-location-hero-title">
          {location.name}
        </h2>
        <p className="cq-realm-location-hero-flavor">{location.flavorText}</p>
      </div>

      <div className="cq-realm-location-stat-grid" role="list" aria-label="Location stats">
        <LocationStatCell label="Live" count={momentCount} loading={!memoriesLoaded} />
        <LocationStatCell label="Archived" count={archivedCount} loading={!memoriesLoaded} />
        <LocationStatCell label="Quests" count={activeQuestCount} loading={!mapContentLoaded} />
        <LocationStatCell label="Events" count={activeEventCount} loading={!mapContentLoaded} />
      </div>
    </header>
  );
}

function LocationStatCell({
  label,
  count,
  loading,
}: {
  label: string;
  count: number;
  loading: boolean;
}) {
  return (
    <div className="cq-realm-location-stat" role="listitem">
      <span className={`cq-realm-location-stat-value${count > 0 ? " cq-realm-location-stat-value--accent" : ""}`}>
        {loading ? "…" : count}
      </span>
      <span className="cq-realm-location-stat-label">{label}</span>
    </div>
  );
}

function StatChip({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="cq-realm-archive-stat-chip" role="listitem">
      <span aria-hidden>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}

function MapActivityPreview({
  content,
  locationId,
  loaded,
  urgency,
  eventLabel,
  onViewOverview,
  onViewQuests,
  onViewEvents,
  onAddMemory,
}: {
  content: Pick<GroupedMapLocation, "qrCodes" | "quests" | "events">;
  locationId?: string | null;
  loaded: boolean;
  urgency: ReturnType<typeof getRealmEventUrgency>;
  eventLabel: string;
  onViewOverview: () => void;
  onViewQuests: () => void;
  onViewEvents: () => void;
  onAddMemory?: () => void;
}) {
  const questCards = mergeLocationQuestCards({
    qrCodes: content.qrCodes,
    mapQuests: content.quests,
    boardQuests: [],
    locationId,
  });
  const hasActivity = mapLocationActivityCount(content, locationId) > 0;
  const previewQuest = questCards[0];
  const previewEvent = content.events[0];

  if (!loaded) {
    return (
      <section className="cq-realm-archive-secondary cq-realm-fade-in" aria-label="Quests and events">
        <p className="cq-realm-archive-secondary-empty">Loading campus activities…</p>
      </section>
    );
  }

  if (!hasActivity) {
    return (
      <section className="cq-realm-archive-secondary cq-realm-location-quiet cq-realm-fade-in" aria-label="Quests and events">
        <div className="cq-realm-location-quiet-card">
          <Calendar className="cq-realm-location-quiet-icon" strokeWidth={1.75} aria-hidden />
          <p className="cq-realm-location-quiet-title">No quests or events happening here right now.</p>
          {onAddMemory ? (
            <p className="cq-realm-location-quiet-copy">Be the first to create a memory at this location.</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="cq-realm-archive-secondary" aria-label="Quests and events">
      <div className="cq-realm-archive-secondary-head">
        <h3 className="cq-realm-archive-secondary-title">Quests &amp; Events</h3>
        <button type="button" className="cq-realm-archive-secondary-link" onClick={onViewOverview}>
          See all
        </button>
      </div>

      <div className="cq-realm-archive-secondary-grid">
        <div className="cq-realm-archive-secondary-col space-y-2">
          {previewQuest ? (
            <button type="button" className="cq-realm-archive-quest-row w-full" onClick={onViewQuests}>
              <span className="cq-realm-archive-quest-row-icon">
                {hasQrQuestCard(previewQuest) ? (
                  <span>📷</span>
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              <span className="cq-realm-archive-quest-row-body">
                <span className="cq-realm-archive-quest-row-name">{getQuestCardTitle(previewQuest)}</span>
                <span className="cq-realm-archive-quest-row-meta">
                  {hasQrQuestCard(previewQuest)
                    ? `QR · +${getQuestCardXp(previewQuest)} XP`
                    : `+${getQuestCardXp(previewQuest)} XP`}
                </span>
              </span>
            </button>
          ) : null}
        </div>

        {previewEvent ? (
          <button type="button" className="cq-realm-archive-event-chip" onClick={onViewEvents}>
            <span className="cq-realm-archive-event-chip-label">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{previewEvent.title}</span>
            </span>
            <span className={`cq-realm-archive-event-chip-badge cq-realm-archive-event-chip-badge--${urgency}`}>
              {eventLabel}
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RealmDetailView({
  view,
  location,
  displayName,
  displayAddress,
  content,
  locationId,
  loaded,
  urgency,
  eventLabel,
  momentCount,
  activeQuestCount,
  activeEventCount,
  onBack,
  onClose,
  onViewQuests,
  onOpenArchive,
}: {
  view: Exclude<SheetView, "archive">;
  location: RealmLocation | null;
  displayName: string;
  displayAddress: string | null;
  content: Pick<GroupedMapLocation, "qrCodes" | "quests" | "events">;
  locationId?: string | null;
  loaded: boolean;
  urgency: ReturnType<typeof getRealmEventUrgency>;
  eventLabel: string;
  momentCount: number;
  activeQuestCount: number;
  activeEventCount: number;
  onBack: () => void;
  onClose: () => void;
  onViewQuests: () => void;
  onOpenArchive: () => void;
}) {
  const questCards = mergeLocationQuestCards({
    qrCodes: content.qrCodes,
    mapQuests: content.quests,
    boardQuests: [],
    locationId,
  });

  return (
    <div className="cq-realm-detail-scroll">
      <header className="cq-realm-detail-header">
        <div className="cq-realm-archive-toolbar-row">
          <button type="button" onClick={onBack} className="cq-realm-archive-back-btn touch-manipulation">
            <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.4} />
            Back
          </button>
          <button type="button" onClick={onClose} className="cq-realm-detail-close" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cq-realm-archive-identity cq-realm-archive-identity--compact">
          {location ? (
            <p className="cq-realm-archive-fantasy-banner">
              <span aria-hidden>{location.markerEmoji}</span>
              <span>{location.fantasyName}</span>
            </p>
          ) : null}
          <h2 className="cq-realm-archive-location-name">{displayName}</h2>
          {displayAddress ? <p className="cq-realm-archive-flavor">{displayAddress}</p> : null}
        </div>

        <div className="cq-realm-archive-stat-chips" role="list" aria-label="Location stats">
          {location ? (
            <StatChip emoji="📸" label={`${momentCount} ${momentCount === 1 ? "Memory" : "Memories"}`} />
          ) : null}
          <StatChip emoji="⚔️" label={`${activeQuestCount} ${activeQuestCount === 1 ? "Activity" : "Activities"}`} />
          <StatChip emoji="📅" label={`${activeEventCount} ${activeEventCount === 1 ? "Event" : "Events"}`} />
        </div>
      </header>

      {view === "overview" ? (
        <div className="cq-realm-detail-body space-y-4">
          {!loaded ? <EmptyPanel message="Loading campus activities…" /> : null}
          {loaded && mapLocationActivityCount(content, locationId) === 0 ? (
            <EmptyPanel message="No active QR codes, quests, or events at this location." />
          ) : null}
          {loaded ? (
            <>
              {questCards.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="cq-realm-detail-title">Active Quests</h3>
                  <ul className="cq-realm-detail-list">
                    {questCards.map((card) => (
                      <MergedQuestDetailRow key={getQuestCardKey(card)} card={card} onViewQuests={onViewQuests} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {content.events.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="cq-realm-detail-title">Active Events</h3>
                  <ul className="cq-realm-detail-list">
                    {content.events.map((event) => (
                      <li key={event.id} className="cq-realm-detail-event-card">
                        <div className="min-w-0 flex-1">
                          <p className="cq-realm-detail-quest-name">{event.title}</p>
                          <p className="cq-realm-archive-quest-row-meta">
                            {new Date(event.startsAt).toLocaleString()}
                          </p>
                          {event.organizationName ? (
                            <p className="text-[11px] text-white/45">{event.organizationName}</p>
                          ) : null}
                        </div>
                        <span className={`cq-realm-archive-event-chip-badge cq-realm-archive-event-chip-badge--${urgency}`}>
                          {eventLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {location ? (
            <SheetActionButton onClick={onOpenArchive}>
              {momentCount > 0 ? `Memory Archive (${momentCount})` : "Memory Archive"}
            </SheetActionButton>
          ) : null}
        </div>
      ) : null}

      {view === "quests" ? (
        <div className="cq-realm-detail-body">
          <h3 className="cq-realm-detail-title">Active Quests &amp; QR</h3>
          <p className="cq-realm-detail-subtitle">{displayName}</p>
          {questCards.length === 0 ? (
            <EmptyPanel message="No active quests or QR codes here right now." />
          ) : (
            <ul className="cq-realm-detail-list">
              {questCards.map((card) => (
                <MergedQuestDetailRow key={getQuestCardKey(card)} card={card} onViewQuests={onViewQuests} compact />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {view === "events" ? (
        <div className="cq-realm-detail-body">
          <h3 className="cq-realm-detail-title">Upcoming Events</h3>
          <p className="cq-realm-detail-subtitle">{displayName}</p>
          {content.events.length === 0 ? (
            <EmptyPanel message="No upcoming events scheduled at this location." />
          ) : (
            <ul className="cq-realm-detail-list">
              {content.events.map((event) => (
                <li key={event.id} className="cq-realm-detail-event-card">
                  <div className="min-w-0 flex-1">
                    <p className="cq-realm-detail-quest-name">{event.title}</p>
                    <p className="cq-realm-archive-quest-row-meta">{new Date(event.startsAt).toLocaleString()}</p>
                    {event.organizationName ? (
                      <p className="text-[11px] text-white/45">{event.organizationName}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MergedQuestDetailRow({
  card,
  onViewQuests,
  compact = false,
}: {
  card: LocationQuestCard;
  onViewQuests: () => void;
  compact?: boolean;
}) {
  const scanPath = getQuestCardScanPath(card);
  const showQr = hasQrQuestCard(card);
  const title = getQuestCardTitle(card);
  const xp = getQuestCardXp(card);
  const expiresAt =
    card.kind === "qr" ? card.qr.expiresAt : card.kind === "board" ? card.item.endsAt : null;
  const difficulty = card.kind === "board" ? card.item.difficulty : null;
  const completionMethod = card.kind === "board" ? card.item.completionMethod : null;
  const icon = card.kind === "board" ? card.item.icon : null;

  return (
    <li className="cq-realm-detail-quest-card">
      <span className="cq-realm-archive-quest-row-icon">
        {showQr ? (
          <span>📷</span>
        ) : icon ? (
          <span>{icon}</span>
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="cq-realm-detail-quest-name">{title}</span>
        <span className="cq-realm-archive-quest-row-meta capitalize">
          {showQr ? `QR · +${xp} XP` : difficulty ? `${difficulty} · +${xp} XP` : `+${xp} XP`}
        </span>
        {!compact && completionMethod && !showQr ? (
          <span className="block text-[11px] text-white/45 capitalize">
            {completionMethod.replace(/_/g, " ")}
          </span>
        ) : null}
        {!compact && expiresAt ? (
          <span className="block text-[11px] text-white/45">Expires {new Date(expiresAt).toLocaleString()}</span>
        ) : null}
      </span>
      {scanPath ? (
        <a
          href={scanPath}
          className={
            compact
              ? "cq-realm-archive-quest-row-xp text-uri-gold"
              : "inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-uri-gold/35 text-uri-gold hover:bg-uri-gold/10"
          }
        >
          Scan
        </a>
      ) : (
        <button
          type="button"
          onClick={onViewQuests}
          className="inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-uri-keaney/35 text-uri-keaney hover:bg-uri-keaney/10"
        >
          View
        </button>
      )}
    </li>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="cq-realm-detail-empty">{message}</div>;
}

function SheetActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="cq-realm-detail-btn w-full">
      {children}
    </button>
  );
}

function buildActivityLine(args: {
  activeQuests: number;
  activeEvents: number;
  momentCount: number;
}): string {
  if (args.activeQuests > 0 && args.momentCount > 0) {
    return "Rams are active here — quests running and fresh memories in the archive.";
  }
  if (args.activeQuests > 0) {
    return "Quest energy is up. Log an activity or scan nearby to contribute.";
  }
  if (args.activeEvents > 0) {
    return "Campus events are scheduled here. Check the event list for details.";
  }
  if (args.momentCount > 0) {
    return "Students are posting from this spot. Drop a public post with this location to add yours.";
  }
  return "Quiet for now — be the first Ram to forge a memory here.";
}
