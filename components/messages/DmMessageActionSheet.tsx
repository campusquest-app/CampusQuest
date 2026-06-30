"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, Flag, Sparkles, Star } from "lucide-react";

export type DmMessageAction = "copy" | "favorite" | "unfavorite" | "report";

/**
 * Instagram-style long-press action menu for a single DM message. Only surfaces
 * actions backed by existing APIs: Copy (clipboard), Save/Unsave (favorite),
 * and Report (incoming messages only).
 */
export function DmMessageActionSheet({
  open,
  isMine,
  isFavorited,
  canCopy,
  onAction,
  onClose,
}: {
  open: boolean;
  isMine: boolean;
  isFavorited: boolean;
  canCopy: boolean;
  onAction: (action: DmMessageAction) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-dm-action-overlay" role="dialog" aria-modal="true" aria-label="Message actions" onClick={onClose}>
      <div className="cq-dm-action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cq-dm-action-grip" aria-hidden />
        <div className="cq-dm-action-list">
          {canCopy ? (
            <button type="button" className="cq-dm-action-item" onClick={() => onAction("copy")}>
              <Copy className="h-5 w-5" strokeWidth={1.9} aria-hidden />
              <span>Copy</span>
            </button>
          ) : null}

          <button
            type="button"
            className="cq-dm-action-item"
            onClick={() => onAction(isFavorited ? "unfavorite" : "favorite")}
          >
            {isFavorited ? (
              <Sparkles className="h-5 w-5 text-uri-gold" strokeWidth={1.9} aria-hidden />
            ) : (
              <Star className="h-5 w-5" strokeWidth={1.9} aria-hidden />
            )}
            <span>{isFavorited ? "Remove from Saved" : "Save"}</span>
          </button>

          {!isMine ? (
            <button
              type="button"
              className="cq-dm-action-item cq-dm-action-item--danger"
              onClick={() => onAction("report")}
            >
              <Flag className="h-5 w-5" strokeWidth={1.9} aria-hidden />
              <span>Report</span>
            </button>
          ) : null}
        </div>
        <button type="button" className="cq-dm-action-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
