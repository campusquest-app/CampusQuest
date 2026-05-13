"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getFeed,
  nodFieldNote,
  hypeFieldNote,
  verifyFieldNote,
  assistFieldNote,
  getCommentsByNoteId,
  addComment,
  setRemoteQuadPostsCache,
  type QuadFeedType,
} from "@/lib/feedStore";
import { fetchQuadHomePosts } from "@/lib/client/quadPostsClient";
import { scheduleNonCriticalWork } from "@/lib/client/deferNonCriticalWork";
import { getCharacterById } from "@/lib/friendsStore";
import type { FieldNote, Character } from "@/lib/types";
import { FieldNoteComposer } from "@/components/FieldNoteComposer";
import { FieldNoteCard } from "@/components/FieldNoteCard";
import { AvatarDisplay } from "@/components/AvatarDisplay";

function enrichNote(note: FieldNote): FieldNote {
  if (note.authorStreakDays != null) return note;
  const snap = getCharacterById(note.authorId);
  if (snap?.streakDays != null) {
    return { ...note, authorStreakDays: snap.streakDays };
  }
  return note;
}

export function TheQuad({
  character,
  onRefresh,
}: {
  character: Character;
  onRefresh?: () => void;
}) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [feedType, setFeedType] = useState<QuadFeedType>("public");
  const [composerOpen, setComposerOpen] = useState(false);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        const remote = await fetchQuadHomePosts(80);
        const ms = typeof performance !== "undefined" ? performance.now() - t0 : 0;
        console.log("[cq:load] quad home posts", Math.round(ms), "ms");
        setRemoteQuadPostsCache(remote);
      } catch {
        setRemoteQuadPostsCache([]);
      }
      setNotes(getFeed(character.id, feedType).map(enrichNote));
      onRefresh?.();
    })();
  }, [character.id, feedType, onRefresh]);

  useEffect(() => {
    const tid = scheduleNonCriticalWork(() => refresh());
    return () => window.clearTimeout(tid);
  }, [refresh]);

  function handleNod(noteId: string) {
    nodFieldNote(noteId, character.id);
    refresh();
  }

  function handleHype(noteId: string) {
    hypeFieldNote(noteId, character.id);
    refresh();
    onRefresh?.();
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

  /** Pinned below Dashboard `Header` (sticky top-0, ~py-3 + two text lines). Keeps Quad bar + composer visible while scrolling. */
  const quadStickyTop = "max(4.35rem, calc(env(safe-area-inset-top, 0px) + 3.85rem))";

  return (
    <div className="flex min-h-[50vh] flex-col bg-gradient-to-b from-black/35 via-[#050c1a] to-uri-navy">
      {/* Sticky chrome: Quad title + composer — stays under app header while feed scrolls */}
      <div
        className="sticky z-[8] border-b border-white/[0.08] bg-gradient-to-b from-[#050c1a]/98 via-uri-navy/[0.97] to-uri-navy/[0.95] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150"
        style={{ top: quadStickyTop }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-uri-navy/[0.88] px-4 py-2.5">
          {/* Left: For you */}
          <div className="flex items-center justify-start">
            <button
              type="button"
              onClick={() => setFeedType("public")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ring-1 ring-white/10 ${
                feedType === "public"
                  ? "bg-gradient-to-b from-white/20 to-white/10 text-white shadow-md shadow-black/20"
                  : "bg-black/35 text-white/55 hover:text-white/85"
              }`}
            >
              For you
            </button>
          </div>
          {/* Centered title */}
          <div className="flex-1 flex items-center justify-center">
            <h1 className="font-display text-2xl sm:text-3xl font-black tracking-[0.25em] text-center uppercase bg-clip-text text-transparent bg-gradient-to-r from-[#68ABE8] via-[#B7E0FF] to-[#68ABE8] drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)]">
              THE&nbsp;QUAD
            </h1>
          </div>
          {/* Right: Following */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setFeedType("friends")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ring-1 ring-white/10 ${
                feedType === "friends"
                  ? "bg-gradient-to-b from-white/20 to-white/10 text-white shadow-md shadow-black/20"
                  : "bg-black/35 text-white/55 hover:text-white/85"
              }`}
            >
              Following
            </button>
          </div>
        </header>

        <div className="px-4 py-2.5">
          <button
            type="button"
            onClick={() => setComposerOpen((open) => !open)}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.12] bg-gradient-to-r from-black/40 via-uri-navy/70 to-black/40 px-3 py-2.5 text-left shadow-md shadow-black/40 transition-all hover:border-white/20 hover:shadow-[0_10px_28px_rgba(0,0,0,0.65)] active:scale-[0.99]"
            aria-expanded={composerOpen}
            aria-label={composerOpen ? "Close composer" : "Create new Field Note"}
          >
            <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-white/20 bg-black/40">
              <AvatarDisplay avatar={character.avatar} size={36} classId={character.classId} starterWeapon={character.starterWeapon} />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm text-white/70">
              {composerOpen ? "Close composer" : "What’s happening on campus?"}
            </span>
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-lg text-white/70 transition-transform ${
                composerOpen ? "rotate-45 border-uri-keaney/40 bg-uri-keaney/15 text-uri-keaney" : ""
              }`}
              aria-hidden
            >
              +
            </span>
          </button>
          {composerOpen && (
            <div className="mt-3 rounded-2xl border border-white/[0.1] bg-black/35 p-3 shadow-inner shadow-black/30">
              <FieldNoteComposer
                character={character}
                defaultVisibility={feedType}
                onPosted={() => {
                  refresh();
                  setComposerOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Feed — scrolls under sticky chrome */}
      <div className="flex-1">
        {notes.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-display text-base font-bold text-white">
              {feedType === "public" ? "No posts yet" : "Nothing from friends yet"}
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/45">
              {feedType === "public"
                ? "Share a Field Note — your proof and caption show up here for everyone."
                : "Follow friends in Find Friends to see their posts here."}
            </p>
          </div>
        ) : (
          notes.map((note) => (
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
              currentUser={{
                id: character.id,
                name: character.name,
                username: character.username,
                avatar: character.avatar,
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
