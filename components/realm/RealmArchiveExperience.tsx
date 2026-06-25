"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { PostCommentsSheet } from "@/components/posts/PostCommentsSheet";
import { ProfilePostDetail } from "@/components/profile/ProfilePostDetail";
import {
  assistFieldNote,
  getCommentsByNoteId,
  getDisplayCommentCount,
  getNoteForReaction,
  mergeRemoteQuadPostsForMutations,
  removeRemoteQuadPost,
  verifyFieldNote,
} from "@/lib/feedStore";
import { hydrateQuadPostCommentsSafe } from "@/lib/client/quadCommentsHydration";
import { fetchQuadPostById } from "@/lib/client/quadPostsClient";
import { toggleQuadLike, toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { submitQuadComment } from "@/lib/client/quadCommentActions";
import { avatarPayloadForDisplay, getMomentCaption } from "@/lib/realm/momentDisplay";
import type { RealmLocation, RealmMoment } from "@/lib/realm/locations";
import type { FieldNote } from "@/lib/types";
import type { SharePostTarget } from "@/lib/client/dmMessagesClient";
import { buildShareTargetFromFieldNote, buildShareTargetFromRealmMoment } from "@/lib/client/dmMessagesClient";

const SWIPE_COMMIT_PX = 72;
const SWIPE_MAX_DRAG_PX = 140;
const TRANSITION_MS = 280;

type Viewer = { id: string; name: string; username: string; avatar: string };
type SwipeDir = "next" | "prev";

export function RealmArchiveExperience({
  location,
  moments,
  loaded,
  viewer,
  onCreatePost,
  onViewProfile,
  onSharePost,
}: {
  location: RealmLocation;
  moments: RealmMoment[];
  loaded: boolean;
  viewer: Viewer | null;
  onCreatePost?: () => void;
  onViewProfile?: (userId: string) => void;
  onSharePost?: (target: SharePostTarget) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [exitDir, setExitDir] = useState<SwipeDir | null>(null);
  const [entering, setEntering] = useState(false);
  const [detailNote, setDetailNote] = useState<FieldNote | null>(null);
  const [commentsNote, setCommentsNote] = useState<FieldNote | null>(null);
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(() => new Set());
  const [, setHydratedPostId] = useState<string | null>(null);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIndex(0);
    setDragX(0);
    setDragY(0);
    setEntering(false);
    setExitDir(null);
    setMenuOpen(false);
  }, [location.id, moments.length]);

  useEffect(() => {
    if (!loaded || moments.length === 0) return undefined;
    setEntering(true);
    const tid = window.setTimeout(() => setEntering(false), TRANSITION_MS);
    return () => window.clearTimeout(tid);
  }, [loaded, moments.length, location.id]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDocClick);
    return () => document.removeEventListener("pointerdown", onDocClick);
  }, [menuOpen]);

  const count = moments.length;
  const active = moments[index] ?? null;
  const prevMoment = count > 1 && index > 0 ? moments[index - 1] : null;
  const nextMoment = count > 1 && index < count - 1 ? moments[index + 1] : null;
  const showCarousel = count > 1;

  const ensurePostHydrated = useCallback(
    async (moment: RealmMoment): Promise<FieldNote | null> => {
      if (!viewer) return null;
      const cached = getNoteForReaction(moment.postId);
      if (cached) return cached;
      const note = await fetchQuadPostById(moment.postId, viewer.id);
      if (!note) return null;
      mergeRemoteQuadPostsForMutations([note]);
      setHydratedPostId(note.id);
      return note;
    },
    [viewer],
  );

  useEffect(() => {
    if (!viewer || !active?.postId) return;
    void ensurePostHydrated(active);
  }, [active?.postId, viewer, ensurePostHydrated]);

  useEffect(() => {
    if (!commentsNote) return undefined;
    let cancelled = false;
    void hydrateQuadPostCommentsSafe(commentsNote.id, "realm-archive-comments").then((ok) => {
      if (!cancelled && ok) setCommentsRefresh((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [commentsNote?.id]);

  void commentsRefresh;

  const commitSwipe = useCallback(
    (dir: SwipeDir) => {
      if (animating || count <= 1) return;
      if (dir === "next" && index >= count - 1) return;
      if (dir === "prev" && index <= 0) return;

      if (reduceMotion) {
        setIndex((i) => (dir === "next" ? Math.min(count - 1, i + 1) : Math.max(0, i - 1)));
        setDragX(0);
        setDragY(0);
        dragXRef.current = 0;
        return;
      }

      setAnimating(true);
      setExitDir(dir);
      setDragX(0);
      setDragY(0);
      dragXRef.current = 0;

      window.setTimeout(() => {
        setIndex((i) => (dir === "next" ? Math.min(count - 1, i + 1) : Math.max(0, i - 1)));
        setExitDir(null);
        setEntering(true);
        window.setTimeout(() => {
          setEntering(false);
          setAnimating(false);
        }, TRANSITION_MS);
      }, TRANSITION_MS);
    },
    [animating, count, index, reduceMotion],
  );

  const goNext = useCallback(() => commitSwipe("next"), [commitSwipe]);
  const goPrev = useCallback(() => commitSwipe("prev"), [commitSwipe]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (animating || !active) return;
    setIsDragging(true);
    pointerIdRef.current = e.pointerId;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || pointerIdRef.current !== e.pointerId) return;
    const deltaX = e.clientX - dragStartX.current;
    const deltaY = e.clientY - dragStartY.current;
    if (Math.abs(deltaX) > 6) e.preventDefault();
    const atStart = index <= 0 && deltaX > 0;
    const atEnd = index >= count - 1 && deltaX < 0;
    const clampedX =
      atStart || atEnd
        ? deltaX * 0.22
        : Math.max(-SWIPE_MAX_DRAG_PX, Math.min(SWIPE_MAX_DRAG_PX, deltaX));
    const clampedY = Math.max(-28, Math.min(28, deltaY * 0.3));
    setDragX(clampedX);
    setDragY(clampedY);
    dragXRef.current = clampedX;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || pointerIdRef.current !== e.pointerId) return;
    setIsDragging(false);
    pointerIdRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const delta = dragXRef.current;
    if (count > 1 && delta <= -SWIPE_COMMIT_PX) {
      commitSwipe("next");
      return;
    }
    if (count > 1 && delta >= SWIPE_COMMIT_PX) {
      commitSwipe("prev");
      return;
    }
    setDragX(0);
    setDragY(0);
    dragXRef.current = 0;
  }

  async function openDetail(moment: RealmMoment) {
    if (!viewer || detailLoading) return;
    setMenuOpen(false);
    setDetailLoading(true);
    try {
      const note = await ensurePostHydrated(moment);
      if (!note) return;
      setDetailNote(note);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openComments(moment: RealmMoment) {
    if (!viewer || detailLoading) return;
    setMenuOpen(false);
    setDetailLoading(true);
    try {
      const note = await ensurePostHydrated(moment);
      if (!note) return;
      setCommentsNote(note);
    } finally {
      setDetailLoading(false);
    }
  }

  function handleShareMemory() {
    if (!active || !onSharePost) return;
    const target = buildShareTargetFromRealmMoment(active, location.name);
    if (target) onSharePost(target);
  }

  function syncOpenNotes() {
    if (detailNote) {
      setDetailNote((prev) => (prev ? { ...prev } : prev));
      setHydratedPostId(detailNote.id);
    }
    if (commentsNote) {
      setCommentsNote((prev) => (prev ? { ...prev } : prev));
      setHydratedPostId(commentsNote.id);
    }
  }

  function handleNod(noteId: string) {
    if (!viewer || pendingReactions.has(noteId)) return;
    setPendingReactions((prev) => new Set(prev).add(noteId));
    void toggleQuadLike({
      noteId,
      userId: viewer.id,
      onOptimistic: () => setHydratedPostId(noteId),
    }).finally(() => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      setHydratedPostId(noteId);
    });
  }

  function handleHype(noteId: string) {
    if (!viewer || pendingReactions.has(noteId)) return;
    setPendingReactions((prev) => new Set(prev).add(noteId));
    void toggleQuadSpark({
      noteId,
      userId: viewer.id,
      onOptimistic: () => setHydratedPostId(noteId),
    }).finally(() => {
      setPendingReactions((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      setHydratedPostId(noteId);
    });
  }

  function handleVerify(noteId: string) {
    if (!viewer) return;
    verifyFieldNote(noteId, viewer.id);
    syncOpenNotes();
  }

  function handleAssist(noteId: string) {
    if (!viewer) return;
    assistFieldNote(noteId, viewer.id);
    syncOpenNotes();
  }

  function handleAddComment(noteId: string, body: string, parentCommentId?: string | null) {
    if (!viewer) return Promise.resolve({ ok: false as const, message: "Please sign in to comment on posts." });
    return submitQuadComment({
      noteId,
      parentCommentId,
      author: {
        authorId: viewer.id,
        authorName: viewer.name,
        authorUsername: viewer.username,
        authorAvatar: viewer.avatar,
        body,
      },
      onOptimistic: () => {
        syncOpenNotes();
        setCommentsRefresh((n) => n + 1);
      },
    });
  }

  async function handleQuickLike() {
    if (!active || !viewer) return;
    const note = await ensurePostHydrated(active);
    if (!note) return;
    handleNod(active.postId);
  }

  const activeNote = active ? getNoteForReaction(active.postId) : null;
  const hasLiked = Boolean(viewer && activeNote?.nodByUserIds.has(viewer.id));
  const likeCount = activeNote?.nodCount ?? active?.likeCount ?? 0;
  const commentCount = activeNote
    ? getDisplayCommentCount(active.postId, activeNote)
    : active?.commentCount ?? 0;

  const rotateY = reduceMotion ? 0 : dragX * 0.16;
  const rotateX = reduceMotion ? 0 : -dragY * 0.12;
  const liftZ = reduceMotion ? 0 : Math.min(28, Math.abs(dragX) * 0.14);

  const useInlineTransform = (isDragging || dragX !== 0 || dragY !== 0) && !exitDir && !entering;
  const cardTransform = useInlineTransform
    ? `translate3d(${dragX}px, ${dragY * 0.12}px, ${liftZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
    : undefined;

  const cardClass = [
    "cq-realm-archive-card",
    "cq-realm-archive-card--active",
    exitDir === "next" ? "cq-realm-archive-card--exit-next" : "",
    exitDir === "prev" ? "cq-realm-archive-card--exit-prev" : "",
    entering ? "cq-realm-archive-card--enter" : "",
    isDragging ? "cq-realm-archive-card--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="cq-realm-archive">
      <div className="cq-realm-archive-main">
        {!loaded ? (
          <div className="cq-realm-archive-empty cq-realm-archive-empty--centered">
            <p className="text-sm text-white/55">Loading memories…</p>
          </div>
        ) : count === 0 ? (
          <div className="cq-realm-archive-empty cq-realm-archive-empty--centered">
            <p className="font-display text-base font-semibold text-white/90">No posts here yet.</p>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              Be the first to capture a campus moment at this location.
            </p>
            {onCreatePost ? (
              <button type="button" onClick={onCreatePost} className="cq-realm-archive-create-btn mt-5">
                Create Post
              </button>
            ) : null}
          </div>
        ) : (
          <div className="cq-realm-archive-stage" data-cq-gesture-block="swipe-tab">
            <div className="cq-realm-archive-aura" aria-hidden />

            <div className="cq-realm-archive-carousel carousel" data-no-drawer-swipe="true">
              <div
                className="cq-realm-archive-stack"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {prevMoment ? <PeekCard moment={prevMoment} side="prev" /> : null}
                {nextMoment ? <PeekCard moment={nextMoment} side="next" /> : null}
                {showCarousel ? <div className="cq-realm-archive-stack-glow" aria-hidden /> : null}

                {active ? (
                  <div
                    className={cardClass}
                    style={cardTransform ? { transform: cardTransform } : undefined}
                  >
                    <ArchiveCardFace
                      moment={active}
                      locationName={location.name}
                      likeCount={likeCount}
                      commentCount={commentCount}
                      onViewProfile={onViewProfile}
                    />
                  </div>
                ) : null}
              </div>

              {showCarousel ? (
                <div className="cq-realm-archive-nav">
                  <button
                    type="button"
                    disabled={index <= 0 || animating}
                    onClick={goPrev}
                    className="cq-realm-archive-nav-btn cq-realm-archive-nav-btn--subtle"
                    aria-label="Previous memory"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex items-center justify-center gap-1.5">
                    {moments.map((m, i) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-label={`Memory ${i + 1}`}
                        aria-current={i === index ? "true" : undefined}
                        disabled={animating}
                        onClick={() => {
                          if (i === index || animating) return;
                          setEntering(true);
                          setIndex(i);
                          window.setTimeout(() => setEntering(false), TRANSITION_MS);
                        }}
                        className={`cq-realm-archive-dot ${i === index ? "cq-realm-archive-dot--active" : ""}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={index >= count - 1 || animating}
                    onClick={goNext}
                    className="cq-realm-archive-nav-btn cq-realm-archive-nav-btn--subtle"
                    aria-label="Next memory"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {active && count > 0 && loaded ? (
        <footer className="cq-realm-archive-actions">
          <button
            type="button"
            onClick={() => void handleQuickLike()}
            disabled={!viewer || pendingReactions.has(active.postId)}
            className={`cq-realm-archive-icon-btn ${hasLiked ? "cq-realm-archive-icon-btn--active" : ""}`}
            aria-label={`Like, ${likeCount}`}
          >
            <Heart className={`h-[18px] w-[18px] ${hasLiked ? "fill-current" : ""}`} />
            <span className="sr-only">{likeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => void openComments(active)}
            disabled={detailLoading || !viewer}
            className="cq-realm-archive-icon-btn"
            aria-label={`Comment, ${commentCount}`}
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            <span className="sr-only">{commentCount}</span>
          </button>
          <button
            type="button"
            onClick={handleShareMemory}
            disabled={!viewer || !onSharePost}
            className="cq-realm-archive-icon-btn"
            aria-label="Share memory"
          >
            <Share2 className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => void openDetail(active)}
            disabled={detailLoading || !viewer}
            className="cq-realm-archive-primary-btn"
          >
            View Full Post
          </button>
          <div ref={menuRef} className="cq-realm-archive-menu">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={detailLoading || !viewer}
              className="cq-realm-archive-icon-btn"
              aria-label="More options"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" />
            </button>
            {menuOpen ? (
              <div className="cq-realm-archive-menu-panel" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="cq-realm-archive-menu-item"
                  onClick={() => void openDetail(active)}
                >
                  <Flag className="h-3.5 w-3.5" aria-hidden />
                  Report
                </button>
              </div>
            ) : null}
          </div>
        </footer>
      ) : null}

      {commentsNote && viewer ? (
        <PostCommentsSheet
          open={Boolean(commentsNote)}
          note={commentsNote}
          comments={getCommentsByNoteId(commentsNote.id)}
          currentUser={viewer}
          onClose={() => setCommentsNote(null)}
          onAddComment={handleAddComment}
          onViewAuthor={
            onViewProfile
              ? (author) => {
                  setCommentsNote(null);
                  onViewProfile(author.userId);
                }
              : undefined
          }
        />
      ) : null}

      {detailNote && viewer ? (
        <ProfilePostDetail
          note={detailNote}
          currentUserId={viewer.id}
          currentUser={viewer}
          likePending={pendingReactions.has(detailNote.id)}
          onClose={() => setDetailNote(null)}
          onNod={handleNod}
          onHype={handleHype}
          onVerify={handleVerify}
          onAssist={handleAssist}
          onAddComment={handleAddComment}
          onPostUpdated={(note) => setDetailNote(note)}
          onPostDeleted={(postId) => {
            removeRemoteQuadPost(postId);
            setDetailNote(null);
          }}
          onViewAuthor={
            onViewProfile
              ? (author) => {
                  setDetailNote(null);
                  onViewProfile(author.userId);
                }
              : undefined
          }
          onSharePost={
            onSharePost
              ? (note) => {
                  const target = buildShareTargetFromFieldNote(note, "memory");
                  if (target) onSharePost(target);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function PeekCard({ moment, side }: { moment: RealmMoment; side: "prev" | "next" }) {
  const imageUrl = typeof moment.imageUrl === "string" ? moment.imageUrl.trim() : "";
  if (!imageUrl) return null;

  return (
    <div className={`cq-realm-archive-peek cq-realm-archive-peek--${side}`} aria-hidden>
      <div className="cq-realm-archive-peek-surface">
        <img src={imageUrl} alt="" className="cq-realm-archive-peek-img" loading="lazy" />
      </div>
    </div>
  );
}

function ArchiveCardFace({
  moment,
  locationName,
  likeCount,
  commentCount,
  onViewProfile,
}: {
  moment: RealmMoment;
  locationName: string;
  likeCount: number;
  commentCount: number;
  onViewProfile?: (userId: string) => void;
}) {
  const caption = getMomentCaption(moment);
  const imageUrl = typeof moment.imageUrl === "string" ? moment.imageUrl.trim() : "";

  function handleViewProfile() {
    if (moment.authorUserId) onViewProfile?.(moment.authorUserId);
  }

  const avatarEl = onViewProfile && moment.authorUserId ? (
    <button
      type="button"
      onClick={handleViewProfile}
      className="cq-realm-archive-avatar touch-manipulation transition hover:opacity-90"
      aria-label={`View ${moment.displayName}'s profile`}
    >
      <AvatarDisplay avatar={avatarPayloadForDisplay(moment.authorAvatar)} fitParent size={32} showProp={false} />
    </button>
  ) : (
    <span className="cq-realm-archive-avatar">
      <AvatarDisplay avatar={avatarPayloadForDisplay(moment.authorAvatar)} fitParent size={32} showProp={false} />
    </span>
  );

  const displayNameEl = onViewProfile && moment.authorUserId ? (
    <button
      type="button"
      onClick={handleViewProfile}
      className="truncate text-left text-[13px] font-semibold text-white transition hover:text-uri-keaney/90"
    >
      {moment.displayName}
    </button>
  ) : (
    <p className="truncate text-[13px] font-semibold text-white">{moment.displayName}</p>
  );

  const usernameEl = onViewProfile && moment.authorUserId ? (
    <button
      type="button"
      onClick={handleViewProfile}
      className="truncate text-left text-[11px] text-white/50 transition hover:text-white/70"
    >
      @{moment.username}
    </button>
  ) : (
    <p className="truncate text-[11px] text-white/50">@{moment.username}</p>
  );

  return (
    <div className="cq-realm-archive-card-shell">
      <div className="cq-realm-archive-card-glow" aria-hidden />
      <div className="cq-realm-archive-card-inner">
        {imageUrl ? (
          <div className="cq-realm-archive-card-media">
            <img src={imageUrl} alt="" className="cq-realm-archive-card-img" loading="lazy" />
            <div className="cq-realm-archive-card-media-overlay" />
            <span className="cq-realm-archive-card-location-badge">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{locationName}</span>
            </span>
            <span className="cq-realm-archive-card-date">{moment.postedAgoLabel}</span>
          </div>
        ) : (
          <div className="cq-realm-archive-card-media cq-realm-archive-card-media--text">
            <span className="cq-realm-archive-card-location-badge">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{locationName}</span>
            </span>
            <p className="line-clamp-5 px-4 text-center text-sm leading-relaxed text-white/85">{caption}</p>
            <span className="cq-realm-archive-card-date">{moment.postedAgoLabel}</span>
          </div>
        )}

        <div className="cq-realm-archive-card-foot">
          <div className="flex items-center gap-2.5">
            {avatarEl}
            <div className="min-w-0 flex-1">
              {displayNameEl}
              {usernameEl}
            </div>
            <div className="flex shrink-0 items-center gap-2.5 text-[11px] font-medium text-white/55">
              <span className="inline-flex items-center gap-0.5">
                <Heart className="h-3 w-3 text-rose-300/75" aria-hidden />
                {likeCount}
              </span>
              <span className="inline-flex items-center gap-0.5">
                <MessageCircle className="h-3 w-3 text-cyan-200/65" aria-hidden />
                {commentCount}
              </span>
            </div>
          </div>
          {imageUrl && caption ? (
            <p className="line-clamp-2 text-[13px] leading-snug text-white/75">{caption}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
