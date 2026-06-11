"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { FieldNote } from "@/lib/types";
import type { QuadComment } from "@/lib/types";
import { FieldNoteCard } from "@/components/FieldNoteCard";

export function ProfilePostDetail({
  note,
  currentUserId,
  currentUser,
  comments,
  likePending,
  onClose,
  onNod,
  onHype,
  onVerify,
  onAssist,
  onAddComment,
  onPostUpdated,
  onPostDeleted,
}: {
  note: FieldNote;
  currentUserId: string;
  currentUser: { id: string; name: string; username: string; avatar: string };
  comments: QuadComment[];
  likePending?: boolean;
  onClose: () => void;
  onNod: (noteId: string) => void;
  onHype: (noteId: string) => void;
  onVerify: (noteId: string) => void;
  onAssist: (noteId: string) => void;
  onAddComment?: (noteId: string, body: string) => void;
  onPostUpdated?: (note: FieldNote) => void;
  onPostDeleted?: (postId: string) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="cq-profile-post-detail fixed inset-0 z-[120] flex flex-col bg-cq-app" role="dialog" aria-modal="true" aria-label="Post detail">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-cq-border bg-cq-secondary px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="font-display text-base font-bold text-white">Post</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <FieldNoteCard
          note={note}
          currentUserId={currentUserId}
          comments={comments}
          onNod={onNod}
          onHype={onHype}
          onVerify={onVerify}
          onAssist={onAssist}
          onAddComment={onAddComment}
          currentUser={currentUser}
          likePending={likePending}
          variant="feed"
          onPostUpdated={onPostUpdated}
          onPostDeleted={(id) => {
            onPostDeleted?.(id);
            onClose();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
