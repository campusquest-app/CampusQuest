"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Search, SlidersHorizontal } from "lucide-react";
import { CANONICAL_EVENT_CATEGORIES } from "@/lib/eventSources/categories";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { EventDetailScreen } from "@/components/events/EventDetailScreen";
import { EventDiscoveryCard } from "@/components/events/EventDiscoveryCard";
import { EventsCategoryRail } from "@/components/events/EventsCategoryRail";
import { EventsFilterSheet } from "@/components/events/EventsFilterSheet";
import { HappeningSoonCarousel } from "@/components/events/HappeningSoonCarousel";
import { ScreenBackHeader } from "@/components/ui/BackButton";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import {
  type EventsFeedTimeframe,
  isUpcomingEvent,
  matchesEventsSearch,
  matchesEventsTimeframe,
} from "@/lib/client/eventsFeedFilters";
import {
  EVENTS_FOR_YOU_EMPTY_DETAIL,
  EVENTS_FOR_YOU_EMPTY_TITLE,
  EVENTS_STALE_NOTICE,
  eventsEmptyStateCopy,
} from "@/lib/client/eventsFeedEmptyState";
import {
  countActiveEventFilters,
  EVENTS_SEARCH_PLACEHOLDER,
  eventsSyncBanner,
  scoreEventsSearch,
} from "@/lib/client/eventDiscovery";
import {
  eventMatchesCategoryRail,
  eventSearchHaystack,
  feedEventIsSaved,
} from "@/lib/client/eventCardPresentation";
import {
  type CampusEventItem,
  type ExternalFeedEventItem,
  type FeedEvent,
  feedEventLocationText,
} from "@/lib/client/eventFeedTypes";
import { applyCampusRsvpStatus, nextInterestedRsvpStatus } from "@/lib/client/eventInterested";
import { partitionDiscoverySections } from "@/lib/client/happeningSoon";
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
  sport: string;
};

const initialFilters: Filters = {
  search: "",
  category: "",
  organizationKey: "",
  isPaid: "all",
  location: "",
  timeframe: "for_you",
  sport: "",
};

