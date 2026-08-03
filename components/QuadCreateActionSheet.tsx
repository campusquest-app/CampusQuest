"use client";

import { PenSquare, X } from "lucide-react";

/**
 * Compact "Create" chooser shown when the floating Post FAB is tapped.
 * Routes into the Quad post composer without owning any of its logic.
 */
export function QuadCreateActionSheet({
  onClose,
  onCreatePost,
}: {
  onClose: () => void;
  onCreatePost: () => void;
}) {
  return (
    <div
      className="cq-create-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Create"
      onClick={onClose}
    >
      <div className="cq-create-sheet cq-create-sheet--compact" onClick={(e) => e.stopPropagation()}>
        <div className="cq-create-sheet-grip" aria-hidden />
        <div className="cq-create-sheet-head">
          <h2 className="cq-create-sheet-title">Create</h2>
          <button
            type="button"
            className="cq-create-sheet-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2.4} />
          </button>
        </div>

        <div className="cq-create-sheet-actions">
          <button
            type="button"
            className="cq-create-action cq-create-action--post"
            onClick={onCreatePost}
          >
            <span className="cq-create-action-icon" aria-hidden>
              <PenSquare className="h-6 w-6" strokeWidth={2.1} />
            </span>
            <span className="cq-create-action-text">
              <span className="cq-create-action-title">Create Quad Post</span>
              <span className="cq-create-action-subtitle">
                Share a photo or update with the campus.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
