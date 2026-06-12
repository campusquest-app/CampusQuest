"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, Sparkles, TrendingUp, X, Zap } from "lucide-react";
import type { RealmLocation, RealmQuest } from "@/lib/realm/locations";
import { formatRealmEventLabel, getRealmEventUrgency } from "@/lib/realm/locations";
import { RealmArchiveExperience } from "./RealmArchiveExperience";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";

type SheetView = "archive" | "overview" | "quests" | "events";

type ArchiveViewer = { id: string; name: string; username: string; avatar: string };

export function RealmLocationSheet({
  location,
  open,
  initialView = "archive",
  momentsLoaded = true,
  viewer = null,
  onCreatePost,
  onClose,
  onViewQuests,
  onRefreshMoments,
  onViewProfile,
}: {
  location: RealmLocation | null;
  open: boolean;
  initialView?: SheetView;
  momentsLoaded?: boolean;
  viewer?: ArchiveViewer | null;
  onCreatePost?: () => void;
  onClose: () => void;
  onViewQuests?: (location: RealmLocation) => void;
  onRefreshMoments?: () => void;
  onViewProfile?: (userId: string) => void;
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
    if (view === "overview") {
      setView("archive");
      return;
    }
    onClose();
  }

  if (!mounted || !open || !location || typeof document === "undefined") return null;

  const momentCount = location.activeMomentCount ?? location.moments.length;
  const urgency = getRealmEventUrgency(location.eventTimer);
  const eventLabel = formatRealmEventLabel(location.eventTimer);
  const activityLine = buildActivityLine(location);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close location archive"
        className="realm-sheet-backdrop fixed inset-0 z-[85] bg-black/60 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <MobileSwipeBackSurface
        onBack={handleSwipeBack}
        className="cq-realm-archive-screen cq-realm-archive-sheet fixed inset-0 z-[86] mx-auto max-w-lg animate-realm-sheet-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="realm-sheet-title"
      >
        <div className="cq-realm-archive-atmosphere" aria-hidden />
        <div className="cq-realm-archive-screen-panel">
          {view === "archive" ? (
            <>
              <RealmArchiveHeader
                location={location}
                momentCount={momentCount}
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
                />
              </div>

              <RealmArchiveSecondary
                location={location}
                urgency={urgency}
                eventLabel={eventLabel}
                onViewQuests={() => {
                  onViewQuests?.(location);
                  setView("quests");
                }}
                onViewEvents={() => setView("events")}
                onViewOverview={() => setView("overview")}
              />

              <footer className="cq-realm-archive-activity">
                <TrendingUp className="cq-realm-archive-activity-icon" aria-hidden />
                <p>{activityLine}</p>
              </footer>
            </>
          ) : (
            <RealmDetailView
              view={view}
              location={location}
              urgency={urgency}
              eventLabel={eventLabel}
              momentCount={momentCount}
              onBack={() => setView(view === "overview" ? "archive" : "overview")}
              onClose={onClose}
              onViewQuests={() => {
                onViewQuests?.(location);
                setView("quests");
              }}
              onViewEvents={() => setView("events")}
              onOpenArchive={() => setView("archive")}
            />
          )}
        </div>
      </MobileSwipeBackSurface>
    </>,
    document.body,
  );
}

