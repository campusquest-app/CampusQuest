"use client";

import { Camera, PenSquare, ScrollText, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type CreateAction = {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onSelect: () => void;
  accent: string;
};

/**
 * Premium "Create" chooser shown when the floating + is tapped. Routes to the
 * three creation flows (Memory, Quad post, Quest log) without owning any of
 * their logic — selection simply calls back into the parent.
 */
export function QuadCreateActionSheet({
  onClose,
  onCaptureMemory,
  onCreatePost,
  onLogQuest,
}: {
  onClose: () => void;
  onCaptureMemory: () => void;
  onCreatePost: () => void;
  onLogQuest?: () => void;
}) {
  const actions: CreateAction[] = [
    {
      key: "memory",
      icon: Camera,
      title: "Capture a Memory",
      subtitle: "A 24-hour campus moment",
      onSelect: onCaptureMemory,
      accent: "cq-create-action--memory",
    },
    {
      key: "post",
      icon: PenSquare,
      title: "Create Quad Post",
      subtitle: "Share a photo or update",
      onSelect: onCreatePost,
      accent: "cq-create-action--post",
    },
  ];

  if (onLogQuest) {
    actions.push({
      key: "quest",
      icon: ScrollText,
      title: "Log Quest Progress",
      subtitle: "Record what you accomplished",
      onSelect: onLogQuest,
      accent: "cq-create-action--quest",
    });
  }

  return (
    <div
      className="cq-create-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Create"
      onClick={onClose}
    >
      <div className="cq-create-sheet" onClick={(e) => e.stopPropagation()}>
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
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                className={`cq-create-action ${action.accent}`}
                onClick={action.onSelect}
              >
                <span className="cq-create-action-icon" aria-hidden>
                  <Icon className="h-6 w-6" strokeWidth={2.1} />
                </span>
                <span className="cq-create-action-text">
                  <span className="cq-create-action-title">{action.title}</span>
                  <span className="cq-create-action-subtitle">{action.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