const TIMEFRAME_OPTIONS: Array<{ value: EventsFeedTimeframe; label: string }> = [
  { value: "for_you", label: "For You" },
  { value: "today", label: "Today" },
  { value: "this_weekend", label: "This Weekend" },
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
  const [savedOnly, setSavedOnly] = useState(false);
  const [forYouExpanded, setForYouExpanded] = useState(false);
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
            emptyFeed: (externalResult.value.events ?? []).length === 0 && (campusResult.status !== "fulfilled" || (campusResult.value.events ?? []).length === 0),
            lastSuccessfulSync: externalResult.value.meta?.lastSuccessfulSync ?? null,
            warningText: EVENTS_STALE_NOTICE,
          }),
        );
      } else if (!controller.signal.aborted) {
        const message =
          externalResult.reason instanceof Error
            ? externalResult.reason.message
            : "Could not load campus events.";
        setSyncBanner(
          eventsSyncBanner({
            stale: true,
            fetchFailed: true,
            emptyFeed: campusResult.status !== "fulfilled",
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

  const categories = useMemo(() => [...CANONICAL_EVENT_CATEGORIES], []);
  const sports = useMemo(
    () =>
      Array.from(
        new Set(
          externalEvents
            .map((event) => event.sport?.trim())
            .filter((sport): sport is string => Boolean(sport)),
        ),
      ).sort(),
    [externalEvents],
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
    const searchQuery = filters.search.trim();

    const filtered = allFeedEvents.filter((item) => {
      const startsAt = item.event.startsAt;
      if (!isUpcomingEvent(startsAt)) return false;
      if (!matchesEventsTimeframe(startsAt, filters.timeframe)) return false;
      if (savedOnly && !feedEventIsSaved(item)) return false;

      const haystack = eventSearchHaystack(item);
      const isPaid = item.kind === "external" ? false : item.event.isPaid;

      if (!matchesEventsSearch(haystack, filters.search)) {
        return false;
      }
      if (filters.category.trim() && !eventMatchesCategoryRail(item, filters.category)) {
        return false;
      }
      if (filters.sport.trim()) {
        if (item.kind !== "external" || !(item.event.sport ?? "").toLowerCase().includes(filters.sport.trim().toLowerCase())) {
          return false;
        }
      }
      if (locationNeedle && !feedEventLocationText(item).toLowerCase().includes(locationNeedle)) return false;
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

    const searchScoreFor = (item: FeedEvent) => scoreEventsSearch(eventSearchHaystack(item), searchQuery);

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
  }, [allFeedEvents, filters, recProfile, savedOnly]);

  const discoverySections = useMemo(
    () =>
      partitionDiscoverySections({
        ranked: prioritizedEvents,
        timeframe: filters.timeframe,
        searchQuery: filters.search,
        savedOnly,
        forYouLimit: forYouExpanded ? 40 : 8,
      }),
    [prioritizedEvents, filters.timeframe, filters.search, savedOnly, forYouExpanded],
  );

  const emptyCopy = eventsEmptyStateCopy({
    hasLoadedEvents: events.length + externalEvents.length > 0,
    isAdmin: showAdminSyncLink,
    timeframe: filters.timeframe,
    hasSearch: Boolean(filters.search.trim()),
    hasExtraFilters: activeFilterCount > 0,
    category: filters.category,
    savedOnly,
  });

  function syncActiveCampusDetail(nextEvents: CampusEventItem[], eventId: string) {
    if (activeDetail?.kind === "campus" && activeDetail.event.id === eventId) {
      const updated = nextEvents.find((event) => event.id === eventId);
      if (updated) setActiveDetail({ kind: "campus", event: updated });
    }
  }

  function syncActiveExternalDetail(nextEvents: ExternalFeedEventItem[], eventId: string) {
    if (activeDetail?.kind === "external" && activeDetail.event.id === eventId) {
      const updated = nextEvents.find((event) => event.id === eventId);
      if (updated) setActiveDetail({ kind: "external", event: updated });
    }
  }

  async function handleInterested(eventId: string, kind: "campus" | "external" = "campus") {
    if (kind === "external") {
      const current = externalEvents.find((event) => event.id === eventId);
      if (!current?.cqRsvpEnabled) return;
      const previous = current.myRsvpStatus ?? null;
      const next = nextInterestedRsvpStatus(previous);
      const optimistic = applyCampusRsvpStatus(externalEvents, eventId, next);
      setExternalEvents(optimistic);
      syncActiveExternalDetail(optimistic, eventId);
      setRsvping(eventId);
      setError(null);
      try {
        await postAuthed(`/api/external/events/${eventId}/rsvp`, { status: next });
      } catch (rsvpError) {
        const rolledBack = applyCampusRsvpStatus(externalEvents, eventId, previous);
        setExternalEvents(rolledBack);
        syncActiveExternalDetail(rolledBack, eventId);
        setError(rsvpError instanceof Error ? rsvpError.message : "Could not save RSVP.");
      } finally {
        setRsvping(null);
      }
      return;
    }
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

  async function handleGoing(eventId: string, kind: "campus" | "external" = "campus") {
    if (kind === "external") {
      const current = externalEvents.find((event) => event.id === eventId);
      if (!current?.cqRsvpEnabled) return;
      const previous = current.myRsvpStatus ?? null;
      const next = previous === "going" ? "not_going" : "going";
      const optimistic = applyCampusRsvpStatus(externalEvents, eventId, next);
      setExternalEvents(optimistic);
      syncActiveExternalDetail(optimistic, eventId);
      setRsvping(eventId);
      setError(null);
      try {
        await postAuthed(`/api/external/events/${eventId}/rsvp`, { status: next });
      } catch (rsvpError) {
        const rolledBack = applyCampusRsvpStatus(externalEvents, eventId, previous);
        setExternalEvents(rolledBack);
        syncActiveExternalDetail(rolledBack, eventId);
        setError(rsvpError instanceof Error ? rsvpError.message : "Could not save RSVP.");
      } finally {
        setRsvping(null);
      }
      return;
    }
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
    if (emptyCopy.action === "all") {
      setSavedOnly(false);
      setFilters((prev) => ({ ...prev, timeframe: "all" }));
    }
    if (emptyCopy.action === "this_week") setFilters((prev) => ({ ...prev, timeframe: "this_week" }));
    if (emptyCopy.action === "this_weekend") setFilters((prev) => ({ ...prev, timeframe: "this_weekend" }));
    if (emptyCopy.action === "clear_search") setFilters((prev) => ({ ...prev, search: "" }));
    if (emptyCopy.action === "clear_filters") {
      setSavedOnly(false);
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
      : activeDetail?.kind === "external"
        ? {
            kind: "external" as const,
            event: externalEvents.find((event) => event.id === activeDetail.event.id) ?? activeDetail.event,
          }
        : activeDetail;

  const searching = Boolean(filters.search.trim()) || savedOnly;
  const showForYouSection = filters.timeframe === "for_you" && !searching;

  function renderFeedCard(row: (typeof prioritizedEvents)[number]) {
    const item = row.item;
    return (
      <EventDiscoveryCard
        key={`${item.kind}-${item.event.id}`}
        item={item}
        recommendation={row.recommendation}
        interestedPending={rsvping === item.event.id}
        onView={() => setActiveDetail(item)}
        onViewOnMap={onViewOnMap ? () => onViewOnMap(item.event.id) : undefined}
        onRsvpGoing={
          item.kind === "campus" || (item.kind === "external" && item.event.cqRsvpEnabled)
            ? () => void handleGoing(item.event.id, item.kind)
            : undefined
        }
        onToggleInterested={
          item.kind === "campus" || (item.kind === "external" && item.event.cqRsvpEnabled)
            ? () => void handleInterested(item.event.id, item.kind)
            : undefined
        }
      />
    );
  }

  return (
    <>
    {/* Keep the list mounted under the portaled detail so document scroll position is preserved. */}
    <section
      className={`cq-events-discovery${liveDetail ? " pointer-events-none" : ""}`}
      aria-hidden={liveDetail ? true : undefined}
      inert={liveDetail ? true : undefined}
    >
      {onBack ? <ScreenBackHeader title="Events" onBack={onBack} /> : null}
      <header className="cq-events-header">
        <div className="cq-events-header-row">
          <div>
            <h1 className="cq-events-title">Events</h1>
            <p className="cq-events-subtitle">Find something to do on campus.</p>
          </div>
          <button
            type="button"
            className={`cq-events-saved ${savedOnly ? "cq-events-saved--on" : ""}`}
            onClick={() => setSavedOnly((prev) => !prev)}
            aria-pressed={savedOnly}
            aria-label={savedOnly ? "Show all events" : "Show saved events"}
          >
            <Calendar className="h-5 w-5" strokeWidth={2.1} />
          </button>
        </div>
        <p className="sr-only">
          For You ranks events from your interests and communities without hiding the rest of campus.
        </p>
      </header>

      <div className="cq-events-search">
        <Search className="cq-events-search-icon" aria-hidden />
        <input
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
          placeholder={EVENTS_SEARCH_PLACEHOLDER}
          aria-label={EVENTS_SEARCH_PLACEHOLDER}
          className="cq-events-search-input"
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="cq-events-search-filter"
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
          aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>

      <div className="cq-events-time-pills" role="tablist" aria-label="Event time" data-cq-horizontal-scroll="true" data-cq-gesture-block="swipe-tab">
        {TIMEFRAME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filters.timeframe === option.value && !savedOnly}
            onClick={() => {
              setSavedOnly(false);
              setFilters((prev) => ({ ...prev, timeframe: option.value }));
            }}
            className={`cq-events-time-pill ${
              filters.timeframe === option.value && !savedOnly ? "cq-events-time-pill--on" : ""
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <EventsCategoryRail
        selected={filters.category}
        onSelect={(id) => setFilters((prev) => ({ ...prev, category: id, sport: id === "Athletics" ? prev.sport : "" }))}
      />

      {error ? (
        <ScreenDataState
          variant="error"
          message="Could not load events."
          detail={error}
          onRetry={() => void loadEvents()}
          compact
        />
      ) : null}
      {syncBanner?.kind === "warning" && !error ? (
        <div className="cq-events-sync-warning" role="status">
          {syncBanner.text}
        </div>
      ) : null}
      {loading ? (
        <div className="cq-events-skeletons" aria-busy="true" aria-label="Loading events">
          <div className="cq-events-skeleton cq-events-skeleton--hero" />
          <div className="cq-events-skeleton cq-events-skeleton--row" />
          <div className="cq-events-skeleton cq-events-skeleton--row" />
        </div>
      ) : null}
      {!loading && prioritizedEvents.length === 0 ? (
        <div className="cq-events-empty">
          <p className="cq-events-empty-title">{emptyCopy.title}</p>
          <p className="cq-events-empty-detail">{emptyCopy.detail}</p>
          <div className="cq-events-empty-actions">
            {emptyCopy.action ? (
              <button type="button" onClick={applyEmptyAction} className="cq-events-empty-btn">
                {emptyCopy.action === "all"
                  ? "Explore all upcoming events"
                  : emptyCopy.action === "this_week"
                    ? "See this week"
                    : emptyCopy.action === "this_weekend"
                      ? "See this weekend"
                      : emptyCopy.action === "clear_search"
                        ? "Clear search"
                        : "Clear filters"}
              </button>
            ) : (
              <button type="button" onClick={() => void loadEvents()} className="cq-events-empty-btn">
                Refresh events
              </button>
            )}
            {showAdminSyncLink ? (
              <Link href="/internal/admin" className="cq-events-empty-btn cq-events-empty-btn--admin">
                Admin sync status
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && !searching ? (
        <HappeningSoonCarousel
          rows={discoverySections.happeningSoon}
          rsvpingId={rsvping}
          onView={setActiveDetail}
          onViewOnMap={onViewOnMap}
          onToggleInterested={(item) => void handleInterested(item.event.id, item.kind)}
        />
      ) : null}

      {!loading && showForYouSection ? (
        <section className="cq-events-foryou" aria-labelledby="cq-events-foryou-title">
          <div className="cq-events-section-head">
            <div>
              <h2 id="cq-events-foryou-title" className="cq-events-section-title">
                ☆ For You
              </h2>
              <p className="cq-events-section-sub">Based on your interests</p>
            </div>
            {discoverySections.more.length > 0 || forYouExpanded ? (
              <button
                type="button"
                className="cq-events-section-link"
                onClick={() => setForYouExpanded((prev) => !prev)}
              >
                {forYouExpanded ? "Show less" : "View All For You"}
              </button>
            ) : null}
          </div>
          {discoverySections.forYou.length === 0 ? (
            <div className="cq-events-empty cq-events-empty--section">
              <p className="cq-events-empty-title">{EVENTS_FOR_YOU_EMPTY_TITLE}</p>
              <p className="cq-events-empty-detail">{EVENTS_FOR_YOU_EMPTY_DETAIL}</p>
            </div>
          ) : (
            <div className="cq-events-feed">{discoverySections.forYou.map(renderFeedCard)}</div>
          )}
        </section>
      ) : null}

      {!loading && discoverySections.more.length > 0 ? (
        <section className="cq-events-more" aria-labelledby="cq-events-more-title">
          <h2 id="cq-events-more-title" className="cq-events-section-title">
            {searching ? (savedOnly ? "Saved" : "Search results") : showForYouSection ? "More events" : "Upcoming"}
          </h2>
          <div className="cq-events-feed">{discoverySections.more.map(renderFeedCard)}</div>
        </section>
      ) : null}

      <EventsFilterSheet
        open={filtersOpen}
        values={filters}
        categories={categories}
        sports={sports}
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
        onToggleInterested={
          liveDetail.kind === "campus" || (liveDetail.kind === "external" && liveDetail.event.cqRsvpEnabled)
            ? () => void handleInterested(liveDetail.event.id, liveDetail.kind)
            : undefined
        }
        onRsvpGoing={
          liveDetail.kind === "campus" || (liveDetail.kind === "external" && liveDetail.event.cqRsvpEnabled)
            ? () => void handleGoing(liveDetail.event.id, liveDetail.kind)
            : undefined
        }
        onViewOnMap={onViewOnMap ? () => onViewOnMap(liveDetail.event.id) : undefined}
        onWalkHere={onViewOnMap ? () => onViewOnMap(liveDetail.event.id, { walk: true }) : undefined}
        onOpenOrganization={onOpenOrganization}
      />
    ) : null}
    </>
  );
}
