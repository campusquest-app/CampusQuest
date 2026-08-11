"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import {
  ExternalEventLocationDisplay,
} from "@/components/ExternalEventLocationDisplay";
import { ExternalEventDetailScreen } from "@/components/ExternalEventDetailScreen";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { ScreenBackHeader } from "@/components/ui/BackButton";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import {
  type EventsFeedTimeframe,
  isUpcomingEvent,
  matchesEventsSearch,
  matchesEventsTimeframe,
} from "@/lib/client/eventsFeedFilters";
import { TaggedEntityPostsSection } from "@/components/quad/TaggedEntityPostsSection";

type EventItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  isPaid: boolean;
  hostType?: "user" | "organization";
  hostOrganization: { id: string; name: string; logo_url: string | null } | null;
  hostProfile?: { id: string; username: string; displayName: string } | null;
  rsvpCount: number;
  myRsvpStatus: "going" | "interested" | "not_going" | null;
  isCancelled: boolean;
};

type ExternalEventItem = {
  id: string;
  source: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  venueName: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  organizationName: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  tags: string[];
  imported: true;
};

type FeedEvent =
  | { kind: "campus"; event: EventItem }
  | { kind: "external"; event: ExternalEventItem };

type Filters = {
  search: string;
  category: string;
  organizationKey: string;
  isPaid: "all" | "free" | "paid";
  location: string;
  timeframe: EventsFeedTimeframe;
};

function eventHostLabel(event: EventItem): string {
  if (event.hostOrganization) return event.hostOrganization.name;
  if (event.hostProfile?.displayName?.trim()) return event.hostProfile.displayName.trim();
  if (event.hostProfile?.username) return event.hostProfile.username;
  return "CampusQuest community";
}

const initialFilters: Filters = {
  search: "",
  category: "",
  organizationKey: "",
  isPaid: "all",
  location: "",
  timeframe: "all",
};

