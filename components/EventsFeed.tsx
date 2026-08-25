"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { EventDetailScreen } from "@/components/events/EventDetailScreen";
import { EventDiscoveryCard } from "@/components/events/EventDiscoveryCard";
import { EventsFilterSheet } from "@/components/events/EventsFilterSheet";
import { ScreenBackHeader } from "@/components/ui/BackButton";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import {
  type EventsFeedTimeframe,
  isUpcomingEvent,
  matchesEventsSearch,
  matchesEventsTimeframe,
} from "@/lib/client/eventsFeedFilters";
import { EVENTS_STALE_NOTICE, eventsEmptyStateCopy } from "@/lib/client/eventsFeedEmptyState";
import {
  countActiveEventFilters,
  EVENTS_SEARCH_PLACEHOLDER,
  eventsSyncBanner,
  scoreEventsSearch,
} from "@/lib/client/eventDiscovery";
import {
  type CampusEventItem,
  type ExternalFeedEventItem,
  type FeedEvent,
  feedEventHostName,
  feedEventLocationText,
} from "@/lib/client/eventFeedTypes";
import { applyCampusRsvpStatus, nextInterestedRsvpStatus } from "@/lib/client/eventInterested";
import { useRecommendationProfile } from "@/lib/client/useRecommendationProfile";
import {
  campusEventToRecommendationEntity,
  externalEventToRecommendationEntity,
  rankRecommendationEntities,
  recommendationTimeBucket,
} from "@/lib/recommendations";
import type { RecommendationScore } from "@/lib/recommendations/types";

type Filters = {
  search: string;
  category: string;
  organizationKey: string;
  isPaid: "all" | "free" | "paid";
  location: string;
  timeframe: EventsFeedTimeframe;
};

const initialFilters: Filters = {
  search: "",
  category: "",
  organizationKey: "",
  isPaid: "all",
  location: "",
  timeframe: "for_you",
};

const TIMEFRAME_OPTIONS: Array<{ value: EventsFeedTimeframe; label: string }> = [
  { value: "for_you", label: "For You" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "all", label: "All" },
];

