"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Calendar, CalendarSearch, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";
import { EventDateField } from "@/components/events/EventDateField";
import { EventDetailScreen } from "@/components/events/EventDetailScreen";
import { EventDiscoveryCard } from "@/components/events/EventDiscoveryCard";
import { EventsFilterSheet } from "@/components/events/EventsFilterSheet";
import { HappeningSoonCarousel } from "@/components/events/HappeningSoonCarousel";
import { ScreenBackHeader } from "@/components/ui/BackButton";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { timeframeAfterWhenChange, type EventsWhenFilter } from "@/lib/client/eventsFeedFilters";
import {
  activeEventFilterChips,
  clearEventsCalendarDate,
  eventPassesListFilters,
  removeActiveEventFilter,
  selectEventsCalendarDate,
  type EventsFeedFilterState,
} from "@/lib/client/eventsFeedQuery";
import {
  EVENTS_FOR_YOU_EMPTY_DETAIL,
  EVENTS_FOR_YOU_EMPTY_TITLE,
  EVENTS_INTEREST_PROMPT,
  EVENTS_STALE_NOTICE,
  eventsEmptyStateCopy,
} from "@/lib/client/eventsFeedEmptyState";
import {
  EVENTS_SEARCH_PLACEHOLDER,
  eventsSyncBanner,
  scoreEventsSearch,
} from "@/lib/client/eventDiscovery";
import { eventSearchHaystack } from "@/lib/client/eventCardPresentation";
import {
  type CampusEventItem,
  type ExternalFeedEventItem,
  type FeedEvent,
} from "@/lib/client/eventFeedTypes";
import {
  currentEventsFeedUserId,
  eventsFeedCacheIsFresh,
  readEventsFeedCache,
  writeEventsFeedCache,
} from "@/lib/client/eventsFeedCache";
import { applyCampusRsvpStatus, nextInterestedRsvpStatus } from "@/lib/client/eventInterested";
import { shouldPersonalizeForYouEvents } from "@/lib/basic/forYouAccess";
import { dedupeFeedEvents, partitionDiscoverySections } from "@/lib/client/happeningSoon";
import { useDebouncedValue } from "@/lib/client/useDebouncedValue";
import { useRecommendationProfile } from "@/lib/client/useRecommendationProfile";
import {
  campusEventToRecommendationEntity,
  externalEventToRecommendationEntity,
  rankRecommendationEntities,
  recommendationTimeBucket,
} from "@/lib/recommendations";
import type { RecommendationScore } from "@/lib/recommendations/types";

const MORE_EVENTS_BATCH = 12;

