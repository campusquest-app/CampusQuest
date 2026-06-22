"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ShieldCheck,
  Swords,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { FieldNote, QuadComment, StatKey } from "@/lib/types";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import { deleteQuadPostRequest, updateQuadPostRequest } from "@/lib/client/quadPostsClient";
import { removeRemoteQuadPost, replaceRemoteQuadPost, setCommentsForNote } from "@/lib/feedStore";
import { fetchQuadPostComments } from "@/lib/client/quadCommentsClient";
import { AvatarDisplay } from "./AvatarDisplay";
import { formatStreakBadge } from "@/lib/streakMessaging";
import { CampusQuestNodHeartPop } from "./CampusQuestNodHeartPop";
import { FieldNoteEditModal } from "./FieldNoteEditModal";
import { PostCommentsSheet } from "./posts/PostCommentsSheet";

function ReactionButton({
  active,
  onClick,
  icon: Icon,
  count,
  label,
  title,
  pulseClass,
  fillWhenActive,
  compact,
  disabled,
  pending,
}: {
  active?: boolean;
  onClick: () => void;
  icon: LucideIcon;
  count?: number;
  label: string;
  title?: string;
  pulseClass?: string;
  fillWhenActive?: boolean;
  compact?: boolean;
  disabled?: boolean;
  pending?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={label}
        aria-pressed={active}
        aria-busy={pending}
        disabled={disabled || pending}
        className={`cq-feed-reaction group inline-flex min-w-[2.25rem] items-center justify-center gap-1 rounded-lg px-1 py-1 transition-colors duration-150 active:scale-95 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 ${
          active ? (fillWhenActive ? "text-violet-300" : "text-cyan-400") : "text-white/50 hover:text-white/70"
        } ${pulseClass ?? ""}`}
      >
        <Icon
          className={`h-[19px] w-[19px] transition-colors duration-150 ${
            active && fillWhenActive ? "fill-violet-300/90" : ""
          }`}
          strokeWidth={active ? 2.35 : 2}
        />
        {count != null && count > 0 ? (
          <span className="min-w-[0.65rem] text-[11px] font-semibold tabular-nums leading-none text-white/60">
            {count}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={active}
      aria-busy={pending}
      disabled={disabled || pending}
      className={`cq-feed-reaction group inline-flex min-w-[2.75rem] items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 transition-all duration-200 active:scale-90 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "text-cyan-400" : "text-white/60 hover:text-white/70"
      } ${pulseClass ?? ""}`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
          active
            ? "bg-cyan-500/12 shadow-[0_0_14px_-4px_rgba(56,189,248,0.55)]"
            : "group-hover:bg-cq-elevated/8"
        }`}
      >
        <Icon
          className={`h-[18px] w-[18px] transition-colors duration-200 ${
            active && fillWhenActive ? "fill-cyan-400/85" : ""
          }`}
          strokeWidth={active ? 2.4 : 2}
        />
      </span>
      {count != null && count > 0 ? (
        <span className="min-w-[0.75rem] text-[12px] font-semibold tabular-nums leading-none">{count}</span>
      ) : null}
    </button>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return d.toLocaleDateString();
}

function streakBadge(days: number | undefined): string | null {
  if (days == null || days < 3) return null;
  return formatStreakBadge(days);
}

function FeedCaption({ name, body, tags }: { name: string; body: string; tags: string[] }) {
  const trimmed = body.trim();
  if (!trimmed && tags.length === 0) return null;

  return (
    <p className="break-words text-[13px] leading-[1.45] text-white/88">
      <span className="font-semibold text-white">{name}</span>
      {trimmed ? <span className="whitespace-pre-wrap"> {trimmed}</span> : null}
      {trimmed && tags.length > 0 ? " " : null}
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className="font-medium text-cyan-400/85">
          #{tag}
          {index < tags.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

function FeedLocationChip({ name, onMedia = false }: { name: string; onMedia?: boolean }) {
  return (
    <span className={`cq-feed-location-chip ${onMedia ? "cq-feed-location-chip--on-media" : ""}`}>
      <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Treat common CDN URLs as images even when the path has no file extension. */
function looksLikeImageProofUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("data:image/")) return true;
  if (/\/storage\/v1\/object\/public\/quad-post-images\//i.test(u)) return true;
  // App-hosted proof assets (Quad seed images, etc.)
  if (/^\/[\w./-]+\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(u)) return true;
  if (/\.(jpe?g|png|gif|webp)(\?|#|$|\/)/i.test(u)) return true;
  if (/images\.unsplash\.com\/photo-/i.test(u)) return true;
  if (/upload\.wikimedia\.org\//i.test(u)) return true;
  if (/picsum\.photos\/(?:id\/|seed\/|\d)/i.test(u)) return true;
  return false;
}

export function FieldNoteCard({
  note,
  currentUserId,
  comments = [],
  onNod,
  onHype,
  onVerify,
  onAssist,
  onAddComment,
  currentUser,
  likePending = false,
  highlightStat,
  variant = "default",
  onPostUpdated,
  onPostDeleted,
  onActionMessage,
  onCommentsUpdated,
  onViewAuthor,
  onSharePost,
}: {
  note: FieldNote;
  currentUserId: string;
  comments?: QuadComment[];
  onNod: (noteId: string) => void;
  onHype: (noteId: string) => void;
  onVerify: (noteId: string) => void;
  onAssist: (noteId: string) => void;
  onAddComment?: (noteId: string, body: string) => void | Promise<void>;
  currentUser?: { id: string; name: string; username: string; avatar: string };
  likePending?: boolean;
  /** Called after persisted comments are loaded from the server (e.g. to refresh counts). */
  onCommentsUpdated?: () => void;
  /** Micro celebration on author row when this post's activity matches */
  highlightStat?: StatKey | null;
  /** `feed` = full-width media, border-between-posts (Quad). `default` = padded card row (Profile). */
  variant?: "default" | "feed";
  onPostUpdated?: (note: FieldNote) => void;
  onPostDeleted?: (postId: string) => void;
  onActionMessage?: (message: string) => void;
  onViewAuthor?: (author: { userId: string; username: string; name: string; avatar: string }) => void;
  onSharePost?: (note: FieldNote) => void;
}) {
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false);
  const [showImageNodPop, setShowImageNodPop] = useState(false);
  const [likePulse, setLikePulse] = useState(false);
  const [zapPulse, setZapPulse] = useState(false);
  const [sparkSent, setSparkSent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const lastImageTapAtRef = useRef(0);
  const nodPopTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isOwner = note.authorId === currentUserId && (note.isPersisted ?? isPersistedQuadPostId(note.id));

  useEffect(() => {
    if (!commentsSheetOpen || !isPersistedQuadPostId(note.id)) return undefined;
    let cancelled = false;
    void fetchQuadPostComments(note.id).then((loaded) => {
      if (cancelled) return;
      setCommentsForNote(note.id, loaded);
      onCommentsUpdated?.();
    });
    return () => {
      cancelled = true;
    };
  }, [commentsSheetOpen, note.id, onCommentsUpdated]);
  const hasNodded = note.nodByUserIds.has(currentUserId);
  const hasHyped = note.hypeByUserIds?.has(currentUserId) ?? note.vouchByUserIds.has(currentUserId);
  const hasVerified = note.verifyByUserIds?.has(currentUserId) ?? false;
  const hasAssisted = note.assistByUserIds?.has(currentUserId) ?? false;

  const proofImgUrl = note.proofUrl?.trim();
  const isImgUrl = proofImgUrl && looksLikeImageProofUrl(proofImgUrl);
  const streak = streakBadge(note.authorStreakDays);
  const isFeed = variant === "feed";

  useEffect(() => {
    return () => {
      if (nodPopTimerRef.current != null) {
        window.clearTimeout(nodPopTimerRef.current);
        nodPopTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handlePointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!actionToast) return undefined;
    const tid = window.setTimeout(() => setActionToast(null), 2800);
    return () => window.clearTimeout(tid);
  }, [actionToast]);

  const showToast = useCallback(
    (message: string) => {
      if (onActionMessage) onActionMessage(message);
      else setActionToast(message);
    },
    [onActionMessage],
  );

  async function handleSaveEdit(patch: {
    body: string;
    visibility: "public" | "friends";
    locationId: string | null;
    locationName: string | null;
  }) {
    setEditError(null);
    setActionPending(true);
    try {
      const updated = await updateQuadPostRequest(note.id, patch, currentUserId);
      replaceRemoteQuadPost(updated);
      onPostUpdated?.(updated);
      setEditOpen(false);
      setMenuOpen(false);
      showToast("Post updated");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not update post.");
    } finally {
      setActionPending(false);
    }
  }

  async function handleConfirmDelete() {
    setActionPending(true);
    try {
      await deleteQuadPostRequest(note.id);
      removeRemoteQuadPost(note.id);
      onPostDeleted?.(note.id);
      setDeleteOpen(false);
      setMenuOpen(false);
      showToast("Post deleted");
    } catch {
      setEditError("Could not delete post.");
      setDeleteOpen(false);
    } finally {
      setActionPending(false);
    }
  }

  const ownerMenu = isOwner ? (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-cq-elevated/10 hover:text-white/85"
        aria-label="Post options"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-white/15 bg-cq-elevated py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-white/85 hover:bg-cq-elevated/10"
            onClick={() => {
              setMenuOpen(false);
              setEditError(null);
              setEditOpen(true);
            }}
          >
            Edit Post
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-500/10"
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          >
            Delete Post
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  function triggerImageNodPop() {
    if (nodPopTimerRef.current != null) {
      window.clearTimeout(nodPopTimerRef.current);
      nodPopTimerRef.current = null;
    }
    setShowImageNodPop(false);
    window.setTimeout(() => {
      setShowImageNodPop(true);
      nodPopTimerRef.current = window.setTimeout(() => {
        setShowImageNodPop(false);
        nodPopTimerRef.current = null;
      }, 820);
    }, 0);
  }

  function addNodFromImage() {
    // Double-tap should add a nod, not toggle it off.
    if (!hasNodded) {
      onNod(note.id);
      setLikePulse(true);
      window.setTimeout(() => setLikePulse(false), 380);
    }
    triggerImageNodPop();
  }

  function handleNod() {
    onNod(note.id);
    if (!hasNodded) {
      setLikePulse(true);
      window.setTimeout(() => setLikePulse(false), 380);
    }
  }

  function handleHype() {
    const adding = !hasHyped;
    onHype(note.id);
    if (adding) {
      setZapPulse(true);
      window.setTimeout(() => setZapPulse(false), 420);
      if (note.isPersisted) {
        setSparkSent(true);
        window.setTimeout(() => setSparkSent(false), 1400);
      }
    }
  }

  const handleShare = useCallback(async () => {
    if (onSharePost && (note.isPersisted ?? isPersistedQuadPostId(note.id))) {
      onSharePost(note);
      return;
    }
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = note.body.slice(0, 200);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `${note.authorName} on CampusQuest`,
          text,
          url,
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
    } catch {
      /* user cancelled share */
    }
  }, [note, onSharePost]);

  function handleProofImageTap() {
    const now = Date.now();
    if (now - lastImageTapAtRef.current < 280) {
      addNodFromImage();
      lastImageTapAtRef.current = 0;
      return;
    }
    lastImageTapAtRef.current = now;
  }

  const avatarFrameClass = `cq-avatar-slot flex-shrink-0 border ${
    isFeed
      ? "h-12 w-12 border-white/15 bg-cq-elevated/8"
      : "h-11 w-11 bg-cq-elevated border-white/15"
  } ${
    highlightStat === "strength"
      ? "stat-aura-strength"
      : highlightStat === "knowledge"
        ? "stat-aura-knowledge"
        : ""
  }`;

  function handleViewAuthor() {
    onViewAuthor?.({
      userId: note.authorId,
      username: note.authorUsername,
      name: note.authorName,
      avatar: note.authorAvatar,
    });
  }

  const avatarFrame = onViewAuthor ? (
    <button
      type="button"
      onClick={handleViewAuthor}
      className={`${avatarFrameClass} touch-manipulation transition hover:opacity-90`}
      aria-label={`View ${note.authorName}'s profile`}
    >
      <AvatarDisplay avatar={note.authorAvatar} fitParent size={isFeed ? 48 : 44} />
    </button>
  ) : (
    <div className={avatarFrameClass}>
      <AvatarDisplay avatar={note.authorAvatar} fitParent size={isFeed ? 48 : 44} />
    </div>
  );

  const authorNameEl = onViewAuthor ? (
    <button
      type="button"
      onClick={handleViewAuthor}
      className="text-left text-[14px] font-bold leading-tight tracking-tight text-white transition hover:text-uri-keaney/90"
    >
      {note.authorName}
    </button>
  ) : (
    <span className="text-[14px] font-bold leading-tight tracking-tight text-white">{note.authorName}</span>
  );

  const authorUsernameEl = onViewAuthor ? (
    <button
      type="button"
      onClick={handleViewAuthor}
      className="text-left text-[11px] text-white/48 transition hover:text-white/70"
    >
      @{note.authorUsername}
    </button>
  ) : (
    <span className="text-[11px] text-white/48">@{note.authorUsername}</span>
  );

  const proofBlock =
    proofImgUrl &&
    (isImgUrl ? (
      isFeed ? (
        <button
          type="button"
          onDoubleClick={addNodFromImage}
          onTouchEnd={handleProofImageTap}
          className="group relative block w-full cursor-pointer touch-manipulation"
          aria-label="Double tap image to nod"
        >
          <img
            src={proofImgUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="quad-feed-media-img w-full rounded-none object-cover"
          />
          {showImageNodPop ? (
            <span className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2">
              <CampusQuestNodHeartPop size="lg" />
            </span>
          ) : null}
        </button>
      ) : (
        <img
          src={proofImgUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full max-h-48 object-cover"
        />
      )
    ) : (
      <a
        href={proofImgUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`block text-uri-keaney text-sm truncate bg-cq-elevated/8 ${isFeed ? "px-4 py-3" : "px-3 py-2"}`}
      >
        📎 Proof link
      </a>
    ));

  const hypeCount = note.hypeCount ?? note.vouchCount;
  const actionsRow = (
    <div
      className={
        isFeed
          ? "cq-feed-actions-row flex items-center"
          : "mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-white/15 pt-3"
      }
    >
      <div className={`flex items-center ${isFeed ? "gap-1" : "flex-wrap gap-0.5"}`}>
        <ReactionButton
          active={hasNodded}
          onClick={handleNod}
          icon={Heart}
          count={note.nodCount}
          label={hasNodded ? "Unlike" : "Like"}
          pulseClass={likePulse ? "cq-reaction-heart-pop" : undefined}
          fillWhenActive
          compact={isFeed}
          pending={likePending}
        />
        <ReactionButton
          active={commentsSheetOpen}
          onClick={() => setCommentsSheetOpen(true)}
          icon={MessageCircle}
          count={comments.length}
          label="View comments"
          compact={isFeed}
        />
        <ReactionButton
          onClick={() => void handleShare()}
          icon={Share2}
          label="Share post"
          compact={isFeed}
        />
        <ReactionButton
          active={hasHyped}
          onClick={handleHype}
          icon={Zap}
          count={hypeCount}
          label={hasHyped ? "Unspark" : "Spark"}
          title={hasHyped ? "Remove spark" : "Spark this post"}
          pulseClass={zapPulse ? "cq-reaction-zap-pulse" : undefined}
          fillWhenActive
          compact={isFeed}
        />
        {sparkSent ? (
          <span className="ml-1 text-[10px] font-medium text-violet-300/85" aria-live="polite">
            Spark sent
          </span>
        ) : null}
      </div>
      {!isFeed ? (
        <div className="flex items-center gap-0.5">
          <ReactionButton
            active={hasVerified}
            onClick={() => onVerify(note.id)}
            icon={ShieldCheck}
            count={note.verifyCount ?? 0}
            label={hasVerified ? "Remove verify" : "Verify"}
            title="Verify legit — you +5 XP, author +5 XP"
          />
          <ReactionButton
            active={hasAssisted}
            onClick={() => onAssist(note.id)}
            icon={Swords}
            count={note.assistCount ?? 0}
            label={hasAssisted ? "Remove assist" : "Assist"}
            title="Assist — guild race points + author XP"
          />
        </div>
      ) : null}
    </div>
  );

  const previewComment = comments.length > 0 ? comments[comments.length - 1] : null;

  const feedCommentsSection =
    comments.length > 0 ? (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setCommentsSheetOpen(true)}
          className="text-[13px] font-medium text-white/50 transition hover:text-white/60"
        >
          View all {comments.length} comment{comments.length === 1 ? "" : "s"}
        </button>
        {previewComment ? (
          <button
            type="button"
            onClick={() => setCommentsSheetOpen(true)}
            className="block w-full text-left text-[13px] leading-snug text-white/70"
          >
            <span className="font-semibold text-white">{previewComment.authorName}</span>{" "}
            <span className="line-clamp-2 whitespace-pre-wrap">{previewComment.body}</span>
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <article
      className={
        isFeed
          ? "cq-feed-post quad-feed-post bg-transparent"
          : "p-4 transition-colors hover:bg-cq-elevated/8"
      }
    >
      {actionToast ? (
        <p className="mx-3 mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" aria-live="polite">
          {actionToast}
        </p>
      ) : null}
      {isFeed ? (
        <>
          <header className="cq-feed-post-header flex items-center gap-2.5 px-3 pb-1.5 pt-2.5">
            {avatarFrame}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {authorNameEl}
                {(note.verifyCount ?? 0) >= 2 ? (
                  <span className="text-[10px] font-medium text-emerald-300/75">Verified</span>
                ) : null}
                {streak ? (
                  <span className="text-[10px] font-medium text-uri-gold/85">{streak}</span>
                ) : null}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-white/48">
                {authorUsernameEl}
                <span aria-hidden>·</span>
                <span>{formatTime(note.createdAt)}</span>
              </p>
              {note.locationName && !isImgUrl ? <FeedLocationChip name={note.locationName} /> : null}
            </div>
            {ownerMenu}
          </header>
          {proofImgUrl && isImgUrl ? (
            <div className="quad-feed-media-wrap carousel w-full" data-no-drawer-swipe="true">
              {proofBlock}
              {note.locationName ? <FeedLocationChip name={note.locationName} onMedia /> : null}
            </div>
          ) : proofImgUrl ? (
            <div className="quad-feed-media-wrap carousel w-full" data-no-drawer-swipe="true">{proofBlock}</div>
          ) : null}
          {(note.body.trim() || note.ramMarks.length > 0) && (
            <div className="cq-feed-post-caption px-3">
              <FeedCaption
                name={note.authorName}
                body={note.body}
                tags={note.ramMarks.map((r) => r.tag)}
              />
            </div>
          )}
          <div className="cq-feed-post-engagement px-3">
            {(note.nodCount > 0 || comments.length > 0) && (
              <p className="cq-feed-engagement-summary text-[12px] text-white/50 tabular-nums">
                {note.nodCount > 0 ? (
                  <span>
                    {note.nodCount.toLocaleString()} like{note.nodCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {note.nodCount > 0 && comments.length > 0 ? <span className="mx-1.5 text-white/25">·</span> : null}
                {comments.length > 0 ? (
                  <span>
                    {comments.length.toLocaleString()} comment{comments.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <div className="cq-feed-post-actions post-actions px-3" data-no-drawer-swipe="true">{actionsRow}</div>
          <div className="cq-feed-post-comments px-3 pb-3 pt-0.5">
            {feedCommentsSection}
          </div>
        </>
      ) : (
        <div className="flex gap-3">
          {avatarFrame}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {authorNameEl}
              {onViewAuthor ? authorUsernameEl : (
                <span className="text-uri-keaney/90 text-sm">@{note.authorUsername}</span>
              )}
              <span className="text-white/50 text-xs">· {formatTime(note.createdAt)}</span>
              {note.locationName ? (
                <span className="text-[11px] font-medium text-uri-keaney">📍 {note.locationName}</span>
              ) : null}
              {streak && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-uri-gold/20 text-uri-gold border border-uri-gold/40">
                  {streak}
                </span>
              )}
            </div>
            {ownerMenu}
            </div>
            <p className="text-white/90 mt-1 whitespace-pre-wrap break-words">{note.body}</p>
            {proofImgUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-white/15 max-w-full">{proofBlock}</div>
            )}
            {note.ramMarks.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {note.ramMarks.map((r) => (
                  <span key={r.id} className="ram-mark">
                    #{r.tag}
                  </span>
                ))}
              </div>
            )}
            {actionsRow}
          </div>
        </div>
      )}

      {currentUser ? (
        <PostCommentsSheet
          open={commentsSheetOpen}
          note={note}
          comments={comments}
          currentUser={currentUser}
          onClose={() => setCommentsSheetOpen(false)}
          onAddComment={onAddComment}
          onViewAuthor={onViewAuthor}
        />
      ) : null}

      <FieldNoteEditModal
        key={`${note.id}-${editOpen}`}
        note={note}
        open={editOpen}
        onClose={() => {
          if (!actionPending) setEditOpen(false);
        }}
        onSave={handleSaveEdit}
        saving={actionPending}
        error={editError}
      />

      {deleteOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-post-title">
              <button
                type="button"
                className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
                aria-label="Close"
                onClick={() => {
                  if (!actionPending) setDeleteOpen(false);
                }}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/15 bg-cq-elevated p-5 shadow-2xl">
                <h2 id="delete-post-title" className="font-display text-lg font-bold text-white">
                  Delete this post?
                </h2>
                <p className="mt-2 text-sm text-white/60">This cannot be undone.</p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => setDeleteOpen(false)}
                    className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/70 hover:bg-cq-elevated/8 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => void handleConfirmDelete()}
                    className="flex-1 rounded-xl border border-rose-500/40 bg-rose-600/80 py-2.5 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                  >
                    {actionPending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </article>
  );
}