const TIMEFRAME_OPTIONS: Array<{ value: EventsFeedTimeframe; label: string }> = [
  { value: "all", label: "All Events" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
];

export function EventsFeed({
  personalization,
  showAdminSyncLink = false,
  onBack,
}: {
  personalization?: { schoolName?: string; interests?: string[]; discoveryFocus?: string[] } | null;
  showAdminSyncLink?: boolean;
  onBack?: () => void;
}) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [externalEvents, setExternalEvents] = useState<ExternalEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [externalLoadWarning, setExternalLoadWarning] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [activeDetail, setActiveDetail] = useState<FeedEvent | null>(null);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    setError(null);
    setExternalLoadWarning(null);
    try {
      const [campusResult, externalResult] = await Promise.allSettled([
        fetchAuthed<{ events: EventItem[] }>("/api/events"),
        fetchAuthed<{ events: ExternalEventItem[] }>("/api/external/events"),
      ]);

      if (campusResult.status === "fulfilled") {
        setEvents(campusResult.value.events ?? []);
      } else {
        setEvents([]);
        setError(
          campusResult.reason instanceof Error ? campusResult.reason.message : "Could not load events.",
        );
      }

      if (externalResult.status === "fulfilled") {
        setExternalEvents(externalResult.value.events ?? []);
      } else {
        setExternalEvents([]);
        const message =
          externalResult.reason instanceof Error
            ? externalResult.reason.message
            : "Could not load URInvolved events.";
        setExternalLoadWarning(message);
        if (campusResult.status !== "fulfilled") {
          setError(message);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    let targetId: string | null = null;
    try {
      targetId = window.sessionStorage.getItem("cq_open_event_id");
      if (targetId) window.sessionStorage.removeItem("cq_open_event_id");
    } catch {
      targetId = null;
    }
    if (!targetId) return;
    const campus = events.find((event) => event.id === targetId);
    if (campus) {
      setActiveDetail({ kind: "campus", event: campus });
      return;
    }
    const external = externalEvents.find((event) => event.id === targetId);
    if (external) {
      setActiveDetail({ kind: "external", event: external });
    }
  }, [loading, events, externalEvents]);

  const categories = useMemo(
    () =>
      Array.from(new Set([...events, ...externalEvents].map((event) => event.category).filter(Boolean))).sort(),
    [events, externalEvents],
  );
  const organizationOptions = useMemo(() => {
    const campus = Array.from(
      new Map(
        events
          .filter((event) => event.hostOrganization)
          .map((event) => [event.hostOrganization!.id, event.hostOrganization!]),
      ).values(),
    ).map((org) => ({ key: `campus:${org.id}`, label: org.name }));
    const externalNames = Array.from(
      new Set(externalEvents.map((event) => event.organizationName?.trim()).filter(Boolean) as string[]),
    )
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ key: `ext:${encodeURIComponent(name)}`, label: name }));
    return [...campus, ...externalNames];
  }, [events, externalEvents]);

  const allFeedEvents = useMemo<FeedEvent[]>(() => {
    const campus = events.map((event) => ({ kind: "campus" as const, event }));
    const external = externalEvents.map((event) => ({ kind: "external" as const, event }));
    return [...campus, ...external];
  }, [events, externalEvents]);

  const prioritizedEvents = useMemo(() => {
    const locationNeedle = filters.location.trim().toLowerCase();
    const categoryNeedle = filters.category.trim().toLowerCase();

    const filtered = allFeedEvents.filter((item) => {
      const startsAt = item.event.startsAt;
      if (!isUpcomingEvent(startsAt)) return false;
      if (!matchesEventsTimeframe(startsAt, filters.timeframe)) return false;

      const title = item.event.title;
      const description = item.event.description;
      const category = item.event.category ?? "";
      const location =
        item.kind === "external"
          ? [item.event.location, item.event.venueName, item.event.address].filter(Boolean).join(" ")
          : item.event.location ?? "";
      const organizationName =
        item.kind === "external"
          ? item.event.organizationName ?? ""
          : eventHostLabel(item.event);
      const tags = item.kind === "external" ? item.event.tags ?? [] : [];
      const isPaid = item.kind === "external" ? false : item.event.isPaid;

      if (!matchesEventsSearch({ title, description, location, organizationName, category, tags }, filters.search)) {
        return false;
      }
      if (categoryNeedle && !category.toLowerCase().includes(categoryNeedle)) return false;
      if (locationNeedle && !location.toLowerCase().includes(locationNeedle)) return false;
      if (filters.isPaid === "paid" && !isPaid) return false;
      if (filters.isPaid === "free" && isPaid) return false;

      if (filters.organizationKey) {
        if (filters.organizationKey.startsWith("campus:")) {
          const orgId = filters.organizationKey.slice("campus:".length);
          if (item.kind !== "campus" || item.event.hostOrganization?.id !== orgId) return false;
        } else if (filters.organizationKey.startsWith("ext:")) {
          const orgName = decodeURIComponent(filters.organizationKey.slice("ext:".length)).toLowerCase();
          if (item.kind !== "external" || (item.event.organizationName ?? "").toLowerCase() !== orgName) {
            return false;
          }
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const aTime = a.event.startsAt ? new Date(a.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.event.startsAt ? new Date(b.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  }, [allFeedEvents, filters]);

  async function handleRsvp(eventId: string, status: "going" | "interested" | "not_going") {
    setRsvping(eventId);
    setError(null);
    try {
      await postAuthed(`/api/events/${eventId}/rsvp`, { status });
      await loadEvents();
      if (activeDetail?.kind === "campus" && activeDetail.event.id === eventId) {
        const updated = events.find((event) => event.id === eventId);
        if (updated) setActiveDetail({ kind: "campus", event: updated });
      }
    } catch (rsvpError) {
      setError(rsvpError instanceof Error ? rsvpError.message : "Could not save RSVP.");
    } finally {
      setRsvping(null);
    }
  }

  async function handleReportEvent(eventId: string) {
    const reasonInput = window.prompt("Reason (unsafe, harassment, scam, inappropriate, spam, other)", "unsafe") ?? "";
    const reason = reasonInput.trim().toLowerCase();
    if (!["unsafe", "harassment", "scam", "inappropriate", "spam", "other"].includes(reason)) {
      setError("Please provide a valid report reason.");
      return;
    }
    const details = window.prompt("Optional details for moderators", "") ?? "";
    setReporting(eventId);
    setError(null);
    try {
      await postAuthed(`/api/events/${eventId}/report`, {
        reason,
        details: details.trim() || undefined,
      });
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Could not report event.");
    } finally {
      setReporting(null);
    }
  }

  if (activeDetail?.kind === "external") {
    return (
      <ExternalEventDetailScreen
        event={activeDetail.event}
        onBack={() => setActiveDetail(null)}
      />
    );
  }

  return (
    <section className="space-y-4">
      {onBack ? <ScreenBackHeader title="Events" onBack={onBack} /> : null}
      <div className="card p-4 space-y-3">
        <h3 className="font-display font-semibold text-white">Event Discovery</h3>
        <p className="text-xs text-white/55">
          Showing events in your verified campus community{personalization?.schoolName ? ` (${personalization.schoolName})` : ""}.
        </p>
        <input
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          placeholder="Search events, locations, organizations…"
          className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder-white/50"
        />
        <div className="flex flex-wrap gap-2">
          {TIMEFRAME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, timeframe: option.value }))}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                filters.timeframe === option.value
                  ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                  : "border-white/20 text-white/75 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select
            value={filters.category}
            onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={filters.organizationKey}
            onChange={(event) => setFilters((prev) => ({ ...prev, organizationKey: event.target.value }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          >
            <option value="">All organizations</option>
            {organizationOptions.map((organization) => (
              <option key={organization.key} value={organization.key}>
                {organization.label}
              </option>
            ))}
          </select>
          <select
            value={filters.isPaid}
            onChange={(event) => setFilters((prev) => ({ ...prev, isPaid: event.target.value as Filters["isPaid"] }))}
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white"
          >
            <option value="all">Free + Paid</option>
            <option value="free">Free only</option>
            <option value="paid">Paid only</option>
          </select>
          <input
            value={filters.location}
            onChange={(event) => setFilters((prev) => ({ ...prev, location: event.target.value }))}
            placeholder="Location"
            className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xs text-white placeholder-white/50"
          />
        </div>
      </div>

      {error ? (
        <ScreenDataState
          variant="error"
          message="Could not load events."
          detail={error}
          onRetry={() => void loadEvents()}
          compact
        />
      ) : null}
      {externalLoadWarning && !error ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          URInvolved events could not be loaded. CampusQuest events may still appear below.
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-20 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && prioritizedEvents.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center space-y-2">
          <p className="text-sm text-white/80 font-medium">
            {events.length + externalEvents.length > 0 ? "No events match your filters." : "No events found yet."}
          </p>
          <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed">
            {events.length + externalEvents.length > 0
              ? "Try clearing search or date filters to see more CampusQuest and URInvolved events."
              : "CampusQuest could not load synced URInvolved events. Try refreshing or check the admin sync status."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void loadEvents()}
              className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
            >
              Refresh events
            </button>
            {showAdminSyncLink ? (
              <Link
                href="/internal/admin"
                className="rounded-lg border border-cyan-400/35 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10"
              >
                Admin sync status
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {prioritizedEvents.map((item) =>
          item.kind === "external" ? (
            <article key={`ext-${item.event.id}`} className="card p-4 space-y-2 border border-cyan-400/15">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-white font-semibold">{item.event.title}</h4>
                  <p className="text-xs text-white/65 mt-1">
                    {item.event.startsAt ? new Date(item.event.startsAt).toLocaleString() : "Date TBA"}
                  </p>
                  <ExternalEventLocationDisplay
                    venueName={item.event.venueName}
                    address={item.event.address}
                    location={item.event.location}
                    className="mt-1"
                  />
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[11px] rounded-full border border-uri-keaney/35 px-2 py-0.5 text-uri-keaney">
                    {item.event.category}
                  </span>
                  <span className="text-[10px] text-cyan-200/80">Source: URInvolved</span>
                </div>
              </div>
              {item.event.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.event.imageUrl} alt="" className="w-full max-h-40 object-cover rounded-lg border border-white/10" />
              ) : null}
              <p className="text-sm text-white/75 line-clamp-3">{item.event.description}</p>
              {item.event.organizationName ? (
                <p className="text-xs text-white/55">Organization: {item.event.organizationName}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetail(item)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/25 text-white/85 hover:bg-white/10"
                >
                  View Event
                </button>
              </div>
            </article>
          ) : (
            <article key={item.event.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-white font-semibold">{item.event.title}</h4>
                  <p className="text-xs text-white/65 mt-1">
                    {new Date(item.event.startsAt).toLocaleString()} · {item.event.location}
                  </p>
                </div>
                <span className="text-[11px] rounded-full border border-uri-keaney/35 px-2 py-0.5 text-uri-keaney">
                  {item.event.category}
                </span>
              </div>
              <p className="text-sm text-white/75 line-clamp-2">{item.event.description}</p>
              <p className="text-xs text-white/55">
                Host: {eventHostLabel(item.event)} · {item.event.isPaid ? "Paid" : "Free"} · RSVP {item.event.rsvpCount}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDetail(item)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/25 text-white/85 hover:bg-white/10"
                >
                  View Event
                </button>
                <button
                  type="button"
                  disabled={reporting === item.event.id}
                  onClick={() => void handleReportEvent(item.event.id)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-400/35 text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
                >
                  {reporting === item.event.id ? "Reporting..." : "Report event"}
                </button>
                {(["going", "interested", "not_going"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={rsvping === item.event.id}
                    onClick={() => void handleRsvp(item.event.id, status)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                      item.event.myRsvpStatus === status
                        ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                        : "border-white/20 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {status.replace("_", " ")}
                  </button>
                ))}
              </div>
            </article>
          ),
        )}
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed pt-2">
        Event information sourced from URInvolved, URI&apos;s official student involvement platform. CampusQuest
        helps students discover opportunities and sends them back to URInvolved as the official source.
      </p>

      {activeDetail?.kind === "campus" ? (
        <MobileSwipeBackSurface
          onBack={() => setActiveDetail(null)}
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/65 p-3"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-uri-navy p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between gap-3">
              <h4 className="text-white text-lg font-semibold">{activeDetail.event.title}</h4>
              <button type="button" className="text-white/60 hover:text-white" onClick={() => setActiveDetail(null)}>
                ✕
              </button>
            </div>
            <p className="text-sm text-white/75">{activeDetail.event.description}</p>
            <p className="text-xs text-white/65">
              {new Date(activeDetail.event.startsAt).toLocaleString()} · {activeDetail.event.location}
            </p>
            <p className="text-xs text-white/55">
              Hosted by {eventHostLabel(activeDetail.event)} · RSVP {activeDetail.event.rsvpCount}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {(["going", "interested", "not_going"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={rsvping === activeDetail.event.id}
                  onClick={() => void handleRsvp(activeDetail.event.id, status)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                    activeDetail.event.myRsvpStatus === status
                      ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                      : "border-white/20 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {status.replace("_", " ")}
                </button>
              ))}
            </div>
            <TaggedEntityPostsSection
              entityType="event"
              entityId={activeDetail.event.id}
              title="Campus activity"
            />
          </div>
        </MobileSwipeBackSurface>
      ) : null}
    </section>
  );
}
