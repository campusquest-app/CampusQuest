"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
  ShieldCheck,
  Swords,
  type LucideIcon,
} from "lucide-react";
import type { FieldNote, QuadComment, StatKey } from "@/lib/types";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import { deleteQuadPostRequest, updateQuadPostRequest } from "@/lib/client/quadPostsClient";
import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import { getDisplayCommentCount, removeRemoteQuadPost, replaceRemoteQuadPost } from "@/lib/feedStore";
import { hydrateQuadPostCommentsSafe } from "@/lib/client/quadCommentsHydration";
import type { QuadCommentActionResult } from "@/lib/client/quadCommentActions";
import { toggleQuadCommentLike } from "@/lib/client/quadCommentActions";
import { AvatarDisplay } from "./AvatarDisplay";
import { formatStreakBadge } from "@/lib/streakMessaging";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { CampusQuestNodHeartPop } from "./CampusQuestNodHeartPop";
import { FieldNoteEditModal } from "./FieldNoteEditModal";
import { PostCommentsSheet } from "./posts/PostCommentsSheet";
import { LikedByRow } from "./posts/LikedByRow";
import { PostLikersSheet } from "./posts/PostLikersSheet";
import { ReportPostSheet } from "./posts/ReportPostSheet";
import { CqModalLayer } from "./ui/CqModalLayer";
import { CaptionWithMentions } from "./quad/CaptionWithMentions";
import { TaggedWithLine } from "./quad/TaggedWithLine";
import { FeedPhotoTags } from "./quad/FeedPhotoTags";
import { TagPickerSheet } from "./quad/TagPickerSheet";
import { QuadVideoPlayer } from "./quad/QuadVideoPlayer";
import { QuadMediaCarousel } from "./quad/QuadMediaCarousel";
import { filterRenderableCarouselMedia } from "@/lib/quadMedia";
import { ZoomableImage } from "./quad/ZoomableImage";
import type { CaptionMentionDraft, ComposerTagSelection } from "@/lib/postTags";
import { looksLikeVideoUrl } from "@/lib/quadVideo";
import { formatFeedExactTime, formatFeedRelativeTime } from "@/lib/client/feedRelativeTime";
import { EmberReactionButton } from "@/components/embers/EmberReactionButton";
import { EmberExplainerSheet } from "@/components/embers/EmberExplainerSheet";
import {
  getEmberAllowance,
  hasSeenEmberExplainer,
  markEmberExplainerSeen,
  subscribeEmberAllowance,
} from "@/lib/client/emberAllowance";
import { subscribeEmberCast } from "@/lib/client/emberCastEvents";
import { shouldIgnoreLikersOpen } from "@/lib/client/emberTapGuard";
import { showAppToast } from "@/lib/client/appToast";
import { EMBER_COPY } from "@/lib/embers";

function ReactionButton({
  active,
  onClick,
  onCountClick,
  countClickLabel,
  icon: Icon,
  count,
  label,
  title,
  pulseClass,
  fillWhenActive,
  compact,
  hideCount,
  disabled,
  pending,
}: {
  active?: boolean;
  onClick: () => void;
  onCountClick?: () => void;
  countClickLabel?: string;
  icon: LucideIcon;
  count?: number;
  label: string;
  title?: string;
  pulseClass?: string;
  fillWhenActive?: boolean;
  compact?: boolean;
  hideCount?: boolean;
  disabled?: boolean;
  pending?: boolean;
}) {
  const countNode =
    !hideCount && count != null && count > 0 ? (
      onCountClick ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCountClick();
          }}
          className="min-h-[44px] min-w-[1.75rem] px-1 text-[12px] font-semibold tabular-nums leading-none text-white/65 touch-manipulation"
          aria-label={countClickLabel ?? `${count} likes`}
        >
          {count}
        </button>
      ) : (
        <span className="min-w-[0.65rem] text-[12px] font-semibold tabular-nums leading-none text-white/65">
          {count}
        </span>
      )
    ) : null;

  if (compact) {
    const iconButton = (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={label}
        aria-pressed={active}
        aria-busy={pending}
        disabled={disabled || pending}
        className={`cq-feed-reaction group inline-flex min-h-[44px] min-w-[2.5rem] items-center justify-center gap-0.5 rounded-lg px-1.5 py-2 transition-colors duration-150 active:scale-95 touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 ${
          active ? (fillWhenActive ? "text-[#ff3040]" : "text-uri-keaney") : "text-white/90 hover:text-white"
        } ${pulseClass ?? ""}`}
      >
        <Icon
          className={`h-[24px] w-[24px] transition-colors duration-150 ${
            active && fillWhenActive ? "fill-[#ff3040]" : ""
          }`}
          strokeWidth={active ? 2.45 : 2}
        />
        {onCountClick ? null : countNode}
      </button>
    );
    if (onCountClick) {
      return (
        <div className="cq-feed-like-pair">
          {iconButton}
          {countNode}
        </div>
      );
    }
    return iconButton;
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
  if (!FEATURE_FLAGS.progression) return null;
  if (days == null || days < 3) return null;
  return formatStreakBadge(days);
}

