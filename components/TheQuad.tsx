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
  type QuadFeedType,
} from "@/lib/feedStore";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { submitQuadComment } from "@/lib/client/quadCommentActions";
import { fetchQuadHomePosts, fetchQuadFriendsPosts } from "@/lib/client/quadPostsClient";
import { subscribeSocialSync } from "@/lib/client/socialSync";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { getCharacterById } from "@/lib/friendsStore";
import type { FieldNote, Character } from "@/lib/types";
import { FieldNoteCard } from "@/components/FieldNoteCard";
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

export type QuadFeedTab = QuadFeedType | "trending";

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
  return (
    note.nodCount +
    (note.hypeCount ?? note.vouchCount ?? 0) * 2 +
    (note.verifyCount ?? 0) * 2 +
    (note.assistCount ?? 0)
  );
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
}: {
  character: Character;
  onRefresh?: () => void;
  feedTab: QuadFeedTab;
  onFeedTabChange: (tab: QuadFeedTab) => void;
  onViewAuthor?: (author: { userId: string; username: string; name: string; avatar: string }) => void;
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
}) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);
  const [postActionMessage, setPostActionMessage] = useState<string | null>(null);
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(() => new Set());
  const quadHeaderRef = useRef<HTMLDivElement | null>(null);
  const showQuadChrome = !chromeSuppressed;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.documentElement.setAttribute("data-cq-on-quad", "true");
    return () => {
      document.documentElement.removeAttribute("data-cq-on-quad");
      document.documentElement.style.removeProperty("--cq-topnav-h");
      document.documentElement.style.removeProperty("--cq-quad-header-h");
    };
  }, []);

  const baseFeedType: QuadFeedType = feedTab === "friends" ? "friends" : "public";

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
    if (!silent) {
      setFeedLoading(true);
      setFeedError(null);
    }

    try {
      if (feedTab === "friends") {
        try {
          const remote = await fetchQuadFriendsPosts(character.id, 80);
          const list = remote.map(enrichNote);
          setNotes(cloneFeedNotesForDisplay(list));
          setFeedError(null);
        } catch (err) {
          if (isMissingSessionError(err)) {
            handleSessionMissing();
            return;
          }
          setNotes([]);
          setFeedError("Could not load your Following feed.");
        }
        await refreshPlayerSnapshotSafe();
        onRefresh?.();
        return;
      }

      let homeFetchFailed = false;
      try {
        const remote = await fetchQuadHomePosts(character.id, 80);
        mergeRemoteQuadPostsCache(remote);
      } catch (err) {
        if (isMissingSessionError(err)) {
          handleSessionMissing();
          return;
        }
        homeFetchFailed = true;
        // Keep cached posts on transient failures so reactions are not lost in-session.
      }
      let list = getFeed(character.id, baseFeedType).map(enrichNote);
      if (feedTab === "trending") {
        list = [...list].sort((a, b) => {
          const diff = trendingScore(b) - trendingScore(a);
          return diff !== 0 ? diff : b.createdAt - a.createdAt;
        });
      }
      setNotes(cloneFeedNotesForDisplay(list));
      if (homeFetchFailed && list.length === 0) {
        setFeedError("Could not load The Quad right now.");
      } else {
        setFeedError(null);
      }
      await refreshPlayerSnapshotSafe();
      onRefresh?.();
    } finally {
      setFeedLoading(false);
    }
  }, [
    character.id,
    baseFeedType,
    feedTab,
    onRefresh,
    sessionReady,
    handleSessionMissing,
    refreshPlayerSnapshotSafe,
  ]);

  const handlePullRefresh = useCallback(async () => {
    await refresh({ silent: true });
  }, [refresh]);

  useEffect(() => {
    setFeedLoading(true);
    setNotes([]);
  }, [feedTab]);

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

  useEffect(() => {
    if (!postActionMessage) return undefined;
    const tid = window.setTimeout(() => setPostActionMessage(null), 2800);
    return () => window.clearTimeout(tid);
  }, [postActionMessage]);

  useLayoutEffect(() => {
    if (!showQuadChrome) {
      if (typeof document !== "undefined") {
        document.documentElement.style.removeProperty(QUAD_HEADER_CSS_VAR);
      }
      return undefined;
    }

    const el = quadHeaderRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const raw = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(QUAD_HEADER_CSS_VAR, `${Math.max(52, raw)}px`);
    };

    sync();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => sync());
      ro.observe(el);
    }
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener?.("resize", sync);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener?.("resize", sync);
      document.documentElement.style.removeProperty(QUAD_HEADER_CSS_VAR);
    };
  }, [feedTab, showQuadChrome]);

  const emptyCopy = useMemo(() => {
    if (feedTab === "friends") {
      return {
        title: "Follow people to see their latest posts here",
        body: "When you connect with classmates, their Quad posts show up here — newest first.",
      };
    }
    if (feedTab === "trending") return { title: "No trending posts yet", body: "Nod, hype, and verify posts to push campus moments to the top." };
    return { title: "No posts yet", body: "Tap + to share what’s happening on campus." };
  }, [feedTab]);

  const syncNotesFromFeed = useCallback(() => {
    let list = getFeed(character.id, baseFeedType).map(enrichNote);
    if (feedTab === "trending") {
      list = [...list].sort((a, b) => {
        const diff = trendingScore(b) - trendingScore(a);
        return diff !== 0 ? diff : b.createdAt - a.createdAt;
      });
    }
    setNotes(cloneFeedNotesForDisplay(list));
  }, [character.id, baseFeedType, feedTab]);

  const pendingReactionsRef = useRef(pendingReactions);
  pendingReactionsRef.current = pendingReactions;

  const handleNod = useCallback(
    (noteId: string) => {
      if (pendingReactionsRef.current.has(noteId)) return;
      setPendingReactions((prev) => new Set(prev).add(noteId));
      setReactionNotice(null);
      void toggleQuadLike({
        noteId,
        userId: character.id,
        onOptimistic: syncNotesFromFeed,
      }).then((result) => {
        setPendingReactions((prev) => {
          const next = new Set(prev);
          next.delete(noteId);
          return next;
        });
        if (!result.ok && result.message) {
          setReactionNotice(result.message);
        }
      });
    },
    [character.id, syncNotesFromFeed],
  );

  const handleHype = useCallback(
    (noteId: string) => {
      if (pendingReactionsRef.current.has(noteId)) return;
      setPendingReactions((prev) => new Set(prev).add(noteId));
      setReactionNotice(null);
      void toggleQuadSpark({
        noteId,
        userId: character.id,
        onOptimistic: syncNotesFromFeed,
      }).then((result) => {
        setPendingReactions((prev) => {
          const next = new Set(prev);
          next.delete(noteId);
          return next;
        });
        if (!result.ok && result.message) {
          setReactionNotice(result.message);
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
          setPostActionMessage(result.message);
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
    setPostActionMessage(message);
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
  const quadChromeStackPadding =
    "calc(var(--cq-topnav-h, 0px) + var(--cq-quad-header-h, 52px))";

  const quadHeader = showQuadChrome ? (
    <div
      ref={quadHeaderRef}
      className="cq-quad-header cq-nav-shell-quad relative w-full"
    >
      <div className="w-full px-[2.5vw] pb-2 pt-2 sm:px-[3vw] sm:pb-2.5">
        <div className="cq-quad-header-row tabs" data-no-drawer-swipe="true">
          <button
            type="button"
            onClick={() => onFeedTabChange("public")}
            className={`cq-quad-feed-tab justify-self-start touch-manipulation ${
              feedTab === "public" ? "cq-quad-feed-tab--active" : ""
            }`}
            aria-current={feedTab === "public" ? "page" : undefined}
          >
            For You
          </button>

          <div className="cq-quad-destination-center">
            <h2 className="cq-quad-destination-title font-display">The Quad</h2>
            <p className="cq-quad-destination-subtitle font-display">
              {feedTab === "trending" ? "Trending" : "On campus"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onFeedTabChange("friends")}
            className={`cq-quad-feed-tab justify-self-end touch-manipulation ${
              feedTab === "friends" ? "cq-quad-feed-tab--active" : ""
            }`}
            aria-current={feedTab === "friends" ? "page" : undefined}
          >
            Following
          </button>
        </div>
      </div>
    </div>
  ) : null;

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
            />
            {quadHeader}
          </div>,
          document.body,
        )
      : null;

  const feedLoadingLabel =
    feedTab === "friends"
      ? "Loading Following feed…"
      : feedTab === "trending"
        ? "Loading trending posts…"
        : "Loading The Quad…";

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
          {feedLoading ? (
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
          ) : notes.length === 0 ? (
            <div className="px-[2.5vw] py-10 sm:px-[3vw]">
              <ScreenDataState variant="empty" message={emptyCopy.title} detail={emptyCopy.body} />
            </div>
          ) : (
            <div className="cq-quad-feed-stream">
              {reactionNotice ? (
                <p className="cq-quad-reaction-notice mx-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {reactionNotice}
                </p>
              ) : null}
              {postActionMessage ? (
                <p className="mx-3 mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" aria-live="polite">
                  {postActionMessage}
                </p>
              ) : null}
              {notes.map((note) => (
                <FieldNoteCard
                  key={note.id}
                  variant="feed"
                  note={note}
                  currentUserId={character.id}
                  comments={getCommentsByNoteId(note.id)}
                  onNod={handleNod}
                  onHype={handleHype}
                  onVerify={handleVerify}
                  onAssist={handleAssist}
                  onAddComment={handleAddComment}
                  onCommentsUpdated={handleCommentsUpdated}
                  likePending={pendingReactions.has(note.id)}
                  onPostUpdated={handlePostUpdated}
                  onPostDeleted={handlePostDeleted}
                  canModeratePosts={canModeratePosts}
                  onActionMessage={handleActionMessage}
                  onViewAuthor={onViewAuthor}
                  onSharePost={onSharePost}
                  currentUser={quadCurrentUser}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      </PullToRefresh>

      <QuadCreatePostFab
        feedTab={feedTab}
        character={character}
        onPosted={() => refresh({ silent: true })}
      />
    </>
  );
}
