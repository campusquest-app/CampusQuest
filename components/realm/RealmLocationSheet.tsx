"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, Sparkles, TrendingUp, X, Zap } from "lucide-react";
import type { RealmLocation } from "@/lib/realm/locations";
import { formatRealmEventLabel, getRealmEventUrgency } from "@/lib/realm/locations";
import type { GroupedMapLocation } from "@/lib/mapLocationGroups";
import { emptyMapLocationContent, mapLocationActivityCount } from "@/lib/mapLocationGroups";
import { RealmArchiveExperience } from "./RealmArchiveExperience";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import type { SharePostTarget } from "@/lib/client/dmMessagesClient";

type SheetView = "archive" | "overview" | "quests" | "events";

type ArchiveViewer = { id: string; name: string; username: string; avatar: string };

export function RealmLocationSheet({
  location,
  mapContent = null,
  open,
  initialView = "archive",
  momentsLoaded = true,
  mapContentLoaded = true,
  viewer = null,
  onCreatePost,
  onClose,
  onViewQuests,
  onRefreshMoments,
  onViewProfile,
  onSharePost,
}: {
  location: RealmLocation | null;
  mapContent?: GroupedMapLocation | null;
  open: boolean;
  initialView?: SheetView;
  momentsLoaded?: boolean;
  mapContentLoaded?: boolean;
  viewer?: ArchiveViewer | null;
  onCreatePost?: () => void;
  onClose: () => void;
  onViewQuests?: (location: RealmLocation) => void;
  onRefreshMoments?: () => void;
  onViewProfile?: (userId: string) => void;
  onSharePost?: (target: SharePostTarget) => void;
}) {
  const [view, setView] = useState<SheetView>("archive");
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    if (!open) return;
    onRefreshMoments?.();
  }, [open, onRefreshMoments]);

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

  if (!mounted || !open || typeof document === "undefined") return null;
  if (!location && !mapContent) return null;

  const content = mapContent ?? emptyMapLocationContent();
  const displayName = location?.name ?? mapContent?.locationName ?? "Campus location";
  const displayAddress = mapContent?.locationAddress ?? null;
  const momentCount = location?.activeMomentCount ?? location?.moments.length ?? 0;
  const activeQuestCount = content.quests.length + content.qrCodes.length;
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
        onClick={onClose}
      />
      <MobileSwipeBackSurface
        onBack={handleSwipeBack}
        className="cq-realm-archive-panel cq-realm-archive-screen cq-realm-archive-sheet mx-auto max-w-lg animate-realm-sheet-up"
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
                activeQuestCount={activeQuestCount}
                activeEventCount={activeEventCount}
                momentsLoaded={momentsLoaded}
                onBack={onClose}
              />

              <div className="cq-realm-archive-body">
                <p className="cq-realm-archive-section-label">
                  <span className="cq-realm-archive-section-label-icon" aria-hidden>
                    ✦
                  </span>
                  Memory Archive
                </p>
                <RealmArchiveExperience
                  location={location}
                  moments={location.moments}
                  loaded={momentsLoaded}
                  viewer={viewer}
                  onCreatePost={onCreatePost}
                  onViewProfile={onViewProfile}
                  onSharePost={onSharePost}
                />
              </div>

              <MapActivityPreview
                content={content}
                loaded={mapContentLoaded}
                urgency={urgency}
                eventLabel={eventLabel}
                onViewOverview={() => setView("overview")}
                onViewQuests={() => setView("quests")}
                onViewEvents={() => setView("events")}
              />

              <footer className="cq-realm-archive-activity">
                <TrendingUp className="cq-realm-archive-activity-icon" aria-hidden />
                <p>{activityLine}</p>
              </footer>
            </>
          ) : view !== "archive" ? (
            <RealmDetailView
              view={view}
              location={location}
              displayName={displayName}
              displayAddress={displayAddress}
              content={content}
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
      </MobileSwipeBackSurface>
    </>,
    document.body,
  );
}

