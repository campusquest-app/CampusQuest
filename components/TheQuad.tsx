"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getFeed,
  verifyFieldNote,
  assistFieldNote,
  getCommentsByNoteId,
  mergeRemoteQuadPostsCache,
  cloneFeedNotesForDisplay,
  getNoteForReaction,
  type QuadFeedType,
} from "@/lib/feedStore";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { fetchEmberAllowance } from "@/lib/client/emberAllowance";
import { showAppToast } from "@/lib/client/appToast";
import { submitQuadComment } from "@/lib/client/quadCommentActions";
import { fetchQuadHomePosts, fetchQuadFriendsPosts, fetchQuadCommunityPosts, fetchLocalBusinessPosts, fetchOrganizationPosts } from "@/lib/client/quadPostsClient";
import { subscribeSocialSync } from "@/lib/client/socialSync";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { getCharacterById } from "@/lib/friendsStore";
import type { CampusMemoryGroup, FieldNote, Character } from "@/lib/types";
import type { QuadPostXpReward } from "@/lib/quadPostXp";
import { FieldNoteCard } from "@/components/FieldNoteCard";
import { CampusMemoriesRow } from "@/components/memories/CampusMemoriesRow";
import { CampusMemoryViewer } from "@/components/memories/CampusMemoryViewer";
import { AddCampusMemorySheet } from "@/components/memories/AddCampusMemorySheet";
import type { CampusLocationId } from "@/lib/locations/registry";
import { QuadFeedSkeleton } from "@/components/QuadFeedSkeleton";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { PullToRefresh } from "@/components/PullToRefresh";
import { QuadCreatePostFab } from "@/components/QuadCreatePostFab";
import { TopNav } from "@/components/TopNav";
import { refreshPlayerSnapshotFromServer } from "@/lib/client/refreshPlayerSnapshot";
import {
  clearStaleAuthClientState,
  hasClientAccessSession,
  isMissingSessionError,
} from "@/lib/client/authSessionClient";
import { isQuadCommunityChannel, QUAD_COMMUNITY_FEED_LABELS, type QuadCommunityChannel } from "@/lib/quadCommunityChannels";
import { isLocalBusinessesFeedTab, isMarketFeedTab, type QuadFeedTab } from "@/lib/client/quadFeedOptions";
import { useCampusIdentities } from "@/lib/client/useCampusIdentities";
import { canManageOrganizationPost } from "@/lib/quad/localBusinessFeed";
import { fetchMarketplaceListings } from "@/lib/client/marketplaceClient";
import { interleaveMarketIntoCampusFeed } from "@/lib/identity/policy";
import { CampusFeedListingCard } from "@/components/identity/CampusFeedListingCard";
import type { MarketplaceListing, MarketplaceSeller } from "@/lib/marketplace/types";
import { TheMarketFeed } from "@/components/market/TheMarketFeed";
import { OrgVerificationCta } from "@/components/quad/OrgVerificationCta";
import type { OrgVerificationVariant } from "@/lib/identity/organizationVerification";
import { useRecommendationProfile } from "@/lib/client/useRecommendationProfile";
import {
  fieldNoteToRecommendationEntity,
  rankRecommendationEntities,
  recommendationTimeBucket,
} from "@/lib/recommendations";

export type { QuadFeedTab };

function isCommunityFeedTab(tab: QuadFeedTab): tab is QuadCommunityChannel {
  return isQuadCommunityChannel(tab);
}

function orgVerificationCtaVariant(tab: QuadFeedTab): OrgVerificationVariant | null {
  if (tab === "student_organizations") return "general";
  if (tab === "greek_life") return "greek";
  return null;
}

/** Synced by ResizeObserver — feed content clears this fixed header height */
export const QUAD_HEADER_CSS_VAR = "--cq-quad-header-h";

function enrichNote(note: FieldNote): FieldNote {
  if (note.authorStreakDays != null) return note;
  const snap = getCharacterById(note.authorId);
  if (snap?.streakDays != null) {
    return { ...note, authorStreakDays: snap.streakDays };
  }
  return note;
}

function trendingScore(note: FieldNote): number {
  return note.nodCount + (note.verifyCount ?? 0) * 2 + (note.assistCount ?? 0);
}

