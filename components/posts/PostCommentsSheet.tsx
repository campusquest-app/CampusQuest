"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { FieldNote, QuadComment } from "@/lib/types";
import { QUAD_COMMENT_MAX_CHARS } from "@/lib/types";

const DISMISS_DRAG_PX = 96;

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

export function PostCommentsSheet({
  open,
  note,
  comments,
  currentUser,
  onClose,
  onAddComment,
  onViewAuthor,
}: {
  open: boolean;
  note: FieldNote;
  comments: QuadComment[];
  currentUser: { id: string; name: string; username: string; avatar: string };
  onClose: () => void;
  onAddComment?: (noteId: string, body: string) => void | Promise<void>;
  onViewAuthor?: (author: { userId: string; username: string; name: string; avatar: string }) => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [entered, setEntered] = useState(false);
  const dragStartY = useRef(0);
  const dragYRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setDragY(0);
      setDraft("");
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => setEntered(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prev;
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

  useEffect(() => {
    if (!open || comments.length === 0) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, comments.length]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim().slice(0, QUAD_COMMENT_MAX_CHARS);
    if (!body || submitting || !onAddComment) return;
    setSubmitting(true);
    try {
      await onAddComment(note.id, body);
      setDraft("");
      window.requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
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
    <div className="cq-comments-sheet-root" role="presentation">
      <button
        type="button"
        className={`cq-comments-sheet-backdrop ${entered ? "cq-comments-sheet-backdrop--open" : ""}`}
        aria-label="Close comments"
        onClick={onClose}
      />
      <div
        className={`cq-comments-sheet ${entered ? "cq-comments-sheet--open" : ""}`}
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
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
          {comments.length === 0 ? (
            <p className="cq-comments-sheet-empty">No comments yet. Start the conversation.</p>
          ) : (
            <ul className="cq-comments-sheet-items">
              {comments.map((c) => (
                <li key={c.id} className="cq-comments-sheet-item">
                  {onViewAuthor ? (
                    <button
                      type="button"
                      onClick={() =>
                        onViewAuthor({
                          userId: c.authorId,
                          username: c.authorUsername,
                          name: c.authorName,
                          avatar: c.authorAvatar,
                        })
                      }
                      className="cq-comments-sheet-item-avatar touch-manipulation transition hover:opacity-90"
                      aria-label={`View ${c.authorName}'s profile`}
                    >
                      <AvatarDisplay avatar={c.authorAvatar} fitParent size={32} />
                    </button>
                  ) : (
                    <div className="cq-comments-sheet-item-avatar">
                      <AvatarDisplay avatar={c.authorAvatar} fitParent size={32} />
                    </div>
                  )}
                  <div className="cq-comments-sheet-item-body">
                    <p className="cq-comments-sheet-item-text">
                      {onViewAuthor ? (
                        <button
                          type="button"
                          onClick={() =>
                            onViewAuthor({
                              userId: c.authorId,
                              username: c.authorUsername,
                              name: c.authorName,
                              avatar: c.authorAvatar,
                            })
                          }
                          className="cq-comments-sheet-item-author touch-manipulation transition hover:text-uri-keaney/90"
                        >
                          {c.authorName}
                        </button>
                      ) : (
                        <span className="cq-comments-sheet-item-author">{c.authorName}</span>
                      )}{" "}
                      <span className="cq-comments-sheet-item-content">{c.body}</span>
                    </p>
                    <time className="cq-comments-sheet-item-time" dateTime={new Date(c.createdAt).toISOString()}>
                      {formatCommentTime(c.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {onAddComment ? (
          <form className="cq-comments-sheet-composer" onSubmit={handleSubmit}>
            <div className="cq-comments-sheet-composer-avatar cq-avatar-slot">
              <AvatarDisplay avatar={currentUser.avatar} fitParent size={32} />
            </div>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, QUAD_COMMENT_MAX_CHARS))}
              placeholder="Add a comment..."
              maxLength={QUAD_COMMENT_MAX_CHARS}
              className="cq-comments-sheet-input"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!draft.trim() || submitting}
              className="cq-comments-sheet-post-btn"
            >
              Post
            </button>
          </form>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
