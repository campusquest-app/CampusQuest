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
  onClose,
  onViewQuests,
}: {
  location: RealmLocation | null;
  open: boolean;
  onClose: () => void;
  onViewQuests?: (location: RealmLocation) => void;
}) {
  const [view, setView] = useState<SheetView>("overview");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) setView("overview");
  }, [open]);

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
        <div className="realm-sheet-panel rounded-t-[1.35rem] border border-cyan-400/15 bg-gradient-to-b from-[#1a1408]/90 via-[#0f2d5c] to-[#081a3a] shadow-[0_-12px_48px_-8px_rgba(76,201,255,0.25)]">
          <div className="flex justify-center pt-2.5">
            <span className="h-1 w-10 rounded-full bg-white/20" />
          </div>

          {view === "overview" ? (
            <>
              <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/50">Location</p>
                  <h2 id="realm-sheet-title" className="font-display text-xl font-bold text-white">
                    {location.name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] text-white/60 hover:bg-white/[0.06]"
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
                  label={`${location.studentPhotos} Campus Photo${location.studentPhotos === 1 ? "" : "s"}`}
                />
              </ul>

              <div className="mx-5 mb-4 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/45">
                  <TrendingUp className="h-3 w-3" />
                  Location Activity
                </p>
                <p className="text-sm leading-relaxed text-white/65">{activityLine}</p>
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
                <SheetActionButton onClick={() => setView("moments")}>Campus Moments</SheetActionButton>
                <SheetActionButton onClick={() => setView("events")}>Upcoming Events</SheetActionButton>
              </div>
            </>
          ) : (
            <div className="px-5 pb-5 pt-3" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <button
                type="button"
                onClick={() => setView("overview")}
                className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-cyan-300/80 hover:text-cyan-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back to {location.name}
              </button>

              {view === "quests" ? (
                <>
                  <h3 className="font-display text-lg font-bold text-white">Active Quests</h3>
                  <p className="mt-1 mb-4 text-sm text-white/45">XP rewards at {location.name}</p>
                  {location.quests.length === 0 ? (
                    <EmptyPanel message="No active quests here right now. Check back soon." />
                  ) : (
                    <ul className="space-y-2">
                      {location.quests.map((quest) => (
                        <li
                          key={quest.id}
                          className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-200">
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-white/92">{quest.name}</span>
                            <span className="text-[11px] capitalize text-white/40">{quest.status}</span>
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
                  <h3 className="font-display text-lg font-bold text-white">Campus Moments</h3>
                  <p className="mt-1 mb-4 text-sm text-white/45">Photos forged at {location.name}</p>
                  <RealmCampusMomentsCarousel moments={location.moments} />
                </>
              ) : null}

              {view === "events" ? (
                <>
                  <h3 className="font-display text-lg font-bold text-white">Upcoming Events</h3>
                  <p className="mt-1 mb-4 text-sm text-white/45">What&apos;s happening nearby</p>
                  <ul className="space-y-2">
                    <li className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white/92">{location.eventTimer.label}</p>
                          <p className="mt-0.5 text-[11px] text-white/45">{location.name}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            urgency === "sparkle"
                              ? "bg-amber-400/15 text-amber-200"
                              : urgency === "pulse"
                                ? "bg-cyan-400/12 text-cyan-200"
                                : "bg-white/[0.06] text-white/55"
                          }`}
                        >
                          {eventLabel}
                        </span>
                      </div>
                    </li>
                    {location.upcomingEvents > 1 ? (
                      <li className="rounded-xl border border-dashed border-white/[0.1] bg-black/10 px-3 py-3 text-sm text-white/40">
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
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-cyan-200/85">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold text-white/88">{label}</span>
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
          ? "w-full rounded-xl bg-gradient-to-b from-cyan-500/90 to-cyan-600/80 py-3.5 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(76,201,255,0.45)]"
          : "w-full rounded-xl border border-white/[0.12] bg-white/[0.04] py-3.5 text-sm font-semibold text-white/85 hover:bg-white/[0.07]"
      }
    >
      {children}
    </button>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/15 px-4 py-8 text-center text-sm text-white/45">
      {message}
    </div>
  );
}

function buildActivityLine(location: RealmLocation): string {
  if (location.activeQuests > 0 && location.studentPhotos >= 10) {
    return "Rams are active here — quests running and new campus moments dropping often.";
  }
  if (location.activeQuests > 0) {
    return "Quest energy is up. Log an activity or scan nearby to contribute.";
  }
  if (location.studentPhotos > 0) {
    return "Students have been posting from this spot. Drop a Field Note to add yours.";
  }
  return "Quiet for now — be the first Ram to forge a moment here.";
}
