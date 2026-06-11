"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, Camera, ChevronLeft, Sparkles, Target, TrendingUp, X, Zap } from "lucide-react";
import type { RealmLocation } from "@/lib/realm/locations";
import { formatRealmEventLabel, getRealmEventUrgency } from "@/lib/realm/locations";
import { RealmCampusMomentsCarousel } from "./RealmCampusMomentsCarousel";

type SheetView = "overview" | "quests" | "moments" | "events";

export function RealmLocationSheet({
  location,
  open,
  initialView = "overview",
  momentsLoaded = true,
  onClose,
  onViewQuests,
  onViewQuadPost,
  onRefreshMoments,
}: {
  location: RealmLocation | null;
  open: boolean;
  initialView?: SheetView;
  momentsLoaded?: boolean;
  onClose: () => void;
  onViewQuests?: (location: RealmLocation) => void;
  onViewQuadPost?: (postId: string) => void;
  onRefreshMoments?: () => void;
}) {
  const [view, setView] = useState<SheetView>("overview");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setView("overview");
      return;
    }
    setView(initialView);
  }, [open, initialView]);

  useEffect(() => {
    if (!open) return;
    onRefreshMoments?.();
  }, [open, onRefreshMoments]);

  if (!mounted || !open || !location || typeof document === "undefined") return null;

  const urgency = getRealmEventUrgency(location.eventTimer);
  const eventLabel = formatRealmEventLabel(location.eventTimer);
  const activityLine = buildActivityLine(location);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close location details"
        className="realm-sheet-backdrop fixed inset-0 z-[85] bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="realm-sheet fixed inset-x-0 bottom-0 z-[86] mx-auto max-w-lg animate-realm-sheet-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="realm-sheet-title"
      >
        <div className="realm-sheet-panel rounded-t-[1.35rem] border border-slate-200 bg-white shadow-[0_-12px_48px_-12px_rgba(15,23,42,0.18)]">
          <div className="flex justify-center pt-2.5">
            <span className="h-1 w-10 rounded-full bg-slate-200" />
          </div>

          {view === "overview" ? (
            <>
              <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-3">
                <div className="min-w-0">
                  <p className="realm-sheet-banner inline-flex max-w-full items-center gap-1.5 truncate rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]">
                    <span aria-hidden>⚔️</span>
                    <span className="truncate">{location.fantasyName}</span>
                  </p>
                  <h2 id="realm-sheet-title" className="mt-1 font-display text-xl font-bold text-slate-900">
                    {location.name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ul className="space-y-2 px-5 py-4">
                <SummaryRow
                  icon={Target}
                  label={`${location.activeQuests} Active Quest${location.activeQuests === 1 ? "" : "s"}`}
                />
                <SummaryRow
                  icon={Calendar}
                  label={`${location.upcomingEvents} Upcoming Event${location.upcomingEvents === 1 ? "" : "s"}`}
                />
                <SummaryRow
                  icon={Camera}
                  label={`${location.activeMomentCount ?? location.moments.length} Active Moment${
                    (location.activeMomentCount ?? location.moments.length) === 1 ? "" : "s"
                  }`}
                />
              </ul>

              <div className="mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-100 px-3 py-3">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  <TrendingUp className="h-3 w-3" />
                  Location Activity
                </p>
                <p className="text-sm leading-relaxed text-slate-600">{activityLine}</p>
              </div>

              <div
                className="flex flex-col gap-2 px-5 pb-5"
                style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
              >
                <SheetActionButton
                  primary
                  onClick={() => {
                    onViewQuests?.(location);
                    setView("quests");
                  }}
                >
                  View Quests
                </SheetActionButton>
                <SheetActionButton onClick={() => setView("moments")}>
                  {(location.activeMomentCount ?? location.moments.length) > 0
                    ? `Campus Moments (${location.activeMomentCount ?? location.moments.length})`
                    : "Campus Moments"}
                </SheetActionButton>
                <SheetActionButton onClick={() => setView("events")}>Upcoming Events</SheetActionButton>
              </div>
            </>
          ) : (
            <div className="px-5 pb-5 pt-3" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <button
                type="button"
                onClick={() => setView("overview")}
                className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-uri-keaney hover:text-uri-keaney/80"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back to {location.name}
              </button>

              {view === "quests" ? (
                <>
                  <h3 className="font-display text-lg font-bold text-slate-900">Active Quests</h3>
                  <p className="mt-1 mb-4 text-sm text-slate-500">XP rewards at {location.name}</p>
                  {location.quests.length === 0 ? (
                    <EmptyPanel message="No active quests here right now. Check back soon." />
                  ) : (
                    <ul className="space-y-2">
                      {location.quests.map((quest) => (
                        <li
                          key={quest.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100 px-3 py-3"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-200">
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-900">{quest.name}</span>
                            <span className="text-[11px] capitalize text-slate-400">{quest.status}</span>
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-uri-gold">
                            <Zap className="h-3 w-3" />+{quest.xp} XP
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}

              {view === "moments" ? (
                <>
                  <h3 className="font-display text-lg font-bold text-slate-900">Campus Moments</h3>
                  <p className="mt-1 mb-4 text-sm text-slate-500">
                    Public Field Notes at {location.name} — visible for 24 hours
                  </p>
                  {!momentsLoaded ? (
                    <EmptyPanel message="Loading Moments…" />
                  ) : (
                    <RealmCampusMomentsCarousel
                      moments={location.moments}
                      onViewPost={onViewQuadPost}
                    />
                  )}
                </>
              ) : null}

              {view === "events" ? (
                <>
                  <h3 className="font-display text-lg font-bold text-slate-900">Upcoming Events</h3>
                  <p className="mt-1 mb-4 text-sm text-slate-500">What&apos;s happening nearby</p>
                  <ul className="space-y-2">
                    <li className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{location.eventTimer.label}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{location.name}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            urgency === "sparkle"
                              ? "bg-amber-400/15 text-amber-200"
                              : urgency === "pulse"
                                ? "bg-cyan-400/12 text-cyan-200"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {eventLabel}
                        </span>
                      </div>
                    </li>
                    {location.upcomingEvents > 1 ? (
                      <li className="rounded-xl border border-dashed border-slate-200 bg-black/10 px-3 py-3 text-sm text-slate-400">
                        +{location.upcomingEvents - 1} more campus event
                        {location.upcomingEvents - 1 === 1 ? "" : "s"} this week
                      </li>
                    ) : location.upcomingEvents === 0 && location.eventTimer.status === "active" ? (
                      <EmptyPanel message="No scheduled events — quest activity is live now." />
                    ) : location.upcomingEvents === 0 ? (
                      <EmptyPanel message="No upcoming events scheduled at this location." />
                    ) : null}
                  </ul>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function SummaryRow({ icon: Icon, label }: { icon: typeof Target; label: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-black/15 px-3 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-cyan-200/85">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold text-slate-900/88">{label}</span>
    </li>
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
      className={
        primary
          ? "w-full rounded-xl bg-gradient-to-b from-cyan-500/90 to-cyan-600/80 py-3.5 text-sm font-semibold text-slate-900 shadow-[0_0_20px_-4px_rgba(76,201,255,0.45)]"
          : "w-full rounded-xl border border-white/[0.12] bg-slate-50 py-3.5 text-sm font-semibold text-slate-700 hover:bg-white/[0.07]"
      }
    >
      {children}
    </button>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-black/15 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function buildActivityLine(location: RealmLocation): string {
  const momentCount = location.activeMomentCount ?? location.moments.length;
  if (location.activeQuests > 0 && momentCount > 0) {
    return "Rams are active here — quests running and fresh Realm Moments on the map.";
  }
  if (location.activeQuests > 0) {
    return "Quest energy is up. Log an activity or scan nearby to contribute.";
  }
  if (momentCount > 0) {
    return "Students are posting from this spot. Drop a public Field Note with this location to add yours.";
  }
  return "Quiet for now — be the first Ram to forge a moment here.";
}
