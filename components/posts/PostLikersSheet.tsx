"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import {
  fetchQuadPostLikers,
  type QuadPostLikerDto,
} from "@/lib/client/quadPostsClient";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";

const DISMISS_DRAG_PX = 96;

type PostLikersSheetProps = {
  open: boolean;
  postId: string;
  likeCount: number;
  onClose: () => void;
  onViewAuthor?: (author: { userId: string; username: string; name: string; avatar: string }) => void;
};

export function PostLikersSheet({
  open,
  postId,
  likeCount,
  onClose,
  onViewAuthor,
}: PostLikersSheetProps) {
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef(0);
  const dragYRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likers, setLikers] = useState<QuadPostLikerDto[]>([]);
  const [total, setTotal] = useState(likeCount);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setDragY(0);
      dragYRef.current = 0;
      setDragging(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setEntered(true));
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
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
    if (!open) return;
    setTotal(likeCount);
    if (!isPersistedQuadPostId(postId)) {
      setLikers([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchQuadPostLikers(postId)
      .then((result) => {
        if (cancelled) return;
        setLikers(result.likers);
        setTotal(result.total);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load likes.");
        setLikers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, postId, likeCount]);

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
        aria-label="Likes"
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
          <h2 className="cq-comments-sheet-title">
            Likes{total > 0 ? ` · ${total.toLocaleString()}` : ""}
          </h2>
          <button type="button" className="cq-comments-sheet-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="cq-comments-sheet-list">
          {loading ? (
            <div className="cq-comments-sheet-empty-wrap">
              <p className="cq-comments-sheet-empty">Loading…</p>
            </div>
          ) : error ? (
            <div className="cq-comments-sheet-empty-wrap">
              <p className="cq-comments-sheet-empty">{error}</p>
            </div>
          ) : likers.length === 0 ? (
            <div className="cq-comments-sheet-empty-wrap">
              <p className="cq-comments-sheet-empty">No likes yet.</p>
            </div>
          ) : (
            <ul className="cq-comments-sheet-items">
              {likers.map((liker) => {
                const author = {
                  userId: liker.userId,
                  username: liker.username,
                  name: liker.displayName,
                  avatar: liker.avatar,
                };
                return (
                  <li key={liker.userId} className="cq-comments-sheet-item">
                    {onViewAuthor ? (
                      <button
                        type="button"
                        onClick={() => onViewAuthor(author)}
                        className="cq-comments-sheet-item-avatar touch-manipulation transition hover:opacity-90"
                        aria-label={`View ${liker.displayName}'s profile`}
                      >
                        <AvatarDisplay avatar={liker.avatar} fitParent size={36} />
                      </button>
                    ) : (
                      <div className="cq-comments-sheet-item-avatar">
                        <AvatarDisplay avatar={liker.avatar} fitParent size={36} />
                      </div>
                    )}
                    <div className="cq-comments-sheet-item-body">
                      {onViewAuthor ? (
                        <button
                          type="button"
                          onClick={() => onViewAuthor(author)}
                          className="cq-comments-sheet-item-author touch-manipulation transition hover:text-uri-keaney/90"
                        >
                          {liker.username}
                        </button>
                      ) : (
                        <span className="cq-comments-sheet-item-author">{liker.username}</span>
                      )}
                      {liker.displayName && liker.displayName.toLowerCase() !== liker.username ? (
                        <p className="cq-comments-sheet-item-content text-white/50">{liker.displayName}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