export function TheQuad({
  character,
  onRefresh,
  feedTab,
  onFeedTabChange,
  onViewAuthor,
  onSharePost,
  sessionReady = true,
  onSessionMissing,
  onOpenMenu,
  onOpenInbox,
  unreadNotificationCount,
  chromeSuppressed = false,
  canModeratePosts = false,
  onPostXpReward,
  showXpProgressBar = false,
  personalization = null,
  onViewEvent,
  onViewOnMap,
  onMessageSeller,
}: {
  character: Character;
  onRefresh?: () => void;
  feedTab: QuadFeedTab;
  onFeedTabChange: (tab: QuadFeedTab) => void;
  onViewAuthor?: (author: {
    userId: string;
    username: string;
    name: string;
    avatar: string;
    organizationId?: string;
  }) => void;
  onSharePost?: (note: FieldNote) => void;
  /** When false, skip authed API calls (e.g. auth still bootstrapping). */
  sessionReady?: boolean;
  /** Called when authed APIs report a missing/expired session. */
  onSessionMissing?: () => void;
  onOpenMenu?: () => void;
  onOpenInbox?: () => void;
  unreadNotificationCount?: number;
  /** Hide Quad chrome instantly (drawer, modals, overlays). */
  chromeSuppressed?: boolean;
  canModeratePosts?: boolean;
  onPostXpReward?: (reward: QuadPostXpReward) => void;
  /** When true (prefs loaded + enabled), show Level/XP/Streak strip in TopNav. */
  showXpProgressBar?: boolean;
  personalization?: {
    schoolName?: string;
    interests?: string[];
    communities?: string[];
    institutionId?: string | null;
    studentStatus?: string | null;
    classYear?: number | null;
  } | null;
  onViewEvent?: (eventId: string) => void;
  onViewOnMap?: (locationId: string) => void;
  onMessageSeller?: (seller: MarketplaceSeller) => void;
}) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const feedCacheRef = useRef(new Map<string, FieldNote[]>());
  const scrollByFeedRef = useRef(new Map<string, number>());
  const feedTabRef = useRef(feedTab);
  /** Bumped on each refresh / feed switch so stale async responses cannot overwrite another tab. */
  const refreshGenerationRef = useRef(0);
  const [campusListings, setCampusListings] = useState<MarketplaceListing[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(() => new Set());
  const [pendingEmbers, setPendingEmbers] = useState<Set<string>>(() => new Set());
  const [memoryGroup, setMemoryGroup] = useState<CampusMemoryGroup | null>(null);
  const [memoryViewerInitialId, setMemoryViewerInitialId] = useState<string | undefined>();
  const [memoryViewerIncludeExpired, setMemoryViewerIncludeExpired] = useState(false);
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [addMemoryLocationId, setAddMemoryLocationId] = useState<CampusLocationId>("the-quad");
  const [marketSellOpen, setMarketSellOpen] = useState(false);
  const [marketRefreshKey, setMarketRefreshKey] = useState(0);
  const showQuadChrome = !chromeSuppressed;
  const recProfile = useRecommendationProfile(personalization);
  const identityState = useCampusIdentities();
  const managedOrganizationIds = identityState.identities
    .filter((identity) => identity.type === "organization" && identity.verified)
    .map((identity) => identity.id);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isMarketFeedTab(feedTab)) setMarketSellOpen(false);
  }, [feedTab]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.documentElement.setAttribute("data-cq-on-quad", "true");
    // Marks the document as the Social feed scroll surface for bottom-nav auto-hide.
    document.documentElement.setAttribute("data-cq-quad-scroll-root", "true");
    return () => {
      document.documentElement.removeAttribute("data-cq-on-quad");
      document.documentElement.removeAttribute("data-cq-quad-scroll-root");
      document.documentElement.style.removeProperty("--cq-topnav-h");
      document.documentElement.style.removeProperty("--cq-quad-header-h");
    };
  }, []);

  useEffect(() => {
    void fetchEmberAllowance().catch(() => undefined);
  }, []);

  const baseFeedType: QuadFeedType = feedTab === "friends" ? "friends" : "public";

  const applyCampusFeedRanking = useCallback(
    (list: FieldNote[]): FieldNote[] => {
      if (feedTab !== "public") {
        setReasonById({});
        return list;
      }
      const ranked = rankRecommendationEntities({
        items: list,
        toEntity: fieldNoteToRecommendationEntity,
        profile: recProfile,
        nowMs: recommendationTimeBucket(),
        diversity: true,
        exploreEvery: 4,
      });
      const reasons: Record<string, string> = {};
      ranked.slice(0, 8).forEach((row) => {
        if (row.recommendation.reason) reasons[row.item.id] = row.recommendation.reason.label;
      });
      setReasonById(reasons);
      return ranked.map((row) => row.item);
    },
    [feedTab, recProfile],
  );

  const handleSessionMissing = useCallback(() => {
    clearStaleAuthClientState();
    onSessionMissing?.();
  }, [onSessionMissing]);

  const refreshPlayerSnapshotSafe = useCallback(async () => {
    if (!hasClientAccessSession()) return;
    try {
      await refreshPlayerSnapshotFromServer();
    } catch (err) {
      if (isMissingSessionError(err)) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("No active session, skipping player snapshot refresh");
        }
        handleSessionMissing();
        return;
      }
      console.error("[cq:quad] player snapshot refresh failed", err);
    }
  }, [handleSessionMissing]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!sessionReady) return;
    if (!hasClientAccessSession()) {
      setFeedLoading(false);
      return;
    }
    const generation = ++refreshGenerationRef.current;
    const tabAtStart = feedTab;
    const stillCurrent = () =>
      generation === refreshGenerationRef.current && feedTabRef.current === tabAtStart;

    if (!silent) {
      setFeedError(null);
      if ((feedCacheRef.current.get(feedTab)?.length ?? 0) === 0) {
        setFeedLoading(true);
      }
    }

    try {
      if (isMarketFeedTab(feedTab)) {
        if (!stillCurrent()) return;
        setFeedLoading(false);
        setNotes([]);
        setCampusListings([]);
        setFeedError(null);
        setMarketRefreshKey((value) => value + 1);
        onRefresh?.();
        return;
      }

      if (feedTab === "student_organizations") {
        setCampusListings([]);
        try {
          const remote = await fetchOrganizationPosts(character.id, 80);
          if (!stillCurrent()) return;
          mergeRemoteQuadPostsCache(remote);
          const list = remote.map((note) => enrichNote(getNoteForReaction(note.id) ?? note));
          setNotes(cloneFeedNotesForDisplay(list));
          setFeedError(null);
        } catch (err) {
          if (isMissingSessionError(err)) {
            handleSessionMissing();
            return;
          }
          if (!stillCurrent()) return;
          setNotes([]);
          setFeedError("Could not load Organizations.");
        }
        if (!stillCurrent()) return;
        await refreshPlayerSnapshotSafe();
        onRefresh?.();
        return;
      }

      if (isLocalBusinessesFeedTab(feedTab)) {
        setCampusListings([]);
        try {
          const remote = await fetchLocalBusinessPosts(character.id, 80);
          if (!stillCurrent()) return;
          mergeRemoteQuadPostsCache(remote);
          const list = remote.map((note) => enrichNote(getNoteForReaction(note.id) ?? note));
          setNotes(cloneFeedNotesForDisplay(list));
          setFeedError(null);
        } catch (err) {
          if (isMissingSessionError(err)) {
            handleSessionMissing();
            return;
          }
          if (!stillCurrent()) return;
          setNotes([]);
          setFeedError("Could not load Local Businesses.");
        }
        if (!stillCurrent()) return;
        await refreshPlayerSnapshotSafe();
        onRefresh?.();
        return;
      }

      if (feedTab === "friends") {
        setCampusListings([]);
        try {
          const remote = await fetchQuadFriendsPosts(character.id, 80);
          if (!stillCurrent()) return;
          mergeRemoteQuadPostsCache(remote);
          const list = remote.map((note) => enrichNote(getNoteForReaction(note.id) ?? note));
          setNotes(cloneFeedNotesForDisplay(list));
          setFeedError(null);
        } catch (err) {
          if (isMissingSessionError(err)) {
            handleSessionMissing();
            return;
          }
          if (!stillCurrent()) return;
          setNotes([]);
          setFeedError("Could not load your Following feed.");
        }
        if (!stillCurrent()) return;
        await refreshPlayerSnapshotSafe();
        onRefresh?.();
        return;
      }

      if (isCommunityFeedTab(feedTab)) {
        setCampusListings([]);
        try {
          const remote = await fetchQuadCommunityPosts(character.id, feedTab, 80);
          if (!stillCurrent()) return;
          mergeRemoteQuadPostsCache(remote);
          const list = remote.map((note) => enrichNote(getNoteForReaction(note.id) ?? note));
          setNotes(cloneFeedNotesForDisplay(list));
          setFeedError(null);
        } catch (err) {
          if (isMissingSessionError(err)) {
            handleSessionMissing();
            return;
          }
          if (!stillCurrent()) return;
          setNotes([]);
          setFeedError("Could not load this community feed.");
        }
        if (!stillCurrent()) return;
        await refreshPlayerSnapshotSafe();
        onRefresh?.();
        return;
      }

      let homeFetchFailed = false;
      try {
        const remote = await fetchQuadHomePosts(character.id, 80);
        if (!stillCurrent()) return;
        mergeRemoteQuadPostsCache(remote);
      } catch (err) {
        if (isMissingSessionError(err)) {
          handleSessionMissing();
          return;
        }
        homeFetchFailed = true;
        // Keep cached posts on transient failures so reactions are not lost in-session.
      }
      if (!stillCurrent()) return;
      let list = getFeed(character.id, baseFeedType).map(enrichNote);
      if (feedTab === "trending") {
        list = [...list].sort((a, b) => {
          const diff = trendingScore(b) - trendingScore(a);
          return diff !== 0 ? diff : b.createdAt - a.createdAt;
        });
      } else if (feedTab === "public") {
        list = applyCampusFeedRanking(list);
      }
      setNotes(cloneFeedNotesForDisplay(list));
      if (feedTab === "public") {
        try {
          const listings = await fetchMarketplaceListings({ campusFeed: true });
          if (!stillCurrent()) return;
          setCampusListings(listings);
        } catch {
          if (!stillCurrent()) return;
          setCampusListings([]);
        }
      } else {
        setCampusListings([]);
      }
      if (homeFetchFailed && list.length === 0) {
        setFeedError("Could not load The Quad right now.");
      } else {
        setFeedError(null);
      }
      await refreshPlayerSnapshotSafe();
      onRefresh?.();
    } finally {
      if (stillCurrent()) setFeedLoading(false);
    }
  }, [
    character.id,
    baseFeedType,
    feedTab,
    onRefresh,
    sessionReady,
    handleSessionMissing,
    refreshPlayerSnapshotSafe,
    applyCampusFeedRanking,
  ]);

  const handlePullRefresh = useCallback(async () => {
    await refresh({ silent: true });
  }, [refresh]);

  useEffect(() => {
    if (notes.length > 0 && feedTabRef.current === feedTab) {
      feedCacheRef.current.set(feedTab, notes);
    }
  }, [notes, feedTab]);

  useEffect(() => {
    const previous = feedTabRef.current;
    if (previous === feedTab) return;
    // Invalidate in-flight refreshes so a slower Campus Feed response cannot paint into Greek Life.
    refreshGenerationRef.current += 1;
    if (notes.length > 0) feedCacheRef.current.set(previous, notes);
    scrollByFeedRef.current.set(previous, window.scrollY);
    feedTabRef.current = feedTab;
    const y = scrollByFeedRef.current.get(feedTab) ?? 0;
    const cached = feedCacheRef.current.get(feedTab);
    if (cached && cached.length > 0) {
      setNotes(cached);
      setFeedLoading(false);
    } else {
      setFeedLoading(true);
      setNotes([]);
    }
    window.requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [feedTab, notes]);

  useEffect(() => {
    if (!sessionReady || !hasClientAccessSession()) return undefined;

    const tid = scheduleNonCriticalWork(() => {
      void refresh().catch((err) => {
        if (!isMissingSessionError(err)) {
          console.error("[cq:quad] refresh failed", err);
        }
      });
    });
    const unsubscribe = subscribeSocialSync(() => {
      void refresh({ silent: true }).catch((err) => {
        if (!isMissingSessionError(err)) {
          console.error("[cq:quad] refresh failed", err);
        }
      });
    });
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        void refresh({ silent: true }).catch((err) => {
          if (!isMissingSessionError(err)) {
            console.error("[cq:quad] refresh failed", err);
          }
        });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(tid);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, sessionReady]);

  // The inline tab row was removed (replaced by the CampusQuest ▼ feed selector),
  // so the quad header no longer contributes extra fixed height. Keep the legacy
  // CSS var pinned to 0 so any remaining `calc(... + var(--cq-quad-header-h))`
  // fallbacks collapse cleanly instead of reserving phantom space.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!showQuadChrome) {
      document.documentElement.style.removeProperty(QUAD_HEADER_CSS_VAR);
      return undefined;
    }
    document.documentElement.style.setProperty(QUAD_HEADER_CSS_VAR, "0px");
    return () => {
      document.documentElement.style.removeProperty(QUAD_HEADER_CSS_VAR);
    };
  }, [showQuadChrome]);

  const emptyCopy = useMemo(() => {
    if (feedTab === "student_organizations") {
      return {
        title: "No organization posts yet",
        body: "Posts from approved campus organizations will show up here.",
      };
    }
    if (isLocalBusinessesFeedTab(feedTab)) {
      return {
        title: "No local business posts yet",
        body: "Deals, updates, and posts from nearby businesses will show up here.",
      };
    }
    if (feedTab === "friends") {
      return {
        title: "Follow people to see their latest posts here",
        body: "When you connect with classmates, their Quad posts show up here — newest first.",
      };
    }
    if (feedTab === "trending") {
      return {
        title: "No trending posts yet",
        body: "Like, Ember, and verify posts to push campus moments to the top.",
      };
    }
    if (isCommunityFeedTab(feedTab)) {
      const copy = QUAD_COMMUNITY_FEED_LABELS[feedTab];
      return { title: copy.emptyTitle, body: copy.emptyBody };
    }
    return {
      title: "No posts yet",
      body: "Tap + to share what’s happening on campus. This Campus Feed stays open to the whole URI community.",
    };
  }, [feedTab]);

  const streamItems = useMemo(
    () =>
      feedTab === "public"
        ? interleaveMarketIntoCampusFeed(notes, campusListings)
        : notes.map((note) => ({
            kind: "post" as const,
            id: note.id,
            createdAt: note.createdAt,
            note,
          })),
    [campusListings, feedTab, notes],
  );

  /** First post in the stream gets priority media decode (LCP on mobile Safari). */
  const priorityPostId = useMemo(() => {
    for (const item of streamItems) {
      if (item.kind === "post") return item.note.id;
    }
    return null;
  }, [streamItems]);

  const syncNotesFromFeed = useCallback(() => {
    // Always pull reaction membership from the mutation cache so Ember awards
    // are not lost to a stale list clone after optimistic updates.
    setNotes((prev) =>
      cloneFeedNotesForDisplay(
        prev.map((note) => {
          const updated = getNoteForReaction(note.id);
          return enrichNote(updated ?? note);
        }),
      ),
    );
  }, []);

  const pendingLikesRef = useRef(pendingLikes);
  pendingLikesRef.current = pendingLikes;
  const pendingEmbersRef = useRef(pendingEmbers);
  pendingEmbersRef.current = pendingEmbers;

  const handleNod = useCallback(
    (noteId: string) => {
      if (pendingLikesRef.current.has(noteId)) return;
      setPendingLikes((prev) => new Set(prev).add(noteId));
      void toggleQuadLike({
        noteId,
        userId: character.id,
        onOptimistic: syncNotesFromFeed,
      }).then((result) => {
        setPendingLikes((prev) => {
          const next = new Set(prev);
          next.delete(noteId);
          return next;
        });
        if (!result.ok && result.message) {
          showAppToast(result.message, { tone: "error" });
        }
      });
    },
    [character.id, syncNotesFromFeed],
  );

  const handleHype = useCallback(
    (noteId: string) => {
      if (pendingEmbersRef.current.has(noteId)) return;
      // Update the ref synchronously so rapid taps cannot double-fire before re-render.
      const pending = new Set(pendingEmbersRef.current).add(noteId);
      pendingEmbersRef.current = pending;
      setPendingEmbers(pending);
      void toggleQuadSpark({
        noteId,
        userId: character.id,
        onOptimistic: syncNotesFromFeed,
      }).then((result) => {
        const next = new Set(pendingEmbersRef.current);
        next.delete(noteId);
        pendingEmbersRef.current = next;
        setPendingEmbers(next);
        if (!result.ok && result.message) {
          showAppToast(result.message, { tone: "error" });
        }
      });
    },
    [character.id, syncNotesFromFeed],
  );

  const handleVerify = useCallback(
    (noteId: string) => {
      verifyFieldNote(noteId, character.id);
      void refresh({ silent: true });
      onRefresh?.();
    },
    [character.id, onRefresh, refresh],
  );

  const handleAssist = useCallback(
    (noteId: string) => {
      assistFieldNote(noteId, character.id);
      void refresh({ silent: true });
      onRefresh?.();
    },
    [character.id, onRefresh, refresh],
  );

  const handleAddComment = useCallback(
    (noteId: string, body: string, parentCommentId?: string | null) => {
      return submitQuadComment({
        noteId,
        parentCommentId,
        author: {
          authorId: character.id,
          authorName: character.name,
          authorUsername: character.username,
          authorAvatar: character.avatar,
          body,
        },
        onOptimistic: () => refresh({ silent: true }),
      }).then((result) => {
        if (!result.ok && result.message) {
          showAppToast(result.message, { tone: "error" });
        }
        return result;
      });
    },
    [character.avatar, character.id, character.name, character.username, refresh],
  );

  const handleCommentsUpdated = useCallback(() => {
    setNotes((prev) => prev.slice());
  }, []);

  const handlePostUpdated = useCallback((updated: FieldNote) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === updated.id
          ? {
              ...updated,
              nodByUserIds: n.nodByUserIds,
              hypeByUserIds: n.hypeByUserIds,
              vouchByUserIds: n.vouchByUserIds,
              verifyByUserIds: n.verifyByUserIds,
              assistByUserIds: n.assistByUserIds,
            }
          : n,
      ),
    );
  }, []);

  const handlePostDeleted = useCallback((postId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== postId));
  }, []);

  const handleActionMessage = useCallback((message: string) => {
    showAppToast(message, { tone: "success" });
  }, []);

  const quadCurrentUser = useMemo(
    () => ({
      id: character.id,
      name: character.name,
      username: character.username,
      avatar: character.avatar,
    }),
    [character.avatar, character.id, character.name, character.username],
  );

  // Stable spacer equal to the full fixed-header height so feed content never
  // jumps while the scroll-linked header translates up/down with the user.
  // The header is now just the TopNav (the inline tab row was replaced by the
  // CampusQuest ▼ feed selector), so the spacer tracks only --cq-topnav-h.
  const quadChromeStackPadding = "var(--cq-topnav-h, 0px)";

  const quadTopChrome =
    showQuadChrome && typeof document !== "undefined"
      ? createPortal(
          <div className="cq-quad-header-shell" data-cq-quad-header-shell>
            <TopNav
              username={character.username}
              character={character}
              onOpenMenu={onOpenMenu}
              onOpenInbox={onOpenInbox}
              unreadNotificationCount={unreadNotificationCount}
              feedTab={feedTab}
              onSelectFeedTab={onFeedTabChange}
              showXpProgressBar={showXpProgressBar}
            />
          </div>,
          document.body,
        )
      : null;

  const orgCtaVariant = orgVerificationCtaVariant(feedTab);

  const feedLoadingLabel =
    isMarketFeedTab(feedTab)
      ? "Loading The Market…"
      : feedTab === "student_organizations"
      ? "Loading Organizations…"
      : isLocalBusinessesFeedTab(feedTab)
      ? "Loading Local Businesses…"
      : feedTab === "friends"
      ? "Loading Following feed…"
      : feedTab === "trending"
        ? "Loading trending posts…"
        : isCommunityFeedTab(feedTab)
          ? `Loading ${QUAD_COMMUNITY_FEED_LABELS[feedTab].label}…`
          : "Loading Campus Feed…";

  return (
    <>
      {quadTopChrome}

      <PullToRefresh
        onRefresh={handlePullRefresh}
        indicatorTop={quadChromeStackPadding}
      >
      <div className="flex min-h-[50vh] w-full flex-col bg-cq-app">
        <div
          className="cq-quad-feed-body w-full flex-1"
          style={{ paddingTop: showQuadChrome ? quadChromeStackPadding : "0px" }}
        >
          {orgCtaVariant ? <OrgVerificationCta variant={orgCtaVariant} /> : null}
          {isMarketFeedTab(feedTab) ? (
            <TheMarketFeed
              viewerId={character.id}
              sellOpen={marketSellOpen}
              onSellOpenChange={setMarketSellOpen}
              refreshKey={marketRefreshKey}
              onMessageSeller={(seller) => onMessageSeller?.(seller)}
              onSessionMissing={handleSessionMissing}
            />
          ) : feedLoading ? (
            <QuadFeedSkeleton label={feedLoadingLabel} />
          ) : feedError ? (
            <div className="px-[2.5vw] py-10 sm:px-[3vw]">
              <ScreenDataState
                variant="error"
                message={feedError}
                detail="Check your connection and try again."
                onRetry={() => void refresh()}
              />
            </div>
          ) : streamItems.length === 0 ? (
            <div className="px-[2.5vw] py-10 sm:px-[3vw]">
              <ScreenDataState variant="empty" message={emptyCopy.title} detail={emptyCopy.body} />
            </div>
          ) : (
            <div className="cq-quad-feed-stream">
              {feedTab === "public" ? (
                <CampusMemoriesRow
                  onOpenGroup={setMemoryGroup}
                  onAddMemory={(locationId) => {
                    setAddMemoryLocationId(locationId ?? "the-quad");
                    setShowAddMemory(true);
                  }}
                />
              ) : null}
              {streamItems.map((item) =>
                item.kind === "market" ? (
                  <CampusFeedListingCard
                    key={item.id}
                    listing={item.listing}
                    viewerId={character.id}
                    onMessageSeller={onMessageSeller}
                  />
                ) : (
                <div key={item.id}>
                  {reasonById[item.note.id] ? (
                    <p className="px-1 pb-1 text-[11px] font-semibold text-uri-keaney/90">{reasonById[item.note.id]}</p>
                  ) : null}
                  <FieldNoteCard
                  variant="feed"
                  note={item.note}
                  currentUserId={character.id}
                  comments={getCommentsByNoteId(item.note.id)}
                  onNod={handleNod}
                  onHype={handleHype}
                  onVerify={handleVerify}
                  onAssist={handleAssist}
                  onAddComment={handleAddComment}
                  onCommentsUpdated={handleCommentsUpdated}
                  likePending={pendingLikes.has(item.note.id)}
                  emberPending={pendingEmbers.has(item.note.id)}
                  onPostUpdated={handlePostUpdated}
                  onPostDeleted={handlePostDeleted}
                  canModeratePosts={canModeratePosts}
                  canManagePost={canManageOrganizationPost({
                    actorUserId: character.id,
                    postUserId: item.note.authorId,
                    postDestination: item.note.feedDestination,
                    postedAsType: item.note.postedAsType,
                    postedAsOrganizationId: item.note.postedAsId,
                    actorOrganizationIds: managedOrganizationIds,
                  })}
                  onActionMessage={handleActionMessage}
                  onViewAuthor={onViewAuthor}
                  onSharePost={onSharePost}
                  currentUser={quadCurrentUser}
                  onViewEvent={onViewEvent}
                  onViewOnMap={onViewOnMap}
                  priorityMedia={item.note.id === priorityPostId}
                />
                </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
      </PullToRefresh>

      <QuadCreatePostFab
        feedTab={feedTab}
        character={character}
        onPosted={() => refresh({ silent: true })}
        onXpReward={onPostXpReward}
        onMarketSell={() => setMarketSellOpen(true)}
      />

      {memoryGroup ? (
        <CampusMemoryViewer
          group={memoryGroup}
          currentUserId={character.id}
          initialMemoryId={memoryViewerInitialId}
          includeExpired={memoryViewerIncludeExpired}
          onClose={() => {
            setMemoryGroup(null);
            setMemoryViewerInitialId(undefined);
            setMemoryViewerIncludeExpired(false);
          }}
        />
      ) : null}

      {showAddMemory ? (
        <AddCampusMemorySheet
          defaultLocationId={addMemoryLocationId}
          onClose={() => setShowAddMemory(false)}
          onCreated={() => {}}
        />
      ) : null}
    </>
  );
}