function chronologicalFeed(items: FeedEvent[]) {
  return [...items]
    .sort((a, b) => {
      const aTime = a.event.startsAt ? new Date(a.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.event.startsAt ? new Date(b.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .map((item) => ({ item, recommendation: null as RecommendationScore | null }));
}

type Filters = EventsFeedFilterState;

const initialFilters: Filters = {
  search: "",
  categories: [],
  when: [],
  organizationKey: "",
  isPaid: "all",
  foodOnly: false,
  location: "",
  timeframe: "for_you",
  sport: "",
  date: "",
};

const TIMEFRAME_OPTIONS: Array<{ value: "for_you" | "today" | "tomorrow" | "this_weekend"; label: string }> = [
  { value: "for_you", label: "For You" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_weekend", label: "This Weekend" },
];

function profileHasForYouSignals(profile: {
  explicitInterests: string[];
  explicitCommunities: string[];
  followedOrganizationIds: string[];
  followedOrganizationNames: string[];
  inferredAffinities: Record<string, number>;
  attendedEventIds: string[];
}): boolean {
  return (
    profile.explicitInterests.length > 0 ||
    profile.explicitCommunities.length > 0 ||
    profile.followedOrganizationIds.length > 0 ||
    profile.followedOrganizationNames.length > 0 ||
    profile.attendedEventIds.length > 0 ||
    Object.keys(profile.inferredAffinities).length > 0
  );
}

export function EventsFeed({
  personalization,
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
  onBack?: () => void;
  onViewOnMap?: (eventId: string) => void;
  onOpenOrganization?: (organizationId: string) => void;
}) {
  const [events, setEvents] = useState<CampusEventItem[]>([]);
  const [externalEvents, setExternalEvents] = useState<ExternalFeedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncBanner, setSyncBanner] = useState<ReturnType<typeof eventsSyncBanner>>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText, 250);
  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [forYouExpanded, setForYouExpanded] = useState(false);
  const [moreVisible, setMoreVisible] = useState(MORE_EVENTS_BATCH);
  const [activeDetail, setActiveDetail] = useState<FeedEvent | null>(null);
  const [rsvping, setRsvping] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const eventsRef = useRef(events);
  const externalEventsRef = useRef(externalEvents);
  eventsRef.current = events;
  externalEventsRef.current = externalEvents;
  const recProfile = useRecommendationProfile(personalization);
  const hasForYouSignals = profileHasForYouSignals(recProfile);
  const openDetail = useCallback((item: FeedEvent) => {
    setActiveDetail(item);
  }, []);
  const closeDetail = useCallback(() => {
    setActiveDetail(null);
  }, []);

  useEffect(() => {
    setFilters((prev) => (prev.search === debouncedSearch ? prev : { ...prev, search: debouncedSearch }));
  }, [debouncedSearch]);

  async function loadEvents(options?: { background?: boolean }) {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const generation = ++loadGenerationRef.current;
    const background = options?.background === true;

    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      let nextEvents: CampusEventItem[] | null = null;
      let nextExternal: ExternalFeedEventItem[] | null = null;
      let campusFailed = false;
      let externalFailed = false;
      let failureMessage = "Could not load events.";

      const campusTask = fetchAuthed<{ events: CampusEventItem[] }>("/api/events", { signal: controller.signal })
        .then((result) => {
          if (generation !== loadGenerationRef.current) return;
          nextEvents = result.events ?? [];
          setEvents(nextEvents);
          if (nextEvents.length > 0) setLoading(false);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted || generation !== loadGenerationRef.current) return;
          campusFailed = true;
          failureMessage = reason instanceof Error ? reason.message : failureMessage;
        });

      const externalTask = fetchAuthed<{
        events: ExternalFeedEventItem[];
        meta?: { stale?: boolean; source?: string; lastSuccessfulSync?: string | null };
      }>("/api/external/events", { signal: controller.signal })
        .then((result) => {
          if (generation !== loadGenerationRef.current) return;
          nextExternal = result.events ?? [];
          setExternalEvents(nextExternal);
          setSyncBanner(
            eventsSyncBanner({
              stale: Boolean(result.meta?.stale),
              emptyFeed: nextExternal.length === 0 && (nextEvents?.length ?? 0) === 0,
              lastSuccessfulSync: result.meta?.lastSuccessfulSync ?? null,
              warningText: EVENTS_STALE_NOTICE,
            }),
          );
          if (nextExternal.length > 0) setLoading(false);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted || generation !== loadGenerationRef.current) return;
          externalFailed = true;
          failureMessage = reason instanceof Error ? reason.message : "Could not load campus events.";
          setSyncBanner(
            eventsSyncBanner({
              stale: true,
              fetchFailed: true,
              emptyFeed: (nextEvents?.length ?? 0) === 0,
              warningText: EVENTS_STALE_NOTICE,
            }),
          );
        });

      await Promise.allSettled([campusTask, externalTask]);
      if (generation !== loadGenerationRef.current || controller.signal.aborted) return;

      if (campusFailed && !background) {
        setEvents([]);
        setError(failureMessage);
      } else if (externalFailed && campusFailed) {
        setError(failureMessage);
      } else {
        setError(null);
      }

      const userId = currentEventsFeedUserId();
      if (userId && (nextEvents || nextExternal)) {
        const previous = readEventsFeedCache(userId);
        writeEventsFeedCache({
          userId,
          events: nextEvents ?? previous?.events ?? [],
          externalEvents: nextExternal ?? previous?.externalEvents ?? [],
          savedAt: Date.now(),
        });
      }
    } catch (loadError) {
      if (generation !== loadGenerationRef.current) return;
      const aborted =
        (loadError instanceof DOMException && loadError.name === "AbortError") ||
        (loadError instanceof Error && loadError.name === "AbortError");
      if (!aborted && !background) {
        setError(loadError instanceof Error ? loadError.message : "Could not load events.");
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  useLayoutEffect(() => {
    const userId = currentEventsFeedUserId();
    const snapshot = userId ? readEventsFeedCache(userId) : null;
    if (!snapshot) return;
    setEvents(snapshot.events);
    setExternalEvents(snapshot.externalEvents);
    setLoading(false);
  }, []);

  useEffect(() => {
    const userId = currentEventsFeedUserId();
    const snapshot = userId ? readEventsFeedCache(userId) : null;
    if (snapshot && eventsFeedCacheIsFresh(snapshot.savedAt)) return;
    void loadEvents({ background: Boolean(snapshot) });
    return () => {
      loadAbortRef.current?.abort();
    };
    // The feed loads once per visit. A fresh snapshot paints without another request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      const userId = currentEventsFeedUserId();
      if (!userId) return;
      if (eventsRef.current.length + externalEventsRef.current.length === 0) return;
      const previous = readEventsFeedCache(userId);
      writeEventsFeedCache({
        userId,
        events: eventsRef.current,
        externalEvents: externalEventsRef.current,
        savedAt: previous?.savedAt ?? Date.now(),
      });
    };
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
  const organizationLabel =
    organizationOptions.find((option) => option.key === filters.organizationKey)?.label ?? "";
  const activeChips = activeEventFilterChips(filters, organizationLabel);

  const allFeedEvents = useMemo<FeedEvent[]>(() => {
    const campus = events.map((event) => ({ kind: "campus" as const, event }));
    const external = externalEvents.map((event) => ({ kind: "external" as const, event }));
    return dedupeFeedEvents([...campus, ...external]);
  }, [events, externalEvents]);
  const draftMatchCount = useMemo(
    () =>
      allFeedEvents.filter((item) =>
        eventPassesListFilters(item, { ...draftFilters, search: filters.search }, savedOnly),
      ).length,
    [allFeedEvents, draftFilters, filters.search, savedOnly],
  );

  const prioritizedEvents = useMemo(() => {
    const searchQuery = filters.search.trim();

    const filtered = allFeedEvents.filter((item) => eventPassesListFilters(item, filters, savedOnly));

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

    return chronologicalFeed(filtered);
  }, [allFeedEvents, filters, recProfile, savedOnly]);

  const personalizeForYou =
    shouldPersonalizeForYouEvents({
      timeframe: filters.timeframe,
      searching: Boolean(filters.search.trim()) || savedOnly,
    }) && hasForYouSignals;
  const feedSignature = useMemo(
    () => prioritizedEvents.map((row) => `${row.item.kind}:${row.item.event.id}`).join("|"),
    [prioritizedEvents],
  );
  const [personalized, setPersonalized] = useState<{
    signature: string;
    rows: Array<{ item: FeedEvent; recommendation: RecommendationScore | null }>;
  } | null>(null);

  useEffect(() => {
    if (!personalizeForYou) return;
    const signature = feedSignature;
    const items = prioritizedEvents.map((row) => row.item);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const rows = rankRecommendationEntities({
        items,
        toEntity: (entry) =>
          entry.kind === "campus"
            ? campusEventToRecommendationEntity(entry.event)
            : externalEventToRecommendationEntity(entry.event),
        profile: recProfile,
        nowMs: recommendationTimeBucket(),
        diversity: true,
        exploreEvery: 0,
      }).map((row) => ({ item: row.item, recommendation: row.recommendation }));
      setPersonalized({ signature, rows });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feedSignature, personalizeForYou, prioritizedEvents, recProfile]);

  const rankedEvents =
    personalizeForYou && personalized?.signature === feedSignature ? personalized.rows : prioritizedEvents;

  const discoverySections = useMemo(
    () =>
      partitionDiscoverySections({
        ranked: rankedEvents,
        timeframe: filters.timeframe,
        searchQuery: filters.search,
        savedOnly,
        forYouLimit: forYouExpanded ? 40 : 8,
      }),
    [rankedEvents, filters.timeframe, filters.search, savedOnly, forYouExpanded],
  );

  const emptyCopy = eventsEmptyStateCopy({
    hasLoadedEvents: events.length + externalEvents.length > 0,
    timeframe: filters.when.length === 1 ? filters.when[0] : filters.timeframe,
    hasSearch: Boolean(filters.search.trim()),
    category: filters.categories.length === 1 ? filters.categories[0] : "",
    savedOnly,
    date: filters.date,
    sheetFilterCount:
      Math.max(0, filters.categories.length - (filters.categories.length === 1 ? 1 : 0)) +
      (filters.when.length > 1 ? filters.when.length : 0) +
      (filters.organizationKey.trim() ? 1 : 0) +
      (filters.isPaid !== "all" ? 1 : 0) +
      (filters.foodOnly ? 1 : 0) +
      (filters.location.trim() ? 1 : 0) +
      (filters.sport.trim() ? 1 : 0),
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

  function clearEventFilters() {
    setSavedOnly(false);
    setSearchText("");
    setFilters(initialFilters);
  }

  function openFilters() {
    setDraftFilters({
      ...filters,
      categories: [...filters.categories],
      when: [...filters.when],
    });
    setFiltersOpen(true);
  }

  function closeFilters() {
    setFiltersOpen(false);
  }

  function applyDraftFilters() {
    setSavedOnly(false);
    setFilters((prev) => ({
      ...draftFilters,
      search: prev.search,
      timeframe: draftFilters.date?.trim()
        ? "all"
        : timeframeAfterWhenChange(prev.timeframe, draftFilters.when),
    }));
    setFiltersOpen(false);
  }

  function clearSheetFilters() {
    setSavedOnly(false);
    const next = { ...initialFilters, search: filters.search };
    setFilters(next);
    setDraftFilters(next);
    setFiltersOpen(false);
  }

  function selectQuickFilter(value: "for_you" | "today" | "tomorrow" | "this_weekend") {
    setSavedOnly(false);
    setDatePickerOpen(false);
    setFilters((prev) => {
      if (value === "for_you") return { ...prev, when: [], date: "", timeframe: "for_you" };
      return { ...prev, when: [value], date: "", timeframe: value };
    });
  }

  function quickFilterSelected(value: "for_you" | EventsWhenFilter) {
    if (savedOnly) return false;
    if (filters.date?.trim()) return false;
    if (value === "for_you") return filters.timeframe === "for_you" && filters.when.length === 0;
    return filters.when.length === 1 && filters.when[0] === value;
  }

  function applyHeaderDate(date: string) {
    setSavedOnly(false);
    setFilters((prev) => ({ ...selectEventsCalendarDate(prev, date), timeframe: "all" }));
    setDraftFilters((prev) => selectEventsCalendarDate(prev, date));
    setDatePickerOpen(false);
  }

  function clearHeaderDate() {
    setFilters((prev) => ({ ...clearEventsCalendarDate(prev), timeframe: "for_you", when: [] }));
    setDraftFilters((prev) => clearEventsCalendarDate(prev));
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
  const showSkeleton = loading && events.length + externalEvents.length === 0;
  const moreResetKey = [
    filters.timeframe,
    filters.search,
    savedOnly ? "saved" : "",
    filters.date ?? "",
    filters.categories.join(","),
    filters.when.join(","),
    filters.organizationKey,
    filters.isPaid,
    filters.foodOnly ? "food" : "",
    filters.location,
    filters.sport,
  ].join("|");
  useEffect(() => {
    setMoreVisible(MORE_EVENTS_BATCH);
  }, [moreResetKey]);
  const visibleMore = discoverySections.more.slice(0, moreVisible);
  const moreSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = moreSentinelRef.current;
    if (!node || visibleMore.length >= discoverySections.more.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMoreVisible((count) => count + MORE_EVENTS_BATCH);
        }
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [discoverySections.more.length, visibleMore.length]);

  function renderFeedCard(row: (typeof prioritizedEvents)[number], index = 0) {
    const item = row.item;
    return (
      <EventDiscoveryCard
        key={`${item.kind}-${item.event.id}`}
        item={item}
        recommendation={row.recommendation}
        interestedPending={rsvping === item.event.id}
        priority={index < 1}
        onView={openDetail}
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
    {/*
      Keep the list mounted under the portaled detail so document scroll position,
      filters, and search are preserved. Do not toggle inert/aria-hidden on this
      large tree when opening/closing detail — the fixed portal already blocks
      interaction, and attribute thrash was a major source of back-nav delay.
    */}
    <section className="cq-events-discovery">
      {onBack ? <ScreenBackHeader title="Events" onBack={onBack} /> : null}
      <header className="cq-events-header">
        <div className="cq-events-header-row">
          <div>
            <h1 className="cq-events-title">Events</h1>
            <p className="cq-events-subtitle">Find something to do on campus.</p>
          </div>
          <div className="cq-events-header-actions">
            <button
              type="button"
              className={`cq-events-saved ${savedOnly ? "cq-events-saved--on" : ""}`}
              onClick={() => {
                setDatePickerOpen(false);
                setSavedOnly((prev) => !prev);
              }}
              aria-pressed={savedOnly}
              aria-label={savedOnly ? "Show all events" : "Show saved events"}
            >
              <Bookmark className="h-5 w-5" strokeWidth={2.1} fill={savedOnly ? "currentColor" : "none"} />
            </button>
            <div className="cq-events-date-menu">
              <button
                type="button"
                className={`cq-events-saved ${filters.date?.trim() || datePickerOpen ? "cq-events-saved--on" : ""}`}
                onClick={() => {
                  setSavedOnly(false);
                  setDatePickerOpen((open) => !open);
                }}
                aria-pressed={Boolean(filters.date?.trim())}
                aria-expanded={datePickerOpen}
                aria-controls="cq-events-header-date-picker"
                aria-label={
                  filters.date?.trim()
                    ? `Change date filter, currently ${filters.date.trim()}`
                    : "Pick a specific date"
                }
              >
                <Calendar className="h-5 w-5" strokeWidth={2.1} />
              </button>
              {datePickerOpen ? (
                <div id="cq-events-header-date-picker" className="cq-events-date-menu-panel">
                  <EventDateField
                    date={filters.date?.trim() ?? ""}
                    defaultOpen
                    onSelect={applyHeaderDate}
                    onClear={() => {
                      clearHeaderDate();
                      setDatePickerOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <p className="sr-only">
          For You ranks events from your interests and communities without hiding the rest of campus.
        </p>
      </header>

      <div className="cq-events-search">
        <Search className="cq-events-search-icon" aria-hidden />
        <input
          value={searchText}
          onChange={(event) => {
            const value = event.target.value;
            setSearchText(value);
            if (!value.trim()) {
              setFilters((prev) => (prev.search ? { ...prev, search: "" } : prev));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          placeholder={EVENTS_SEARCH_PLACEHOLDER}
          aria-label={EVENTS_SEARCH_PLACEHOLDER}
          enterKeyHint="search"
          className="cq-events-search-input"
        />
        {searchText ? (
          <button
            type="button"
            className="cq-events-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setSearchText("");
              setFilters((prev) => (prev.search ? { ...prev, search: "" } : prev));
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="cq-events-time-pills" role="toolbar" aria-label="Event filters" data-cq-horizontal-scroll="true" data-cq-gesture-block="swipe-tab">
        {TIMEFRAME_OPTIONS.map((option) => {
          const selected = quickFilterSelected(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => selectQuickFilter(option.value)}
              className={`cq-events-time-pill ${selected ? "cq-events-time-pill--on" : ""}`}
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={openFilters}
          className={`cq-events-time-pill cq-events-filter-pill ${
            filtersOpen || activeChips.length > 0 ? "cq-events-filter-pill--on" : ""
          }`}
          aria-expanded={filtersOpen}
          aria-haspopup="dialog"
          aria-label={activeChips.length > 0 ? `Filters, ${activeChips.length} active` : "Filters"}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filters
          {activeChips.length > 0 ? (
            <span className="cq-events-filter-count" aria-hidden>
              {activeChips.length}
            </span>
          ) : null}
        </button>
      </div>

      {activeChips.length > 0 ? (
        <div className="cq-events-active-filters" aria-label="Active filters">
          {activeChips.map((chip) => (
            <span key={chip.id} className="cq-events-active-chip">
              {chip.label}
              <button
                type="button"
                onClick={() => {
                  setFilters((prev) => removeActiveEventFilter(prev, chip.id));
                  setDraftFilters((prev) => removeActiveEventFilter(prev, chip.id));
                }}
                aria-label={`Remove ${chip.label} filter`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

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
      {showSkeleton ? <EventsFeedSkeleton /> : null}
      {!showSkeleton && rankedEvents.length === 0 ? (
        <div className="cq-events-zero" role="status">
          <span className="cq-events-zero__icon" aria-hidden>
            <CalendarSearch className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="cq-events-zero__title">{emptyCopy.title}</p>
          <p className="cq-events-zero__detail">{emptyCopy.detail}</p>
          {emptyCopy.action === "clear_filters" ? (
            <button type="button" onClick={clearEventFilters} className="cq-events-zero__cta cq-tap-press">
              {emptyCopy.actionLabel ?? "Clear filters"}
            </button>
          ) : (
            <button type="button" onClick={() => void loadEvents()} className="cq-events-zero__cta cq-tap-press">
              Refresh events
            </button>
          )}
        </div>
      ) : null}

      {!showSkeleton && !searching ? (
        <HappeningSoonCarousel
          rows={discoverySections.happeningSoon}
          rsvpingId={rsvping}
          onView={openDetail}
          onViewOnMap={onViewOnMap}
          onToggleInterested={(item) => void handleInterested(item.event.id, item.kind)}
        />
      ) : null}

      {!showSkeleton && showForYouSection && rankedEvents.length > 0 ? (
        <section className="cq-events-foryou" aria-labelledby="cq-events-foryou-title">
          <div className="cq-events-section-head">
            <div>
              <h2 id="cq-events-foryou-title" className="cq-events-section-title cq-events-section-title--icon">
                <Sparkles className="cq-events-section-icon" aria-hidden />
                For You
              </h2>
              <p className="cq-events-section-sub">
                {hasForYouSignals ? "Based on your interests" : EVENTS_INTEREST_PROMPT}
              </p>
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

      {!showSkeleton && visibleMore.length > 0 ? (
        <section className="cq-events-more" aria-labelledby="cq-events-more-title">
          <h2 id="cq-events-more-title" className="cq-events-section-title">
            {searching ? (savedOnly ? "Saved" : "Search results") : showForYouSection ? "More events" : "Upcoming"}
          </h2>
          <div className="cq-events-feed">{visibleMore.map((row) => renderFeedCard(row, 1))}</div>
          {discoverySections.more.length > visibleMore.length ? (
            <div ref={moreSentinelRef} className="cq-events-more-sentinel">
              <button
                type="button"
                className="cq-events-more-sentinel-btn"
                onClick={() => setMoreVisible((count) => count + MORE_EVENTS_BATCH)}
              >
                Show more events
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <EventsFilterSheet
        open={filtersOpen}
        draft={draftFilters}
        resultCount={draftMatchCount}
        sports={sports}
        organizations={organizationOptions}
        onChange={setDraftFilters}
        onClose={closeFilters}
        onClear={clearSheetFilters}
        onApply={applyDraftFilters}
      />
    </section>
    {liveDetail ? (
      <EventDetailScreen
        item={liveDetail}
        recommendation={rankedEvents.find((row) => row.item.event.id === liveDetail.event.id)?.recommendation ?? null}
        error={error}
        interestedPending={rsvping === liveDetail.event.id}
        onBack={closeDetail}
        backLabel="Events"
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
        onOpenOrganization={onOpenOrganization}
      />
    ) : null}
    </>
  );
}

function EventsFeedSkeleton() {
  return (
    <div className="cq-events-skeletons" aria-busy="true" aria-label="Loading events">
      <div className="cq-events-skeleton-card cq-events-skeleton-card--feature">
        <div className="cq-events-skeleton-media" />
        <div className="cq-events-skeleton-copy">
          <span className="cq-events-skeleton-line cq-events-skeleton-line--title" />
          <span className="cq-events-skeleton-line" />
          <span className="cq-events-skeleton-line cq-events-skeleton-line--short" />
        </div>
      </div>
      <div className="cq-events-skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="cq-events-skeleton-card">
            <div className="cq-events-skeleton-media cq-events-skeleton-media--square" />
            <div className="cq-events-skeleton-copy">
              <span className="cq-events-skeleton-line cq-events-skeleton-line--title" />
              <span className="cq-events-skeleton-line cq-events-skeleton-line--short" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
