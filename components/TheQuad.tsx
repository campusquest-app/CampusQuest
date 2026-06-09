"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getFeed,
  verifyFieldNote,
  assistFieldNote,
  getCommentsByNoteId,
  addComment,
  mergeRemoteQuadPostsCache,
  cloneFeedNotesForDisplay,
  type QuadFeedType,
} from "@/lib/feedStore";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { fetchQuadHomePosts } from "@/lib/client/quadPostsClient";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { getCharacterById } from "@/lib/friendsStore";
import type { FieldNote, Character } from "@/lib/types";
import { FieldNoteCard } from "@/components/FieldNoteCard";
import { QuadCreatePostFab } from "@/components/QuadCreatePostFab";

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
}: {
  character: Character;
  onRefresh?: () => void;
  feedTab: QuadFeedTab;
  onFeedTabChange: (tab: QuadFeedTab) => void;
}) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [reactionNotice, setReactionNotice] = useState<string | null>(null);
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(() => new Set());
  const quadHeaderRef = useRef<HTMLDivElement | null>(null);

  const baseFeedType: QuadFeedType = feedTab === "friends" ? "friends" : "public";

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const remote = await fetchQuadHomePosts(character.id, 80);
        mergeRemoteQuadPostsCache(remote);
      } catch {
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
      onRefresh?.();
    })();
  }, [character.id, baseFeedType, feedTab, onRefresh]);

  useEffect(() => {
    const tid = scheduleNonCriticalWork(() => refresh());
    return () => window.clearTimeout(tid);
  }, [refresh]);

  useLayoutEffect(() => {
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
  }, [feedTab]);

  const emptyCopy = useMemo(() => {
    if (feedTab === "friends") return { title: "Nothing from friends yet", body: "Follow Rams in Friends to see their posts here." };
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

  function handleNod(noteId: string) {
    if (pendingReactions.has(noteId)) return;
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
  }

  function handleHype(noteId: string) {
    if (pendingReactions.has(noteId)) return;
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
  }

  function handleVerify(noteId: string) {
    verifyFieldNote(noteId, character.id);
    refresh();
    onRefresh?.();
  }

  function handleAssist(noteId: string) {
    assistFieldNote(noteId, character.id);
    refresh();
    onRefresh?.();
  }

  function handleAddComment(noteId: string, body: string) {
    addComment(noteId, {
      authorId: character.id,
      authorName: character.name,
      authorUsername: character.username,
      authorAvatar: character.avatar,
      body,
    });
    refresh();
  }

  const quadHeader = (
    <div
      ref={quadHeaderRef}
      className="cq-quad-header cq-nav-shell-quad fixed inset-x-0 z-40 w-full"
      style={{ top: "var(--cq-topnav-h, 64px)" }}
    >
      <div className="w-full px-[2.5vw] pb-3.5 pt-3 sm:px-[3vw]">
        <div className="cq-quad-header-row">
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
              {feedTab === "trending" ? "Trending on campus" : "What's Happening On Campus"}
            </p>
            <span className="cq-quad-accent-line" aria-hidden />
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
  );

  return (
    <>
      {typeof document !== "undefined" ? createPortal(quadHeader, document.body) : null}

      <div className="flex min-h-[50vh] w-full flex-col bg-cq-app">
        <div
          className="cq-quad-feed-body w-full flex-1"
          style={{ paddingTop: "var(--cq-quad-header-offset, var(--cq-quad-header-h, 52px))" }}
        >
          {notes.length === 0 ? (
            <div className="px-[2.5vw] py-16 text-center sm:px-[3vw]">
              <p className="font-display text-base font-bold text-white">{emptyCopy.title}</p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/45">{emptyCopy.body}</p>
            </div>
          ) : (
            <div className="cq-quad-feed-stream px-[2.5vw] sm:px-[3vw]">
              {reactionNotice ? (
                <p className="cq-quad-reaction-notice mb-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
                  {reactionNotice}
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
                  likePending={pendingReactions.has(note.id)}
                  currentUser={{
                    id: character.id,
                    name: character.name,
                    username: character.username,
                    avatar: character.avatar,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <QuadCreatePostFab
        feedTab={feedTab}
        character={character}
        onPosted={refresh}
      />
    </>
  );
}
