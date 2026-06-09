"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Heart, MessageCircle, Share2, ShieldCheck, Swords, Zap } from "lucide-react";
import type { FieldNote, QuadComment, StatKey } from "@/lib/types";
import { QUAD_COMMENT_MAX_CHARS } from "@/lib/types";
import { AvatarDisplay } from "./AvatarDisplay";
import { CampusQuestNodHeartPop } from "./CampusQuestNodHeartPop";

type LucideIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

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
          active ? (fillWhenActive ? "text-violet-300" : "text-cyan-400") : "text-white/42 hover:text-white/68"
        } ${pulseClass ?? ""}`}
      >
        <Icon
          className={`h-[19px] w-[19px] transition-colors duration-150 ${
            active && fillWhenActive ? "fill-violet-300/90" : ""
          }`}
          strokeWidth={active ? 2.35 : 2}
        />
        {count != null && count > 0 ? (
          <span className="min-w-[0.65rem] text-[11px] font-semibold tabular-nums leading-none text-white/55">
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
        active ? "text-cyan-400" : "text-white/45 hover:text-white/72"
      } ${pulseClass ?? ""}`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${
          active
            ? "bg-cyan-500/12 shadow-[0_0_14px_-4px_rgba(56,189,248,0.55)]"
            : "group-hover:bg-white/[0.04]"
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
  if (days >= 30) return `🔥 ${days}-day streak`;
  if (days >= 7) return `🔥 ${days}-day streak`;
  return `🔥 ${days}d`;
}

