"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Heart, Image as ImageIcon, X } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { FieldNote, QuadComment } from "@/lib/types";
import { QUAD_COMMENT_MAX_CHARS } from "@/lib/types";
import type { QuadCommentActionResult } from "@/lib/client/quadCommentActions";
import { nestQuadComments, type QuadCommentNode } from "@/lib/quadCommentsTree";

const DISMISS_DRAG_PX = 96;
const QUICK_EMOJIS = ["❤️", "🙌", "🔥", "👏", "😮", "😂", "🎉", "💯"] as const;

function formatCommentTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ReplyTarget = {
  id: string;
  authorUsername: string;
  authorName: string;
};

function CommentRow({
  comment,
  depth = 0,
  onViewAuthor,
  onReply,
  onToggleLike,
  likePendingId,
}: {
  comment: QuadCommentNode;
  depth?: number;
  onViewAuthor?: (author: { userId: string; username: string; name: string; avatar: string }) => void;
  onReply: (target: ReplyTarget) => void;
  onToggleLike?: (commentId: string, liked: boolean) => void | Promise<void | QuadCommentActionResult>;
  likePendingId: string | null;
}) {
  const authorProfile = {
    userId: comment.authorId,
    username: comment.authorUsername,
    name: comment.authorName,
    avatar: comment.authorAvatar,
  };

  return (
    <li className={depth > 0 ? "cq-comments-sheet-item cq-comments-sheet-item--reply" : "cq-comments-sheet-item"}>
      {onViewAuthor ? (
        <button
          type="button"
          onClick={() => onViewAuthor(authorProfile)}
          className="cq-comments-sheet-item-avatar touch-manipulation transition hover:opacity-90"
          aria-label={`View ${comment.authorName}'s profile`}
        >
          <AvatarDisplay avatar={comment.authorAvatar} fitParent size={32} />
        </button>
      ) : (
        <div className="cq-comments-sheet-item-avatar">
          <AvatarDisplay avatar={comment.authorAvatar} fitParent size={32} />
        </div>
      )}
      <div className="cq-comments-sheet-item-body">
        <div className="cq-comments-sheet-item-main">
          <div className="min-w-0 flex-1">
            {onViewAuthor ? (
              <button
                type="button"
                onClick={() => onViewAuthor(authorProfile)}
                className="cq-comments-sheet-item-author touch-manipulation transition hover:text-uri-keaney/90"
              >
                @{comment.authorUsername}
              </button>
            ) : (
              <span className="cq-comments-sheet-item-author">@{comment.authorUsername}</span>
            )}
            <p className="cq-comments-sheet-item-content">{comment.body}</p>
            <div className="cq-comments-sheet-item-meta">
              <time dateTime={new Date(comment.createdAt).toISOString()}>{formatCommentTime(comment.createdAt)}</time>
              <button
                type="button"
                className="cq-comments-sheet-reply-btn"
                onClick={() =>
                  onReply({
                    id: comment.id,
                    authorUsername: comment.authorUsername,
                    authorName: comment.authorName,
                  })
                }
              >
                Reply
              </button>
            </div>
          </div>
          <button
            type="button"
            className={`cq-comments-sheet-like-btn${comment.viewerHasLiked ? " cq-comments-sheet-like-btn--active" : ""}`}
            aria-label={comment.viewerHasLiked ? "Unlike comment" : "Like comment"}
            disabled={!onToggleLike || likePendingId === comment.id}
            onClick={() => void onToggleLike?.(comment.id, !comment.viewerHasLiked)}
          >
            <Heart
              className="h-4 w-4"
              strokeWidth={2}
              fill={comment.viewerHasLiked ? "currentColor" : "none"}
            />
            {comment.likeCount > 0 ? (
              <span className="cq-comments-sheet-like-count">{comment.likeCount}</span>
            ) : null}
          </button>
        </div>
        {comment.replies.length > 0 ? (
          <ul className="cq-comments-sheet-replies">
            {comment.replies.map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                onViewAuthor={onViewAuthor}
                onReply={onReply}
                onToggleLike={onToggleLike}
                likePendingId={likePendingId}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

export function PostCommentsSheet({
  open,
  note,
  comments,
  currentUser,
  onClose,
  onAddComment,
  onToggleCommentLike,
  onViewAuthor,
}: {
  open: boolean;
  note: FieldNote;
  comments: QuadComment[];
  currentUser: { id: string; name: string; username: string; avatar: string };
  onClose: () => void;
  onAddComment?: (
    noteId: string,
    body: string,
    parentCommentId?: string | null,
  ) => void | Promise<void | QuadCommentActionResult>;
  onToggleCommentLike?: (commentId: string, liked: boolean) => void | Promise<void | QuadCommentActionResult>;
  onViewAuthor?: (author: { userId: string; username: string; name: string; avatar: string }) => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const [likePendingId, setLikePendingId] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [entered, setEntered] = useState(false);
  const dragStartY = useRef(0);
  const dragYRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const threadedComments = useMemo(() => nestQuadComments(comments), [comments]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setDragY(0);
      setDraft("");
      setSubmitError(null);
      setReplyingTo(null);
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => setEntered(true));
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.setAttribute("data-cq-comments-open", "true");
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.removeAttribute("data-cq-comments-open");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
    setDragging(true);
  }, []);

  const onDragMove = useCallback(
    (clientY: number) => {
      if (!dragging) return;
      const delta = Math.max(0, clientY - dragStartY.current);
      dragYRef.current = delta;
      setDragY(delta);
    },
    [dragging],
  );

  const onDragEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    if (dragYRef.current >= DISMISS_DRAG_PX) {
      dragYRef.current = 0;
      onClose();
      return;
    }
    dragYRef.current = 0;
    setDragY(0);
  }, [dragging, onClose]);

  const startReply = useCallback((target: ReplyTarget) => {
    setReplyingTo(target);
    setSubmitError(null);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
    setSubmitError(null);
  }, []);

  const handleToggleLike = useCallback(
    async (commentId: string, liked: boolean) => {
      if (!onToggleCommentLike || likePendingId) return;
      setLikePendingId(commentId);
      try {
        await onToggleCommentLike(commentId, liked);
      } finally {
        setLikePendingId(null);
      }
    },
    [likePendingId, onToggleCommentLike],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim().slice(0, QUAD_COMMENT_MAX_CHARS);
    if (!body || submitting || !onAddComment) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onAddComment(note.id, body, replyingTo?.id ?? null);
      if (result && typeof result === "object" && "ok" in result && !result.ok) {
        setSubmitError(result.message || "Comment could not be saved.");
        return;
      }
      setDraft("");
      setReplyingTo(null);
      window.requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch {
      setSubmitError("Comment could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const sheetStyle: React.CSSProperties = {
    transform: entered ? `translateY(${dragY}px)` : "translateY(100%)",
    transition: dragging ? "none" : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
  };

  return createPortal(
    <div
      className={`cq-comments-sheet-root${entered ? " cq-comments-sheet-root--open" : ""}`}
      role="presentation"
      onClick={() => {
        if (entered) onClose();
      }}
    >
      <div
        className={`cq-comments-sheet ${entered ? "cq-comments-sheet--open" : ""}`}
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="cq-comments-sheet-grab"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            onDragStart(e.clientY);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => onDragMove(e.clientY)}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span className="cq-comments-sheet-handle" aria-hidden />
        </div>

        <header className="cq-comments-sheet-header">
          <h2 className="cq-comments-sheet-title">Comments</h2>
          <button type="button" className="cq-comments-sheet-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div ref={listRef} className="cq-comments-sheet-list">
          {threadedComments.length === 0 ? (
            <div className="cq-comments-sheet-empty-wrap">
              <p className="cq-comments-sheet-empty">No comments yet. Start the conversation.</p>
            </div>
          ) : (
            <ul className="cq-comments-sheet-items">
              {threadedComments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  onViewAuthor={onViewAuthor}
                  onReply={startReply}
                  onToggleLike={onToggleCommentLike ? handleToggleLike : undefined}
                  likePendingId={likePendingId}
                />
              ))}
            </ul>
          )}
        </div>

        {onAddComment ? (
          <form className="cq-comments-sheet-composer" onSubmit={handleSubmit}>
            {replyingTo ? (
              <div className="cq-comments-sheet-replying col-span-full">
                <span>
                  Replying to <strong>@{replyingTo.authorUsername}</strong>
                </span>
                <button type="button" className="cq-comments-sheet-cancel-reply" onClick={cancelReply}>
                  Cancel
                </button>
              </div>
            ) : null}
            {submitError ? (
              <p className="cq-comments-sheet-error col-span-full text-sm text-red-300" role="alert">
                {submitError}
              </p>
            ) : null}
            <div className="cq-comments-sheet-emoji-row" aria-label="Quick reactions">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="cq-comments-sheet-emoji-btn"
                  onClick={() => {
                    setDraft((prev) => (prev + emoji).slice(0, QUAD_COMMENT_MAX_CHARS));
                    inputRef.current?.focus();
                  }}
                  aria-label={`Add ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="cq-comments-sheet-composer-row">
              <div className="cq-comments-sheet-composer-avatar cq-avatar-slot">
                <AvatarDisplay avatar={currentUser.avatar} fitParent size={32} />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, QUAD_COMMENT_MAX_CHARS))}
                placeholder={replyingTo ? `Reply to @${replyingTo.authorUsername}...` : "What do you think of this?"}
                maxLength={QUAD_COMMENT_MAX_CHARS}
                className="cq-comments-sheet-input"
                autoComplete="off"
                enterKeyHint="send"
              />
              <div className="cq-comments-sheet-composer-tools">
                <button
                  type="button"
                  className="cq-comments-sheet-tool-btn"
                  disabled
                  aria-label="Add image (coming soon)"
                  title="Coming soon"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="cq-comments-sheet-tool-btn"
                  disabled
                  aria-label="Add GIF (coming soon)"
                  title="Coming soon"
                >
                  <span className="cq-comments-sheet-gif-label">GIF</span>
                </button>
              </div>
              <button
                type="submit"
                disabled={!draft.trim() || submitting}
                className="cq-comments-sheet-post-btn"
              >
                Post
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