function FeedCaption({
  body,
  tags,
  mentions,
  username,
  onUsernameClick,
}: {
  body: string;
  tags: string[];
  mentions?: CaptionMentionDraft[] | null;
  username?: string;
  onUsernameClick?: () => void;
}) {
  const trimmed = body.trim();
  const bodyRef = useRef<HTMLSpanElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [trimmed]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [trimmed, expanded, tags]);

  if (!trimmed && tags.length === 0 && !username) return null;

  const usernameEl = username ? (
    onUsernameClick ? (
      <button
        type="button"
        onClick={onUsernameClick}
        className="mr-1 font-semibold text-white transition hover:text-uri-keaney/90"
      >
        {username}
      </button>
    ) : (
      <span className="mr-1 font-semibold text-white">{username}</span>
    )
  ) : null;

  return (
    <p className="break-words text-[13px] leading-[1.4] text-white/90">
      {usernameEl}
      {trimmed ? (
        <span
          ref={bodyRef}
          className={expanded ? "whitespace-pre-wrap" : "cq-feed-caption-clamp"}
        >
          <CaptionWithMentions body={body} mentions={mentions} />
          {tags.map((tag, index) => (
            <span key={`${tag}-${index}`} className="font-medium text-uri-keaney/90">
              {index === 0 ? " " : ""}#{tag}
              {index < tags.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      ) : (
        tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="font-medium text-uri-keaney/90">
            #{tag}
            {index < tags.length - 1 ? " " : ""}
          </span>
        ))
      )}
      {canExpand ? (
        <button
          type="button"
          className="cq-feed-caption-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
    </p>
  );
}

function TextPostCopy({
  body,
  tags,
  mentions,
}: {
  body: string;
  tags: string[];
  mentions?: CaptionMentionDraft[] | null;
}) {
  const trimmed = body.trim();
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [trimmed]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    const measure = () => setCanExpand(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [trimmed, expanded, tags]);

  if (!trimmed && tags.length === 0) return null;

  return (
    <div className="cq-feed-text-copy">
      <p ref={trimmed ? bodyRef : undefined} className={trimmed && !expanded ? "cq-feed-text-clamp" : undefined}>
        {trimmed ? <CaptionWithMentions body={body} mentions={mentions} /> : null}
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="font-medium text-uri-keaney/90">
            {trimmed || index > 0 ? " " : ""}#{tag}
          </span>
        ))}
      </p>
      {canExpand ? (
        <button
          type="button"
          className="cq-feed-text-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

/** Treat common CDN URLs as images even when the path has no file extension. */
function looksLikeImageProofUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (looksLikeVideoUrl(u)) return false;
  if (u.startsWith("data:image/")) return true;
  if (/\/storage\/v1\/object\/public\/quad-post-images\/.+\.(jpe?g|png|gif|webp)/i.test(u)) return true;
  if (/\/storage\/v1\/object\/public\/quad-post-images\//i.test(u) && !/\/quad-media\//i.test(u)) return true;
  // App-hosted proof assets (Quad seed images, etc.)
  if (/^\/[\w./-]+\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(u)) return true;
  if (/\.(jpe?g|png|gif|webp)(\?|#|$|\/)/i.test(u)) return true;
  if (/images\.unsplash\.com\/photo-/i.test(u)) return true;
  if (/upload\.wikimedia\.org\//i.test(u)) return true;
  if (/picsum\.photos\/(?:id\/|seed\/|\d)/i.test(u)) return true;
  return false;
}

type FieldNoteCardProps = {
  note: FieldNote;
  currentUserId: string;
  comments?: QuadComment[];
  onNod: (noteId: string) => void;
  onHype: (noteId: string) => void;
  onVerify: (noteId: string) => void;
  onAssist: (noteId: string) => void;
  onAddComment?: (
    noteId: string,
    body: string,
    parentCommentId?: string | null,
  ) => void | Promise<void | QuadCommentActionResult>;
  currentUser?: { id: string; name: string; username: string; avatar: string };
  likePending?: boolean;
  /** Independent of likes so Ember taps are never blocked by a nod in-flight. */
  emberPending?: boolean;
  onCommentsUpdated?: () => void;
  highlightStat?: StatKey | null;
  variant?: "default" | "feed";
  onPostUpdated?: (note: FieldNote) => void;
  onPostDeleted?: (postId: string) => void;
  /** When set, allows edit/delete for an organization representative who did not create the post. */
  canManagePost?: boolean;
  onActionMessage?: (message: string) => void;
  onViewAuthor?: (author: {
    userId: string;
    username: string;
    name: string;
    avatar: string;
    organizationId?: string;
  }) => void;
  onSharePost?: (note: FieldNote) => void;
  canModeratePosts?: boolean;
  onViewEvent?: (eventId: string) => void;
  onViewOnMap?: (locationId: string) => void;
  /** Eager-load first visible feed post media (LCP). */
  priorityMedia?: boolean;
};

function userHasNodded(note: FieldNote, userId: string): boolean {
  return note.nodByUserIds.has(userId);
}

function userHasEmbered(note: FieldNote, userId: string): boolean {
  return note.hypeByUserIds?.has(userId) ?? note.vouchByUserIds.has(userId);
}

function fieldNoteCardPropsAreEqual(prev: FieldNoteCardProps, next: FieldNoteCardProps): boolean {
  if (prev.note.id !== next.note.id) return false;
  if (prev.likePending !== next.likePending) return false;
  if (prev.emberPending !== next.emberPending) return false;
  if (prev.variant !== next.variant) return false;
  if (prev.canModeratePosts !== next.canModeratePosts) return false;
  if (prev.currentUserId !== next.currentUserId) return false;
  if (prev.highlightStat !== next.highlightStat) return false;
  if (prev.priorityMedia !== next.priorityMedia) return false;
  if ((prev.comments?.length ?? 0) !== (next.comments?.length ?? 0)) return false;

  const pn = prev.note;
  const nn = next.note;
  if (pn.nodCount !== nn.nodCount) return false;
  if ((pn.hypeCount ?? pn.vouchCount ?? 0) !== (nn.hypeCount ?? nn.vouchCount ?? 0)) return false;
  if ((pn.verifyCount ?? 0) !== (nn.verifyCount ?? 0)) return false;
  if ((pn.assistCount ?? 0) !== (nn.assistCount ?? 0)) return false;
  if (getDisplayCommentCount(pn.id, pn) !== getDisplayCommentCount(nn.id, nn)) return false;
  if (pn.body !== nn.body) return false;
  if (pn.proofUrl !== nn.proofUrl) return false;
  if ((pn.tags?.length ?? 0) !== (nn.tags?.length ?? 0)) return false;
  if ((pn.mentions?.length ?? 0) !== (nn.mentions?.length ?? 0)) return false;
  if (pn.authorName !== nn.authorName) return false;
  if (pn.authorUsername !== nn.authorUsername) return false;
  if (pn.authorVerifiedBadge !== nn.authorVerifiedBadge) return false;
  if (pn.authorAvatar !== nn.authorAvatar) return false;
  if (pn.locationName !== nn.locationName) return false;
  // Compare nod and Ember membership separately. Bundling them hid Ember
  // activation after a post was already liked (private Ember totals don't change).
  if (userHasNodded(pn, prev.currentUserId) !== userHasNodded(nn, next.currentUserId)) return false;
  if (userHasEmbered(pn, prev.currentUserId) !== userHasEmbered(nn, next.currentUserId)) return false;
  const prevPreview = pn.likedByPreview ?? [];
  const nextPreview = nn.likedByPreview ?? [];
  if (prevPreview.length !== nextPreview.length) return false;
  for (let i = 0; i < prevPreview.length; i += 1) {
    if (prevPreview[i]?.userId !== nextPreview[i]?.userId) return false;
  }

  return true;
}

function FieldNoteCardInner({
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
  emberPending = false,
  highlightStat,
  variant = "default",
  onPostUpdated,
  onPostDeleted,
  canManagePost,
  onActionMessage,
  onCommentsUpdated,
  onViewAuthor,
  onSharePost,
  canModeratePosts = false,
  onViewEvent,
  onViewOnMap,
  priorityMedia = false,
}: FieldNoteCardProps) {
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false);
  const [likersSheetOpen, setLikersSheetOpen] = useState(false);
  const [showImageNodPop, setShowImageNodPop] = useState(false);
  const [likePulse, setLikePulse] = useState(false);
  const [emberPulse, setEmberPulse] = useState(false);
  const [emberExplainerOpen, setEmberExplainerOpen] = useState(false);
  const pendingEmberActionRef = useRef(false);
  const emberAnchorRef = useRef<HTMLSpanElement | null>(null);
  const emberPulseTimerRef = useRef<number | null>(null);
  const emberAllowance = useSyncExternalStore(subscribeEmberAllowance, getEmberAllowance, getEmberAllowance);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockAnonymousOpen, setBlockAnonymousOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showPhotoTags, setShowPhotoTags] = useState(false);
  const [addTagsOpen, setAddTagsOpen] = useState(false);
  const [editTagSelections, setEditTagSelections] = useState<ComposerTagSelection[]>([]);
  const [localPhotoTagPos, setLocalPhotoTagPos] = useState<Record<string, { x: number; y: number }>>({});
  const lastImageTapAtRef = useRef(0);
  const nodPopTimerRef = useRef<number | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement | null>(null);
  const menuDropdownRef = useRef<HTMLDivElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const isPersistedPost = note.isPersisted ?? isPersistedQuadPostId(note.id);
  const isAnonymousPost = note.isAnonymous === true;
  const isOwner =
    (canManagePost ?? (isAnonymousPost ? note.viewerIsAuthor === true : note.authorId === currentUserId)) &&
    isPersistedPost;
  const canModerateDelete = canModeratePosts && isPersistedPost && note.authorId !== currentUserId;
  const canReportPost = isPersistedPost && !isOwner;
  const showPostMenu = isOwner || canModerateDelete || canReportPost;

  const hasNodded = note.nodByUserIds.has(currentUserId);
  const hasHyped = note.hypeByUserIds?.has(currentUserId) ?? note.vouchByUserIds.has(currentUserId);
  const hasVerified = note.verifyByUserIds?.has(currentUserId) ?? false;
  const hasAssisted = note.assistByUserIds?.has(currentUserId) ?? false;

  const proofImgUrl = note.proofUrl?.trim();
  const carouselMediaRaw = note.media && note.media.length > 0 ? note.media : null;
  const carouselMedia = carouselMediaRaw ? filterRenderableCarouselMedia(carouselMediaRaw) : null;
  const usableCarousel = carouselMedia && carouselMedia.length > 0 ? carouselMedia : null;
  const isCarousel = Boolean(usableCarousel && usableCarousel.length > 1);
  const isVideo =
    !isCarousel &&
    (note.mediaType === "video" ||
      Boolean(proofImgUrl && looksLikeVideoUrl(proofImgUrl)) ||
      usableCarousel?.[0]?.mediaType === "video");
  const isImgUrl =
    !isVideo &&
    !isCarousel &&
    Boolean(
      (proofImgUrl && looksLikeImageProofUrl(proofImgUrl)) || usableCarousel?.[0]?.mediaType === "image",
    );
  const streak = streakBadge(note.authorStreakDays);
  const isFeed = variant === "feed";
  const isMediaFeedPost = Boolean(usableCarousel || isVideo || isImgUrl);

  useEffect(() => {
    return () => {
      if (nodPopTimerRef.current != null) {
        window.clearTimeout(nodPopTimerRef.current);
        nodPopTimerRef.current = null;
      }
    };
  }, []);

  const syncMenuAnchor = useCallback(() => {
    const el = menuAnchorRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    setMenuAnchor({
      top: rect.bottom,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuAnchor(null);
      return;
    }
    syncMenuAnchor();
  }, [menuOpen, syncMenuAnchor]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onViewportChange = () => syncMenuAnchor();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [menuOpen, syncMenuAnchor]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function closeIfOutside(event: Event) {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuAnchorRef.current?.contains(target)) return;
      if (menuDropdownRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", closeIfOutside);
    document.addEventListener("touchstart", closeIfOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", closeIfOutside);
      document.removeEventListener("touchstart", closeIfOutside);
    };
  }, [menuOpen]);

  const showToast = useCallback((message: string, tone: "success" | "error" | "info" = "success") => {
    showAppToast(message, { tone });
  }, []);

  useEffect(() => {
    if (!isPersistedQuadPostId(note.id)) return undefined;
    const shouldFetch =
      commentsSheetOpen || ((note.commentCount ?? 0) > 0 && comments.length === 0);
    if (!shouldFetch) return undefined;

    let cancelled = false;
    void hydrateQuadPostCommentsSafe(note.id, "field-note-card").then((ok) => {
      if (cancelled) return;
      if (ok) onCommentsUpdated?.();
      else showToast("Could not load comments.");
    });
    return () => {
      cancelled = true;
    };
  }, [commentsSheetOpen, note.id, note.commentCount, comments.length, onCommentsUpdated, showToast]);

  const handleToggleCommentLike = useCallback(
    (commentId: string, liked: boolean) => {
      return toggleQuadCommentLike({
        commentId,
        liked,
        onOptimistic: () => onCommentsUpdated?.(),
      });
    },
    [onCommentsUpdated],
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
      showToast("Post deleted.");
    } catch (err) {
      console.error("[cq][quad-post] delete failed", {
        postId: note.id,
        authorId: note.authorId,
        currentUserId,
        message: err instanceof Error ? err.message : String(err),
        code: err instanceof ApiRequestError ? err.code : undefined,
        status: err instanceof ApiRequestError ? err.status : undefined,
        error: err,
      });
      const message = err instanceof Error ? err.message : "Could not delete post.";
      showToast(message);
    } finally {
      setActionPending(false);
    }
  }

  const menuDropdown =
    menuOpen && menuAnchor && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuDropdownRef}
            role="menu"
            className="cq-feed-post-menu"
            style={{
              top: menuAnchor.top + 4,
              right: menuAnchor.right,
            }}
          >
            {isOwner ? (
              <button
                type="button"
                role="menuitem"
                className="cq-feed-post-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setEditError(null);
                  setEditOpen(true);
                }}
              >
                Edit Post
              </button>
            ) : null}
            {isOwner && !isAnonymousPost ? (
              <button
                type="button"
                role="menuitem"
                className="cq-feed-post-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setEditTagSelections([]);
                  setAddTagsOpen(true);
                }}
              >
                Add tags
              </button>
            ) : null}
            {isAnonymousPost && !isOwner ? (
              <button
                type="button"
                role="menuitem"
                className="cq-feed-post-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setBlockAnonymousOpen(true);
                }}
              >
                Block account
              </button>
            ) : null}
            {canReportPost ? (
              <button
                type="button"
                role="menuitem"
                className="cq-feed-post-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
              >
                Report post
              </button>
            ) : null}
            {isOwner || canModerateDelete ? (
              <button
                type="button"
                role="menuitem"
                className="cq-feed-post-menu-item cq-feed-post-menu-item--danger"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              >
                Delete Post
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  const ownerMenu = showPostMenu ? (
    <div ref={menuAnchorRef} className="cq-feed-post-menu-anchor relative shrink-0" data-menu-open={menuOpen ? "true" : "false"}>
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
      {menuDropdown}
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

  function fireEmber() {
    if (emberPending) return;
    if (isOwner || hasHyped) return;
    const remaining = emberAllowance?.remaining;
    const unlimited = emberAllowance?.unlimited === true;
    if (!unlimited && remaining === 0) {
      showToast(EMBER_COPY.exhausted, "info");
      return;
    }
    onHype(note.id);
  }

  useEffect(() => {
    return subscribeEmberCast((event) => {
      if (event.noteId !== note.id) return;
      // Immediate purple pulse on the flame. Success toast is owned by
      // toggleQuadSpark so the cast overlay never duplicates "Ember given".
      const reduceMotion =
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) {
        setEmberPulse(true);
        if (emberPulseTimerRef.current != null) window.clearTimeout(emberPulseTimerRef.current);
        emberPulseTimerRef.current = window.setTimeout(() => {
          setEmberPulse(false);
          emberPulseTimerRef.current = null;
        }, 220);
      }
    });
  }, [note.id]);

  useEffect(() => {
    return () => {
      if (emberPulseTimerRef.current != null) window.clearTimeout(emberPulseTimerRef.current);
    };
  }, []);

  function handleHype() {
    if (isOwner || emberPending) return;
    if (!hasSeenEmberExplainer()) {
      pendingEmberActionRef.current = true;
      setEmberExplainerOpen(true);
      return;
    }
    fireEmber();
  }

  function openLikers() {
    if (shouldIgnoreLikersOpen()) return;
    setLikersSheetOpen(true);
  }

  function handleEmberBlocked(reason: "exhausted" | "own_post" | "already_given") {
    if (reason === "exhausted") showAppToast(EMBER_COPY.exhausted, { tone: "info" });
    else if (reason === "own_post") showAppToast(EMBER_COPY.ownPost, { tone: "info" });
    else showAppToast(EMBER_COPY.alreadyGiven, { tone: "info" });
  }

  function acknowledgeEmberExplainer() {
    markEmberExplainerSeen();
    setEmberExplainerOpen(false);
    if (pendingEmberActionRef.current) {
      pendingEmberActionRef.current = false;
      fireEmber();
    }
  }

  const handleShare = useCallback(async () => {
    if (onSharePost && (note.isPersisted ?? isPersistedQuadPostId(note.id))) {
      onSharePost(note);
      return;
    }
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = note.body.slice(0, 200);
    const { nativeShare } = await import("@/lib/client/capacitorNative");
    await nativeShare({
      title: `${note.authorName} on CampusQuest`,
      text,
      url,
    });
  }, [note, onSharePost]);

  function handleProofImageTap() {
    const now = Date.now();
    if (now - lastImageTapAtRef.current < 280) {
      addNodFromImage();
      lastImageTapAtRef.current = 0;
      return;
    }
    lastImageTapAtRef.current = now;
    const hasPhotoTags = (note.tags ?? []).some(
      (t) => t.tagSource === "photo" && t.status === "approved",
    );
    if (hasPhotoTags) {
      window.setTimeout(() => {
        if (lastImageTapAtRef.current === now) setShowPhotoTags((v) => !v);
      }, 290);
    }
  }

  const photoTags = (note.tags ?? [])
    .filter((t) => t.tagSource === "photo" && t.status === "approved" && t.positionX != null && t.positionY != null)
    .map((t) => {
      const override = localPhotoTagPos[t.id];
      return override ? { ...t, positionX: override.x, positionY: override.y } : t;
    });
  const structuredTags = (note.tags ?? []).filter(
    (t) => (t.tagSource === "composer" || t.tagSource === "photo") && t.status === "approved",
  );
  const eventTag = structuredTags.find((tag) => tag.entityType === "event" || tag.entityType === "external_event");
  const contextLinks =
    (eventTag && onViewEvent) || (note.locationId && onViewOnMap) ? (
      <div className="cq-feed-context-links mt-1.5 flex flex-wrap gap-2">
        {eventTag && onViewEvent ? (
          <button
            type="button"
            className="min-h-[44px] rounded-lg px-2 text-xs font-semibold text-uri-keaney hover:underline"
            onClick={() => onViewEvent(eventTag.entityId)}
          >
            View Event
          </button>
        ) : null}
        {note.locationId && onViewOnMap ? (
          <button
            type="button"
            className="min-h-[44px] rounded-lg px-2 text-xs font-semibold text-uri-keaney hover:underline"
            onClick={() => onViewOnMap(note.locationId!)}
          >
            View on Map
          </button>
        ) : null}
      </div>
    ) : null;
  const captionMentions = (note.mentions ?? []).map((m) => ({
    entityType: m.entityType,
    entityId: m.entityId,
    displayText: m.displayText,
    startIndex: m.startIndex,
    endIndex: m.endIndex,
  }));

  const avatarFrameClass = `cq-avatar-slot flex-shrink-0 border ${
    isFeed
      ? "h-[38px] w-[38px] border-white/15 bg-cq-elevated/8"
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
      organizationId: note.postedAsType === "organization" ? note.postedAsId : undefined,
    });
  }

  const showAuthorLink = Boolean(onViewAuthor) && !isAnonymousPost;
  const authorLabel = isAnonymousPost ? note.authorName : note.authorUsername;

  const avatarFrame = showAuthorLink ? (
    <button
      type="button"
      onClick={handleViewAuthor}
      className={`${avatarFrameClass} touch-manipulation transition hover:opacity-90`}
      aria-label={`View ${note.authorName}'s profile`}
    >
      <AvatarDisplay avatar={note.authorAvatar} fitParent size={isFeed ? 38 : 44} />
    </button>
  ) : (
    <div className={avatarFrameClass}>
      <AvatarDisplay avatar={note.authorAvatar} fitParent size={isFeed ? 38 : 44} />
    </div>
  );

  const textAvatarClass = `cq-avatar-slot h-7 w-7 flex-shrink-0 border border-white/15 bg-cq-elevated/8 ${
    highlightStat === "strength"
      ? "stat-aura-strength"
      : highlightStat === "knowledge"
        ? "stat-aura-knowledge"
        : ""
  }`;
  const textAvatarFrame = showAuthorLink ? (
    <button
      type="button"
      onClick={handleViewAuthor}
      className={`${textAvatarClass} touch-manipulation transition hover:opacity-90`}
      aria-label={`View ${note.authorName}'s profile`}
    >
      <AvatarDisplay avatar={note.authorAvatar} fitParent size={28} />
    </button>
  ) : (
    <div className={textAvatarClass}>
      <AvatarDisplay avatar={note.authorAvatar} fitParent size={28} />
    </div>
  );
  const textAuthorName = showAuthorLink ? (
    <button type="button" onClick={handleViewAuthor} className="cq-feed-text-name">
      {authorLabel}
    </button>
  ) : (
    <span className="cq-feed-text-name">{authorLabel}</span>
  );
  const textPostedAt = formatFeedExactTime(note.createdAt);

  const authorUsernamePrimary = showAuthorLink ? (
    <button
      type="button"
      onClick={handleViewAuthor}
      className="truncate text-left text-[13px] font-semibold leading-tight tracking-tight text-white transition hover:text-uri-keaney/90"
    >
      {authorLabel}
    </button>
  ) : (
    <span className="truncate text-[13px] font-semibold leading-tight tracking-tight text-white">
      {authorLabel}
    </span>
  );

  const authorNameEl = showAuthorLink ? (
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

  const mediaW = usableCarousel?.[0]?.width ?? note.mediaWidth ?? null;
  const mediaH = usableCarousel?.[0]?.height ?? note.mediaHeight ?? null;

  const proofBlock =
    usableCarousel && usableCarousel.length > 0 ? (
      <QuadMediaCarousel
        postId={note.id}
        media={usableCarousel}
        tags={note.tags}
        isFeed={isFeed}
        priority={priorityMedia}
      />
    ) : proofImgUrl &&
    (isVideo ? (
      <QuadVideoPlayer
        playerId={note.id}
        src={proofImgUrl}
        poster={note.posterUrl}
        durationSeconds={note.mediaDurationSeconds}
        width={mediaW}
        height={mediaH}
        hasAudio={note.mediaHasAudio}
        autoplayWhenVisible={isFeed}
        fillParent={false}
      />
    ) : isImgUrl ? (
      isFeed ? (
        <div
          className="group relative block w-full"
          data-no-drawer-swipe="true"
          data-cq-gesture-block="swipe-tab"
          onDoubleClick={addNodFromImage}
          onTouchEnd={handleProofImageTap}
          aria-label="Double tap image to nod"
        >
          <ZoomableImage
            src={proofImgUrl}
            alt=""
            width={mediaW}
            height={mediaH}
            priority={priorityMedia}
            enableDoubleTapZoom={false}
            imgClassName="quad-feed-media-img w-full max-w-full rounded-none"
            onClick={() => {
              if (photoTags.length > 0) setShowPhotoTags((v) => !v);
            }}
          />
          {photoTags.length > 0 ? (
            <FeedPhotoTags
              postId={note.id}
              tags={photoTags}
              visible={showPhotoTags}
              canReposition={isOwner}
              onRepositioned={(tagId, x, y) => {
                setLocalPhotoTagPos((prev) => ({ ...prev, [tagId]: { x, y } }));
              }}
            />
          ) : null}
          {showImageNodPop ? (
            <span className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2">
              <CampusQuestNodHeartPop size="lg" />
            </span>
          ) : null}
        </div>
      ) : (
        <img
          src={proofImgUrl}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
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
  const displayCommentCount = getDisplayCommentCount(note.id, note);
  const actionsRow = (
    <div
      className={
        isFeed
          ? "cq-feed-actions-row flex w-full items-center justify-between"
          : "mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-white/15 pt-3"
      }
    >
      <div className={`flex items-center ${isFeed ? "-ml-1.5 gap-0" : "flex-wrap gap-0.5"}`}>
        <ReactionButton
          active={hasNodded}
          onClick={handleNod}
          onCountClick={note.nodCount > 0 ? openLikers : undefined}
          countClickLabel={`${note.nodCount} likes`}
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
          count={displayCommentCount}
          label="View comments"
          compact={isFeed}
        />
        <ReactionButton
          onClick={() => void handleShare()}
          icon={Share2}
          label="Share post"
          compact={isFeed}
          hideCount
        />
        {!isFeed ? (
          <EmberReactionButton
            active={hasHyped}
            onToggle={handleHype}
            onBlocked={handleEmberBlocked}
            count={hypeCount}
            remaining={emberAllowance?.remaining ?? null}
            isOwnPost={isOwner}
            unlimited={emberAllowance?.unlimited === true}
            pending={emberPending}
            pulse={emberPulse}
            noteId={note.id}
            anchorRef={emberAnchorRef}
          />
        ) : null}
      </div>
      {isFeed ? (
        <div className="relative z-[3] flex items-center -mr-1.5">
          <EmberReactionButton
            active={hasHyped}
            onToggle={handleHype}
            onBlocked={handleEmberBlocked}
            count={hypeCount}
            remaining={emberAllowance?.remaining ?? null}
            isOwnPost={isOwner}
            unlimited={emberAllowance?.unlimited === true}
            pending={emberPending}
            pulse={emberPulse}
            compact
            noteId={note.id}
            anchorRef={emberAnchorRef}
          />
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <ReactionButton
            active={hasVerified}
            onClick={() => onVerify(note.id)}
            icon={ShieldCheck}
            count={note.verifyCount ?? 0}
            label={hasVerified ? "Remove verify" : "Verify"}
            title={FEATURE_FLAGS.progression ? "Verify legit — you +5 XP, author +5 XP" : "Verify legit"}
          />
          <ReactionButton
            active={hasAssisted}
            onClick={() => onAssist(note.id)}
            icon={Swords}
            count={note.assistCount ?? 0}
            label={hasAssisted ? "Remove assist" : "Assist"}
            title={FEATURE_FLAGS.progression ? "Assist — guild race points + author XP" : "Assist"}
          />
        </div>
      )}
    </div>
  );

  const previewComment = comments.length > 0 ? comments[comments.length - 1] : null;
  const previewComments = comments.slice(-2);

  const feedCommentsSection =
    displayCommentCount > 0 ? (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setCommentsSheetOpen(true)}
          className="text-[13px] text-white/45 transition hover:text-white/60"
        >
          View all {displayCommentCount} comment{displayCommentCount === 1 ? "" : "s"}
        </button>
        {displayCommentCount <= 2 && previewComments.length > 0
          ? previewComments.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCommentsSheetOpen(true)}
                className="block w-full text-left text-[13px] leading-snug text-white/75"
              >
                <span className="font-semibold text-white">{c.authorUsername || c.authorName}</span>{" "}
                <span className="line-clamp-2 whitespace-pre-wrap">{c.body}</span>
              </button>
            ))
          : previewComment ? (
              <button
                type="button"
                onClick={() => setCommentsSheetOpen(true)}
                className="block w-full text-left text-[13px] leading-snug text-white/75"
              >
                <span className="font-semibold text-white">
                  {previewComment.authorUsername || previewComment.authorName}
                </span>{" "}
                <span className="line-clamp-2 whitespace-pre-wrap">{previewComment.body}</span>
              </button>
            ) : null}
      </div>
    ) : null;

  const headerLocation =
    note.locationName?.trim() ||
    (structuredTags.find((t) => t.entityType === "organization" || t.entityType === "event")?.displayLabel ??
      null);

  return (
    <article
      className={
        isFeed
          ? `cq-feed-post quad-feed-post bg-transparent${isMediaFeedPost ? "" : " cq-feed-post--text"}${menuOpen ? " cq-feed-post--menu-open" : ""}`
          : `p-4 transition-colors hover:bg-cq-elevated/8${menuOpen ? " cq-feed-post--menu-open" : ""}`
      }
    >
      {isFeed && !isMediaFeedPost ? (
        <>
          <header className="cq-feed-text-header">
            {textAvatarFrame}
            <div className="cq-feed-text-identity">
              {textAuthorName}
              {note.authorVerifiedBadge && !isAnonymousPost ? (
                <span className="cq-identity-badge shrink-0" aria-label="Verified">✓</span>
              ) : null}
              {isAnonymousPost && note.viewerIsAuthor ? (
                <span className="shrink-0 text-[11px] font-medium text-white/55">Your anonymous post</span>
              ) : null}
              <time
                dateTime={new Date(note.createdAt).toISOString()}
                title={textPostedAt}
                className="cq-feed-text-time"
              >
                {formatFeedRelativeTime(note.createdAt)}
                <span className="sr-only">, {textPostedAt}</span>
              </time>
              {(note.verifyCount ?? 0) >= 2 ? (
                <span className="shrink-0 text-[10px] font-medium text-emerald-300/75">Verified</span>
              ) : null}
              {streak ? (
                <span className="shrink-0 text-[10px] font-medium text-uri-gold/85">{streak}</span>
              ) : null}
            </div>
            {ownerMenu}
          </header>

          <div className="cq-feed-text-body">
            <TextPostCopy
              body={note.body}
              tags={note.ramMarks.map((r) => r.tag)}
              mentions={captionMentions}
            />
            {headerLocation ? <p className="cq-feed-text-location">{headerLocation}</p> : null}
            {!isAnonymousPost && structuredTags.length > 0 ? <TaggedWithLine tags={structuredTags} /> : null}
            {contextLinks}
            {proofBlock ? <div className="cq-feed-text-link">{proofBlock}</div> : null}
          </div>

          <div className="cq-feed-post-actions post-actions" data-no-drawer-swipe="true">
            {actionsRow}
          </div>

          {note.nodCount > 0 ? (
            <div className="cq-feed-post-engagement">
              <LikedByRow
                preview={note.likedByPreview ?? []}
                likeCount={note.nodCount}
                onOpenLikers={openLikers}
              />
            </div>
          ) : null}

          {feedCommentsSection ? (
            <div className="cq-feed-post-comments">{feedCommentsSection}</div>
          ) : null}
        </>
      ) : isFeed ? (
        <>
          <header className="cq-feed-post-header flex items-center gap-2.5 px-3">
            {avatarFrame}
            <div className="min-w-0 flex-1 py-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {authorUsernamePrimary}
                <time
                  dateTime={new Date(note.createdAt).toISOString()}
                  className="shrink-0 text-[11px] font-medium leading-none text-white/40"
                >
                  {formatTime(note.createdAt)}
                </time>
                {note.authorVerifiedBadge ? (
                  <span className="cq-identity-badge" aria-label="Verified">✓</span>
                ) : null}
                {(note.verifyCount ?? 0) >= 2 ? (
                  <span className="shrink-0 text-[10px] font-medium text-emerald-300/75">Verified</span>
                ) : null}
                {streak ? (
                  <span className="shrink-0 text-[10px] font-medium text-uri-gold/85">{streak}</span>
                ) : null}
              </div>
              {headerLocation ? (
                <p className="mt-0.5 truncate text-[11px] leading-tight text-white/45">{headerLocation}</p>
              ) : null}
            </div>
            {ownerMenu}
          </header>

          {proofBlock ? (
            <div
              className="quad-feed-media-wrap carousel w-full"
              data-no-drawer-swipe="true"
              data-cq-horizontal-scroll="true"
              data-cq-gesture-block="swipe-tab"
            >
              {proofBlock}
            </div>
          ) : null}

          <div className="cq-feed-post-actions post-actions px-3" data-no-drawer-swipe="true">
            {actionsRow}
          </div>

          {note.nodCount > 0 ? (
            <div className="cq-feed-post-engagement px-3">
              <LikedByRow
                preview={note.likedByPreview ?? []}
                likeCount={note.nodCount}
                onOpenLikers={openLikers}
              />
            </div>
          ) : null}

          {(note.body.trim() || note.ramMarks.length > 0 || structuredTags.length > 0) && (
            <div className="cq-feed-post-caption px-3">
              <FeedCaption
                username={isAnonymousPost ? undefined : note.authorUsername}
                onUsernameClick={showAuthorLink ? handleViewAuthor : undefined}
                body={note.body}
                tags={note.ramMarks.map((r) => r.tag)}
                mentions={captionMentions}
              />
              {!isAnonymousPost && structuredTags.length > 0 ? <TaggedWithLine tags={structuredTags} /> : null}
              {contextLinks}
            </div>
          )}

          <div className="cq-feed-post-comments px-3">{feedCommentsSection}</div>
        </>
      ) : (
        <div className="flex gap-3">
          {avatarFrame}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {authorNameEl}
              {note.authorVerifiedBadge && !isAnonymousPost ? (
                <span className="cq-identity-badge" aria-label="Verified">✓</span>
              ) : null}
              {isAnonymousPost && note.viewerIsAuthor ? (
                <span className="text-[11px] font-medium text-white/55">Your anonymous post</span>
              ) : null}
              {isAnonymousPost ? null : onViewAuthor ? (
                authorUsernameEl
              ) : (
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
            <p className="text-white/90 mt-1 whitespace-pre-wrap break-words">
              <CaptionWithMentions body={note.body} mentions={captionMentions} />
            </p>
            {!isAnonymousPost && structuredTags.length > 0 ? <TaggedWithLine tags={structuredTags} /> : null}
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
          onToggleCommentLike={handleToggleCommentLike}
          onViewAuthor={onViewAuthor}
        />
      ) : null}

      <PostLikersSheet
        open={likersSheetOpen}
        postId={note.id}
        likeCount={note.nodCount}
        onClose={() => setLikersSheetOpen(false)}
        onViewAuthor={onViewAuthor}
      />

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

      <TagPickerSheet
        open={addTagsOpen}
        selected={editTagSelections}
        onChange={setEditTagSelections}
        onClose={() => setAddTagsOpen(false)}
        onDone={async () => {
          if (!editTagSelections.length) {
            setAddTagsOpen(false);
            return;
          }
          setActionPending(true);
          try {
            await postAuthed(`/api/quad/posts/${note.id}/tags`, {
              tags: editTagSelections.map((t) => ({
                entityType: t.entityType,
                entityId: t.entityId,
                displayLabel: t.displayLabel,
                subtitle: t.subtitle ?? null,
                mentionSlug: t.mentionSlug ?? null,
              })),
            });
            setAddTagsOpen(false);
            showToast("Tags updated");
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Could not add tags.");
          } finally {
            setActionPending(false);
          }
        }}
      />

      {reportOpen ? (
        <ReportPostSheet
          postId={note.id}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => showToast("Report submitted. Thanks for helping keep CampusQuest safe.")}
          onError={(message) => showToast(message)}
        />
      ) : null}

      <CqModalLayer
        open={blockAnonymousOpen}
        onDismiss={() => {
          if (!actionPending) setBlockAnonymousOpen(false);
        }}
        labelledBy="block-anonymous-title"
        placement="dialog"
        panelClassName="w-full max-w-sm rounded-2xl border border-white/15 bg-cq-elevated p-5 shadow-2xl"
      >
        <h2 id="block-anonymous-title" className="font-display text-lg font-bold text-white">
          Block this account?
        </h2>
        <p className="mt-2 text-sm text-white/70">
          This applies to the underlying account. Their profile is not shown, and you will stop seeing their posts.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={actionPending}
            onClick={() => setBlockAnonymousOpen(false)}
            className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/70"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={actionPending}
            onClick={() => {
              setActionPending(true);
              void postAuthed("/api/social/blocks/anonymous-post", { postId: note.id })
                .then(() => {
                  setBlockAnonymousOpen(false);
                  showToast("You’ll no longer see posts from this account.");
                })
                .catch((err) => {
                  showToast(err instanceof Error ? err.message : "Could not block this account.");
                })
                .finally(() => setActionPending(false));
            }}
            className="flex-1 rounded-xl bg-rose-600/90 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {actionPending ? "Blocking…" : "Block"}
          </button>
        </div>
      </CqModalLayer>

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

      {emberExplainerOpen && typeof document !== "undefined"
        ? createPortal(
            <EmberExplainerSheet
              open
              body={emberAllowance?.unlimited ? EMBER_COPY.explainerBodyUnlimited : EMBER_COPY.explainerBody}
              onAcknowledge={acknowledgeEmberExplainer}
            />,
            document.body,
          )
        : null}

    </article>
  );
}

export const FieldNoteCard = memo(FieldNoteCardInner, fieldNoteCardPropsAreEqual);