function RealmArchiveHeader({
  location,
  momentCount,
  momentsLoaded,
  onBack,
}: {
  location: RealmLocation;
  momentCount: number;
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
        <StatChip
          emoji="⚔️"
          label={`${location.activeQuests} ${location.activeQuests === 1 ? "Quest" : "Quests"}`}
        />
        <StatChip
          emoji="📅"
          label={`${location.upcomingEvents} ${location.upcomingEvents === 1 ? "Event" : "Events"}`}
        />
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

function RealmArchiveSecondary({
  location,
  urgency,
  eventLabel,
  onViewQuests,
  onViewEvents,
  onViewOverview,
}: {
  location: RealmLocation;
  urgency: ReturnType<typeof getRealmEventUrgency>;
  eventLabel: string;
  onViewQuests: () => void;
  onViewEvents: () => void;
  onViewOverview: () => void;
}) {
  const previewQuests = location.quests.slice(0, 2);
  const hasQuestOverflow = location.quests.length > 2 || location.activeQuests > location.quests.length;

  return (
    <section className="cq-realm-archive-secondary" aria-label="Quests and events">
      <div className="cq-realm-archive-secondary-head">
        <h3 className="cq-realm-archive-secondary-title">Quests &amp; Events</h3>
        <button type="button" className="cq-realm-archive-secondary-link" onClick={onViewOverview}>
          See all
        </button>
      </div>

      <div className="cq-realm-archive-secondary-grid">
        <div className="cq-realm-archive-secondary-col">
          {previewQuests.length === 0 ? (
            <p className="cq-realm-archive-secondary-empty">No active quests right now.</p>
          ) : (
            <ul className="cq-realm-archive-secondary-list">
              {previewQuests.map((quest) => (
                <QuestPreviewRow key={quest.id} quest={quest} onClick={onViewQuests} />
              ))}
            </ul>
          )}
          {hasQuestOverflow ? (
            <button type="button" className="cq-realm-archive-secondary-more" onClick={onViewQuests}>
              +{Math.max(location.activeQuests, location.quests.length) - previewQuests.length} more quest
              {Math.max(location.activeQuests, location.quests.length) - previewQuests.length === 1 ? "" : "s"}
            </button>
          ) : location.activeQuests > 0 && previewQuests.length > 0 ? (
            <button type="button" className="cq-realm-archive-secondary-more" onClick={onViewQuests}>
              View quests
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="cq-realm-archive-event-chip"
          onClick={onViewEvents}
        >
          <span className="cq-realm-archive-event-chip-label">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{location.eventTimer.label}</span>
          </span>
          <span
            className={`cq-realm-archive-event-chip-badge cq-realm-archive-event-chip-badge--${urgency}`}
          >
            {eventLabel}
          </span>
        </button>
      </div>
    </section>
  );
}

function QuestPreviewRow({ quest, onClick }: { quest: RealmQuest; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="cq-realm-archive-quest-row" onClick={onClick}>
        <span className="cq-realm-archive-quest-row-icon">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="cq-realm-archive-quest-row-body">
          <span className="cq-realm-archive-quest-row-name">{quest.name}</span>
          <span className="cq-realm-archive-quest-row-meta capitalize">{quest.status}</span>
        </span>
        <span className="cq-realm-archive-quest-row-xp">
          <Zap className="h-3 w-3" aria-hidden />
          +{quest.xp}
        </span>
      </button>
    </li>
  );
}

function RealmDetailView({
  view,
  location,
  urgency,
  eventLabel,
  momentCount,
  onBack,
  onClose,
  onViewQuests,
  onViewEvents,
  onOpenArchive,
}: {
  view: Exclude<SheetView, "archive">;
  location: RealmLocation;
  urgency: ReturnType<typeof getRealmEventUrgency>;
  eventLabel: string;
  momentCount: number;
  onBack: () => void;
  onClose: () => void;
  onViewQuests: () => void;
  onViewEvents: () => void;
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
          <button
            type="button"
            onClick={onClose}
            className="cq-realm-detail-close"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cq-realm-archive-identity cq-realm-archive-identity--compact">
          <p className="cq-realm-archive-fantasy-banner">
            <span aria-hidden>{location.markerEmoji}</span>
            <span>{location.fantasyName}</span>
          </p>
          <h2 className="cq-realm-archive-location-name">{location.name}</h2>
        </div>

        <div className="cq-realm-archive-stat-chips" role="list" aria-label="Location stats">
          <StatChip emoji="📸" label={`${momentCount} ${momentCount === 1 ? "Memory" : "Memories"}`} />
          <StatChip
            emoji="⚔️"
            label={`${location.activeQuests} ${location.activeQuests === 1 ? "Quest" : "Quests"}`}
          />
          <StatChip
            emoji="📅"
            label={`${location.upcomingEvents} ${location.upcomingEvents === 1 ? "Event" : "Events"}`}
          />
        </div>
      </header>

      {view === "overview" ? (
        <div className="cq-realm-detail-body">
          <div className="cq-realm-detail-actions">
            <SheetActionButton primary onClick={onViewQuests}>
              View Quests
            </SheetActionButton>
            <SheetActionButton onClick={onOpenArchive}>
              {momentCount > 0 ? `Memory Archive (${momentCount})` : "Memory Archive"}
            </SheetActionButton>
            <SheetActionButton onClick={onViewEvents}>Upcoming Events</SheetActionButton>
          </div>

          <div className="cq-realm-detail-panel">
            <p className="cq-realm-detail-panel-label">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              Location Activity
            </p>
            <p className="cq-realm-detail-panel-copy">{buildActivityLine(location)}</p>
          </div>
        </div>
      ) : null}

      {view === "quests" ? (
        <div className="cq-realm-detail-body">
          <h3 className="cq-realm-detail-title">Active Quests</h3>
          <p className="cq-realm-detail-subtitle">XP rewards at {location.name}</p>
          {location.quests.length === 0 ? (
            <EmptyPanel message="No active quests here right now. Check back soon." />
          ) : (
            <ul className="cq-realm-detail-list">
              {location.quests.map((quest) => (
                <li key={quest.id} className="cq-realm-detail-quest-card">
                  <span className="cq-realm-archive-quest-row-icon">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="cq-realm-detail-quest-name">{quest.name}</span>
                    <span className="cq-realm-archive-quest-row-meta capitalize">{quest.status}</span>
                  </span>
                  <span className="cq-realm-archive-quest-row-xp">
                    <Zap className="h-3 w-3" aria-hidden />
                    +{quest.xp} XP
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
          <p className="cq-realm-detail-subtitle">What&apos;s happening nearby</p>
          <ul className="cq-realm-detail-list">
            <li className="cq-realm-detail-event-card">
              <div className="min-w-0 flex-1">
                <p className="cq-realm-detail-quest-name">{location.eventTimer.label}</p>
                <p className="cq-realm-archive-quest-row-meta">{location.name}</p>
              </div>
              <span className={`cq-realm-archive-event-chip-badge cq-realm-archive-event-chip-badge--${urgency}`}>
                {eventLabel}
              </span>
            </li>
            {location.upcomingEvents > 1 ? (
              <li className="cq-realm-detail-event-more">
                +{location.upcomingEvents - 1} more campus event
                {location.upcomingEvents - 1 === 1 ? "" : "s"} this week
              </li>
            ) : location.upcomingEvents === 0 && location.eventTimer.status === "active" ? (
              <EmptyPanel message="No scheduled events — quest activity is live now." />
            ) : location.upcomingEvents === 0 ? (
              <EmptyPanel message="No upcoming events scheduled at this location." />
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SheetActionButton({
  children,
  onClick,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? "cq-realm-detail-btn cq-realm-detail-btn--primary" : "cq-realm-detail-btn"}
    >
      {children}
    </button>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="cq-realm-detail-empty">{message}</div>;
}

function buildActivityLine(location: RealmLocation): string {
  const momentCount = location.activeMomentCount ?? location.moments.length;
  if (location.activeQuests > 0 && momentCount > 0) {
    return "Rams are active here — quests running and fresh memories in the archive.";
  }
  if (location.activeQuests > 0) {
    return "Quest energy is up. Log an activity or scan nearby to contribute.";
  }
  if (momentCount > 0) {
    return "Students are posting from this spot. Drop a public post with this location to add yours.";
  }
  return "Quiet for now — be the first Ram to forge a memory here.";
}