export function EventsFeed({
  personalization,
  showAdminSyncLink = false,
  onBack,
  onViewOnMap,
  onOpenOrganization,
}: {
  personalization?: {
    schoolName?: string;
    interests?: string[];
    communities?: string[];
    discoveryFocus?: string[];
    institutionId?: string | null;
    studentStatus?: string | null;
    classYear?: number | null;
  } | null;
  showAdminSyncLink?: boolean;
  onBack?: () => void;
  onViewOnMap?: (eventId: string, options?: { walk?: boolean }) => void;
  onOpenOrganization?: (organizationId: string) => void;
}) {
  const [events, setEvents] = useState<CampusEventItem[]>([]);
  const [externalEvents, setExternalEvents] = useState<ExternalFeedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncBanner, setSyncBanner] = useState<ReturnType<typeof eventsSyncBanner>>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeDetail, setActiveDetail] = useState<FeedEvent | null>(null);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const recProfile = useRecommendationProfile(personalization);
  const activeFilterCount = countActiveEventFilters(filters);

  async function loadEvents() {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const generation = ++loadGenerationRef.current;

    setLoading(true);
    setError(null);
    const bust = `_=${Date.now()}`;
    try {
      const [campusResult, externalResult] = await Promise.allSettled([
        fetchAuthed<{ events: CampusEventItem[] }>(`/api/events?${bust}`, { signal: controller.signal }),
        fetchAuthed<{
          events: ExternalFeedEventItem[];
          meta?: {
            stale?: boolean;
            source?: string;
            lastSuccessfulSync?: string | null;
          };
        }>(`/api/external/events?${bust}`, {
          signal: controller.signal,
        }),
      ]);

      if (generation !== loadGenerationRef.current) return;

      if (campusResult.status === "fulfilled") {
        setEvents(campusResult.value.events ?? []);
      } else if (!controller.signal.aborted) {
        setEvents([]);
        setError(
          campusResult.reason instanceof Error ? campusResult.reason.message : "Could not load events.",
        );
      }

      if (externalResult.status === "fulfilled") {
        setExternalEvents(externalResult.value.events ?? []);
        setSyncBanner(
          eventsSyncBanner({
            stale: Boolean(externalResult.value.meta?.stale),
            lastSuccessfulSync: externalResult.value.meta?.lastSuccessfulSync ?? null,
            warningText: EVENTS_STALE_NOTICE,
          }),
        );
      } else if (!controller.signal.aborted) {
        const message =
          externalResult.reason instanceof Error
            ? externalResult.reason.message
            : "Could not load URInvolved events.";
        setSyncBanner(
          eventsSyncBanner({
            stale: true,
            fetchFailed: true,
            warningText: EVENTS_STALE_NOTICE,
          }),
        );
        if (campusResult.status !== "fulfilled") {
          setError(message);
        }
      }
    } catch (loadError) {
      if (generation !== loadGenerationRef.current) return;
      const aborted =
        (loadError instanceof DOMException && loadError.name === "AbortError") ||
        (loadError instanceof Error && loadError.name === "AbortError");
      if (!aborted) {
        setError(loadError instanceof Error ? loadError.message : "Could not load events.");
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadEvents();
    return () => {
      loadAbortRef.current?.abort();
    };
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
    const searchQuery = filters.search.trim();

    const filtered = allFeedEvents.filter((item) => {
      const startsAt = item.event.startsAt;
      if (!isUpcomingEvent(startsAt)) return false;
      if (!matchesEventsTimeframe(startsAt, filters.timeframe)) return false;

      const title = item.event.title;
      const description = item.event.description;
      const category = item.event.category ?? "";
      const location = feedEventLocationText(item);
      const organizationName = feedEventHostName(item);
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

    const searchScoreFor = (item: FeedEvent) =>
      scoreEventsSearch(
        {
          title: item.event.title,
          organizationName: feedEventHostName(item),
          location: feedEventLocationText(item),
          category: item.event.category ?? "",
          tags: item.kind === "external" ? item.event.tags ?? [] : [],
          description: item.event.description,
        },
        searchQuery,
      );

    if (searchQuery) {
      const ranked = rankRecommendationEntities({
        items: filtered,
        toEntity: (entry) =>
          entry.kind === "campus"
            ? campusEventToRecommendationEntity(entry.event)
            : externalEventToRecommendationEntity(entry.event),
        profile: recProfile,
        nowMs: recommendationTimeBucket(),
        diversity: false,
      });
      return ranked
        .map((row) => ({
          item: row.item,
          recommendation: row.recommendation,
          searchScore: searchScoreFor(row.item),
        }))
        .sort((a, b) => {
          if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
          const aTime = a.item.event.startsAt ? new Date(a.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.item.event.startsAt ? new Date(b.item.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        });
    }

    if (filters.timeframe !== "for_you") {
      return filtered
        .sort((a, b) => {
          const aTime = a.event.startsAt ? new Date(a.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.event.startsAt ? new Date(b.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })
        .map((item) => ({ item, recommendation: null as RecommendationScore | null }));
    }

    return rankRecommendationEntities({
      items: filtered,
      toEntity: (entry) =>
        entry.kind === "campus"
          ? campusEventToRecommendationEntity(entry.event)
          : externalEventToRecommendationEntity(entry.event),
      profile: recProfile,
      nowMs: recommendationTimeBucket(),
      diversity: true,
      exploreEvery: 4,
    }).map((row) => ({ item: row.item, recommendation: row.recommendation }));
  }, [allFeedEvents, filters, recProfile]);

  const emptyCopy = eventsEmptyStateCopy({
    hasLoadedEvents: events.length + externalEvents.length > 0,
    isAdmin: showAdminSyncLink,
    timeframe: filters.timeframe,
    hasSearch: Boolean(filters.search.trim()),
    hasExtraFilters: activeFilterCount > 0,
  });

  function syncActiveCampusDetail(nextEvents: CampusEventItem[], eventId: string) {
    if (activeDetail?.kind === "campus" && activeDetail.event.id === eventId) {
      const updated = nextEvents.find((event) => event.id === eventId);
      if (updated) setActiveDetail({ kind: "campus", event: updated });
    }
  }

  async function handleInterested(eventId: string) {
    const current = events.find((event) => event.id === eventId);
    if (!current) return;
    const previous = current.myRsvpStatus;
    const next = nextInterestedRsvpStatus(previous);
    const optimistic = applyCampusRsvpStatus(events, eventId, next);
    setEvents(optimistic);
    syncActiveCampusDetail(optimistic, eventId);
    setRsvping(eventId);
    setError(null);
    try {
      await postAuthed(`/api/events/${eventId}/rsvp`, { status: next });
    } catch (rsvpError) {
      const rolledBack = applyCampusRsvpStatus(events, eventId, previous);
      setEvents(rolledBack);
      syncActiveCampusDetail(rolledBack, eventId);
      setError(rsvpError instanceof Error ? rsvpError.message : "Could not save RSVP.");
    } finally {
      setRsvping(null);
    }
  }

  async function handleGoing(eventId: string) {
    const current = events.find((event) => event.id === eventId);
    if (!current) return;
    const previous = current.myRsvpStatus;
    const next = previous === "going" ? "not_going" : "going";
    const optimistic = applyCampusRsvpStatus(events, eventId, next);
    setEvents(optimistic);
    syncActiveCampusDetail(optimistic, eventId);
    setRsvping(eventId);
    setError(null);
    try {
      await postAuthed(`/api/events/${eventId}/rsvp`, { status: next });
    } catch (rsvpError) {
      const rolledBack = applyCampusRsvpStatus(events, eventId, previous);
      setEvents(rolledBack);
      syncActiveCampusDetail(rolledBack, eventId);
      setError(rsvpError instanceof Error ? rsvpError.message : "Could not save RSVP.");
    } finally {
      setRsvping(null);
    }
  }

  function applyEmptyAction() {
    if (emptyCopy.action === "all") setFilters((prev) => ({ ...prev, timeframe: "all" }));
    if (emptyCopy.action === "this_week") setFilters((prev) => ({ ...prev, timeframe: "this_week" }));
    if (emptyCopy.action === "clear_search") setFilters((prev) => ({ ...prev, search: "" }));
    if (emptyCopy.action === "clear_filters") {
      setFilters((prev) => ({
        ...initialFilters,
        search: prev.search,
        timeframe: prev.timeframe === "tomorrow" || prev.timeframe === "this_month" ? "for_you" : prev.timeframe,
      }));
    }
  }

  const liveDetail =
    activeDetail?.kind === "campus"
      ? { kind: "campus" as const, event: events.find((event) => event.id === activeDetail.event.id) ?? activeDetail.event }
      : activeDetail;

  return (
    <>
    {/* Keep the list mounted under the portaled detail so document scroll position is preserved. */}
    <section
      className={`space-y-4${liveDetail ? " pointer-events-none" : ""}`}
      aria-hidden={liveDetail ? true : undefined}
      inert={liveDetail ? true : undefined}
    >
      {onBack ? <ScreenBackHeader title="Events" onBack={onBack} /> : null}
      <div className="card p-4 space-y-3">
        <h3 className="font-display font-semibold text-white">Event Discovery</h3>
        <p className="text-xs text-white/55">
          Showing events in your verified campus community
          {personalization?.schoolName ? ` (${personalization.schoolName})` : ""}.
          {filters.timeframe === "for_you"
            ? " For You ranks events from your interests and communities without hiding the rest of campus."
            : ""}
        </p>
        <input
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          placeholder={EVENTS_SEARCH_PLACEHOLDER}
          aria-label={EVENTS_SEARCH_PLACEHOLDER}
          className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder-white/50"
        />
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Event time">
          {TIMEFRAME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filters.timeframe === option.value}
              onClick={() => setFilters((prev) => ({ ...prev, timeframe: option.value }))}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition min-h-[36px] ${
                filters.timeframe === option.value
                  ? "border-uri-keaney/50 text-uri-keaney bg-uri-keaney/15"
                  : "border-white/20 text-white/75 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/10 min-h-[40px]"
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
        >
          {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
        </button>
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
      {syncBanner && !error ? (
        <div
          className={
            syncBanner.kind === "warning"
              ? "rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
              : "px-1 text-[11px] text-white/40"
          }
          role={syncBanner.kind === "warning" ? "status" : undefined}
        >
          {syncBanner.text}
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-2">
          <div className="h-24 rounded-xl bg-white/10 animate-pulse" />
          <div className="h-24 rounded-xl bg-white/10 animate-pulse" />
        </div>
      ) : null}
      {!loading && prioritizedEvents.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center space-y-2">
          <p className="text-sm text-white/80 font-medium">{emptyCopy.title}</p>
          <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed">{emptyCopy.detail}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {emptyCopy.action ? (
              <button
                type="button"
                onClick={applyEmptyAction}
                className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
              >
                {emptyCopy.action === "all"
                  ? "Explore all upcoming events"
                  : emptyCopy.action === "this_week"
                    ? "See this week"
                    : emptyCopy.action === "clear_search"
                      ? "Clear search"
                      : "Clear filters"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void loadEvents()}
                className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
              >
                Refresh events
              </button>
            )}
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

      <div className="space-y-2.5">
        {prioritizedEvents.map(({ item, recommendation }) => (
          <EventDiscoveryCard
            key={`${item.kind}-${item.event.id}`}
            item={item}
            recommendation={recommendation}
            interestedPending={item.kind === "campus" && rsvping === item.event.id}
            onView={() => setActiveDetail(item)}
            onToggleInterested={item.kind === "campus" ? () => void handleInterested(item.event.id) : undefined}
          />
        ))}
      </div>

      <EventsFilterSheet
        open={filtersOpen}
        values={filters}
        categories={categories}
        organizations={organizationOptions}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onClose={() => setFiltersOpen(false)}
        onClear={() =>
          setFilters((prev) => ({
            ...initialFilters,
            search: prev.search,
            timeframe:
              prev.timeframe === "tomorrow" || prev.timeframe === "this_month" ? "for_you" : prev.timeframe,
          }))
        }
      />
    </section>
    {liveDetail ? (
      <EventDetailScreen
        item={liveDetail}
        recommendation={prioritizedEvents.find((row) => row.item.event.id === liveDetail.event.id)?.recommendation ?? null}
        error={error}
        interestedPending={rsvping === liveDetail.event.id}
        onBack={() => setActiveDetail(null)}
        onRetry={() => void loadEvents()}
        onToggleInterested={liveDetail.kind === "campus" ? () => void handleInterested(liveDetail.event.id) : undefined}
        onRsvpGoing={liveDetail.kind === "campus" ? () => void handleGoing(liveDetail.event.id) : undefined}
        onViewOnMap={onViewOnMap ? () => onViewOnMap(liveDetail.event.id) : undefined}
        onWalkHere={onViewOnMap ? () => onViewOnMap(liveDetail.event.id, { walk: true }) : undefined}
        onOpenOrganization={onOpenOrganization}
      />
    ) : null}
    </>
  );
}