function FeedCaption({ name, body, tags }: { name: string; body: string; tags: string[] }) {
  const trimmed = body.trim();
  if (!trimmed && tags.length === 0) return null;

  return (
    <p className="break-words text-[14px] leading-snug text-white/85">
      <span className="font-semibold text-white">{name}</span>
      {trimmed ? <span className="whitespace-pre-wrap"> {trimmed}</span> : null}
      {trimmed && tags.length > 0 ? " " : null}
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className="font-medium text-cyan-400/80">
          #{tag}
          {index < tags.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

/** Treat common CDN URLs as images even when the path has no file extension. */
function looksLikeImageProofUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("data:image/")) return true;
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
}: {
  note: FieldNote;
  currentUserId: string;
  comments?: QuadComment[];
  onNod: (noteId: string) => void;
  onHype: (noteId: string) => void;
  onVerify: (noteId: string) => void;
  onAssist: (noteId: string) => void;
  onAddComment?: (noteId: string, body: string) => void;
  currentUser?: { id: string; name: string; username: string; avatar: string };
  likePending?: boolean;
  /** Micro celebration on author row when this post's activity matches */
  highlightStat?: StatKey | null;
  /** `feed` = full-width media, border-between-posts (Quad). `default` = padded card row (Profile). */
  variant?: "default" | "feed";
}) {
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showImageNodPop, setShowImageNodPop] = useState(false);
  const [likePulse, setLikePulse] = useState(false);
  const [zapPulse, setZapPulse] = useState(false);
  const [sparkSent, setSparkSent] = useState(false);
  const lastImageTapAtRef = useRef(0);
  const nodPopTimerRef = useRef<number | null>(null);
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
  }, [note.authorName, note.body]);

  function handleProofImageTap() {
    const now = Date.now();
    if (now - lastImageTapAtRef.current < 280) {
      addNodFromImage();
      lastImageTapAtRef.current = 0;
      return;
    }
    lastImageTapAtRef.current = now;
  }

  const avatarFrame = (
    <div
      className={`flex items-center justify-center flex-shrink-0 border overflow-hidden ${
        isFeed
          ? "h-12 w-12 rounded-full border-white/12 bg-white/[0.04]"
          : "w-11 h-11 rounded-xl bg-gradient-to-br from-uri-keaney/25 to-uri-navy border-uri-keaney/30"
      } ${
        highlightStat === "strength"
          ? "stat-aura-strength"
          : highlightStat === "knowledge"
            ? "stat-aura-knowledge"
            : ""
      }`}
    >
      <AvatarDisplay avatar={note.authorAvatar} size={isFeed ? 48 : 44} />
    </div>
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
        className={`block text-uri-keaney text-sm truncate bg-white/5 ${isFeed ? "px-4 py-3" : "px-3 py-2"}`}
      >
        📎 Proof link
      </a>
    ));

  const hypeCount = note.hypeCount ?? note.vouchCount;
  const actionsRow = (
    <div
      className={
        isFeed
          ? "flex items-center"
          : "mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-white/10 pt-3"
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
          active={commentsOpen}
          onClick={() => setCommentsOpen((open) => !open)}
          icon={MessageCircle}
          count={comments.length}
          label={commentsOpen ? "Hide comments" : "View comments"}
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

  const commentForm = onAddComment && currentUser && (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const body = commentDraft.trim().slice(0, QUAD_COMMENT_MAX_CHARS);
        if (!body || commentSubmitting) return;
        setCommentSubmitting(true);
        onAddComment(note.id, body);
        setCommentDraft("");
        setCommentSubmitting(false);
      }}
      className={`flex gap-2 ${isFeed ? "mt-2.5" : "mt-3"}`}
    >
      <input
        type="text"
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value.slice(0, QUAD_COMMENT_MAX_CHARS))}
        placeholder="Add a comment..."
        maxLength={QUAD_COMMENT_MAX_CHARS}
        className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm text-white placeholder-white/40 focus:border-uri-keaney/40 focus:outline-none focus:ring-2 focus:ring-uri-keaney/40 ${
          isFeed ? "border-white/[0.1] bg-black/30" : "border-white/15 bg-white/10"
        }`}
      />
      <button
        type="submit"
        disabled={!commentDraft.trim() || commentSubmitting}
        className="px-3 py-2 rounded-xl bg-uri-keaney/80 text-white text-sm font-medium hover:bg-uri-keaney disabled:opacity-50 disabled:pointer-events-none transition-colors"
      >
        Post
      </button>
    </form>
  );

  const feedCommentsSection = (
    <div>
      {!commentsOpen ? (
        comments.length > 0 ? (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              className="text-[13px] font-medium text-white/38 transition hover:text-white/55"
            >
              View all {comments.length} comment{comments.length === 1 ? "" : "s"}
            </button>
            {previewComment ? (
              <p className="line-clamp-2 text-[13px] leading-snug text-white/72">
                <span className="font-semibold text-white">{previewComment.authorName}</span>{" "}
                <span className="whitespace-pre-wrap">{previewComment.body}</span>
              </p>
            ) : null}
          </div>
        ) : null
      ) : (
        <>
          {comments.length > 0 ? (
            <div className="quad-feed-comments mt-1">
              <ul className="mb-0 space-y-2.5 pr-0.5">
                {comments.map((c) => (
                  <li key={c.id}>
                    <p className="text-[13px] leading-snug text-white/80">
                      <span className="font-semibold text-white">{c.authorName}</span>{" "}
                      <span className="whitespace-pre-wrap">{c.body}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[13px] text-white/35">No comments yet</p>
          )}
          {commentForm}
        </>
      )}
    </div>
  );

  const commentsBlock = (
    <div className={`${isFeed ? "pb-0" : "mt-3 border-t border-white/10 pt-3"}`}>
      {isFeed ? null : commentsOpen ? (
        <>
          {comments.length > 0 && (
            <ul className="mt-3 mb-3 space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/10">
                    <AvatarDisplay avatar={c.authorAvatar} size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-white">{c.authorName}</span>
                      <span className="text-xs text-uri-keaney/85">@{c.authorUsername}</span>
                      <span className="text-xs text-white/35">· {formatTime(c.createdAt)}</span>
                    </div>
                    <p className="mt-1 break-words text-sm leading-relaxed text-white/85 whitespace-pre-wrap">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {commentForm}
        </>
      ) : null}
    </div>
  );

  return (
    <article
      className={
        isFeed
          ? "cq-feed-post quad-feed-post bg-transparent"
          : "p-4 transition-colors hover:bg-white/[0.04]"
      }
    >
      {isFeed ? (
        <>
          <header className="cq-feed-post-header flex items-center gap-3 px-3 pb-2 pt-3 sm:pt-4">
            {avatarFrame}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-bold leading-tight tracking-tight text-white">
                  {note.authorName}
                </span>
                {(note.verifyCount ?? 0) >= 2 ? (
                  <span className="text-[10px] font-medium text-emerald-300/75">Verified</span>
                ) : null}
                {streak ? (
                  <span className="text-[10px] font-medium text-uri-gold/85">{streak}</span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12px] text-white/32">
                @{note.authorUsername} • {formatTime(note.createdAt)}
              </p>
              {note.locationName ? (
                <p className="mt-0.5 text-[11px] font-medium text-cyan-300/75">📍 {note.locationName}</p>
              ) : null}
            </div>
          </header>
          {proofImgUrl ? (
            <div className="quad-feed-media-wrap w-full">{proofBlock}</div>
          ) : null}
          <div className="cq-feed-post-actions px-3 py-1">{actionsRow}</div>
          {(note.body.trim() || note.ramMarks.length > 0) && (
            <div className="cq-feed-post-caption px-3 pb-1 pt-0.5">
              <FeedCaption
                name={note.authorName}
                body={note.body}
                tags={note.ramMarks.map((r) => r.tag)}
              />
            </div>
          )}
          <div className="cq-feed-post-comments px-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-1">
            {feedCommentsSection}
          </div>
        </>
      ) : (
        <div className="flex gap-3">
          {avatarFrame}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-white">{note.authorName}</span>
              <span className="text-uri-keaney/90 text-sm">@{note.authorUsername}</span>
              <span className="text-white/40 text-xs">· {formatTime(note.createdAt)}</span>
              {note.locationName ? (
                <span className="text-[11px] font-medium text-cyan-300/75">📍 {note.locationName}</span>
              ) : null}
              {streak && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-uri-gold/20 text-uri-gold border border-uri-gold/40">
                  {streak}
                </span>
              )}
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
            {commentsBlock}
          </div>
        </div>
      )}
    </article>
  );
}