function RealmArchiveHeader({
  location,
  momentCount,
  activeQuestCount,
  activeEventCount,
  momentsLoaded,
  onBack,
}: {
  location: RealmLocation;
  momentCount: number;
  activeQuestCount: number;
  activeEventCount: number;
  momentsLoaded: boolean;
  onBack: () => void;
}) {
  return (
    <header className="cq-realm-archive-location-header">
      <div className="cq-realm-archive-toolbar-row">
        <button
          type="button"
          onClick={onBack}
          className="cq-realm-archive-back-btn touch-manipulation"
          aria-label="Back to map"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.4} />
          Back
        </button>
      </div>

      <div className="cq-realm-archive-identity">
        <p className="cq-realm-archive-fantasy-banner">
          <span aria-hidden>{location.markerEmoji}</span>
          <span>{location.fantasyName}</span>
        </p>
        <h2 id="realm-sheet-title" className="cq-realm-archive-location-name">
          {location.name}
        </h2>
        <p className="cq-realm-archive-flavor">{location.flavorText}</p>
      </div>

      <div className="cq-realm-archive-stat-chips" role="list" aria-label="Location stats">
        <StatChip emoji="📸" label={`${momentCount} ${momentCount === 1 ? "Memory" : "Memories"}`} />
        <StatChip emoji="⚔️" label={`${activeQuestCount} ${activeQuestCount === 1 ? "Activity" : "Activities"}`} />
        <StatChip emoji="📅" label={`${activeEventCount} ${activeEventCount === 1 ? "Event" : "Events"}`} />
        {!momentsLoaded ? <span className="cq-realm-archive-stat-loading">loading…</span> : null}
      </div>
    </header>
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
  loaded,
  urgency,
  eventLabel,
  onViewOverview,
  onViewQuests,
  onViewEvents,
}: {
  content: Pick<GroupedMapLocation, "qrCodes" | "quests" | "events">;
  loaded: boolean;
  urgency: ReturnType<typeof getRealmEventUrgency>;
  eventLabel: string;
  onViewOverview: () => void;
  onViewQuests: () => void;
  onViewEvents: () => void;
}) {
  const hasActivity = mapLocationActivityCount(content) > 0;
  const previewQuest = content.quests[0];
  const previewQr = content.qrCodes[0];
  const previewEvent = content.events[0];

  if (!loaded) {
    return (
      <section className="cq-realm-archive-secondary" aria-label="Quests and events">
        <p className="cq-realm-archive-secondary-empty">Loading campus activities…</p>
      </section>
    );
  }

  if (!hasActivity) {
    return (
      <section className="cq-realm-archive-secondary" aria-label="Quests and events">
        <p className="cq-realm-archive-secondary-empty">No active QR codes, quests, or events here right now.</p>
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
          {previewQr ? (
            <button type="button" className="cq-realm-archive-quest-row w-full" onClick={onViewOverview}>
              <span className="cq-realm-archive-quest-row-icon">📷</span>
              <span className="cq-realm-archive-quest-row-body">
                <span className="cq-realm-archive-quest-row-name">{previewQr.name}</span>
                <span className="cq-realm-archive-quest-row-meta">QR · +{previewQr.xpReward} XP</span>
              </span>
            </button>
          ) : null}
          {previewQuest ? (
            <button type="button" className="cq-realm-archive-quest-row w-full" onClick={onViewQuests}>
              <span className="cq-realm-archive-quest-row-icon">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="cq-realm-archive-quest-row-body">
                <span className="cq-realm-archive-quest-row-name">{previewQuest.name}</span>
                <span className="cq-realm-archive-quest-row-meta capitalize">+{previewQuest.xpReward} XP</span>
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
          {loaded && mapLocationActivityCount(content) === 0 ? (
            <EmptyPanel message="No active QR codes, quests, or events at this location." />
          ) : null}
          {loaded ? (
            <>
              {content.qrCodes.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="cq-realm-detail-title">Active QR Codes</h3>
                  <ul className="cq-realm-detail-list">
                    {content.qrCodes.map((qr) => (
                      <li key={qr.id} className="cq-realm-detail-quest-card">
                        <span className="cq-realm-archive-quest-row-icon">📷</span>
                        <span className="min-w-0 flex-1">
                          <span className="cq-realm-detail-quest-name">{qr.name}</span>
                          <span className="cq-realm-archive-quest-row-meta">+{qr.xpReward} XP</span>
                          {qr.expiresAt ? (
                            <span className="block text-[11px] text-white/45">
                              Expires {new Date(qr.expiresAt).toLocaleString()}
                            </span>
                          ) : null}
                        </span>
                        <a
                          href={qr.scanPath}
                          className="inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-uri-gold/35 text-uri-gold hover:bg-uri-gold/10"
                        >
                          Scan
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {content.quests.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="cq-realm-detail-title">Active Quests</h3>
                  <ul className="cq-realm-detail-list">
                    {content.quests.map((quest) => (
                      <li key={quest.id} className="cq-realm-detail-quest-card">
                        <span className="cq-realm-archive-quest-row-icon">
                          {quest.icon ? <span>{quest.icon}</span> : <Sparkles className="h-4 w-4" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="cq-realm-detail-quest-name">{quest.name}</span>
                          <span className="cq-realm-archive-quest-row-meta capitalize">
                            {quest.difficulty ?? "quest"} · +{quest.xpReward} XP
                          </span>
                          {quest.completionMethod ? (
                            <span className="block text-[11px] text-white/45 capitalize">
                              {quest.completionMethod.replace(/_/g, " ")}
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={onViewQuests}
                          className="inline-flex px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-uri-keaney/35 text-uri-keaney hover:bg-uri-keaney/10"
                        >
                          View
                        </button>
                      </li>
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
          {content.qrCodes.length === 0 && content.quests.length === 0 ? (
            <EmptyPanel message="No active quests or QR codes here right now." />
          ) : (
            <ul className="cq-realm-detail-list">
              {content.qrCodes.map((qr) => (
                <li key={qr.id} className="cq-realm-detail-quest-card">
                  <span className="cq-realm-archive-quest-row-icon">📷</span>
                  <span className="min-w-0 flex-1">
                    <span className="cq-realm-detail-quest-name">{qr.name}</span>
                    <span className="cq-realm-archive-quest-row-meta">QR · +{qr.xpReward} XP</span>
                  </span>
                  <a href={qr.scanPath} className="cq-realm-archive-quest-row-xp text-uri-gold">
                    Scan
                  </a>
                </li>
              ))}
              {content.quests.map((quest) => (
                <li key={quest.id} className="cq-realm-detail-quest-card">
                  <span className="cq-realm-archive-quest-row-icon">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="cq-realm-detail-quest-name">{quest.name}</span>
                    <span className="cq-realm-archive-quest-row-meta capitalize">+{quest.xpReward} XP</span>
                  </span>
                </li>
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
