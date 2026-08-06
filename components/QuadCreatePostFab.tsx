"use client";

import {
  lockBodyScrollForModal,
  markCreatePostModalOpen,
  releaseModalViewportState,
  restoreBodyScrollLock,
} from "@/lib/client/modalViewportCleanup";
import { resetScrollChrome } from "@/lib/client/useScrollChrome";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import type { Character } from "@/lib/types";
import type { QuadPostXpReward } from "@/lib/quadPostXp";
import { FieldNoteComposer } from "@/components/FieldNoteComposer";
import { PostMediaPicker, type PickedMedia } from "@/components/posts/PostMediaPicker";
import { QuadCreateActionSheet } from "@/components/QuadCreateActionSheet";
import { revokeVideoObjectUrl } from "@/lib/client/probeVideoFile";

type QuadFeedTab = "public" | "friends" | "trending";
type Step = "media" | "compose";
type View = "actions" | "post";

function baseFeedType(feedTab: QuadFeedTab): "public" | "friends" {
  return feedTab === "friends" ? "friends" : "public";
}

export function QuadCreatePostFab({
  feedTab,
  character,
  onPosted,
  onXpReward,
}: {
  feedTab: QuadFeedTab;
  character: Character;
  onPosted: () => void;
  onXpReward?: (reward: QuadPostXpReward) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("actions");
  const [step, setStep] = useState<Step>("media");
  const [pendingMedia, setPendingMedia] = useState<PickedMedia>({ kind: "none" });
  const [tapBurst, setTapBurst] = useState(false);
  const dirtyRef = useRef(false);

  useRegisterImmersiveScreen(open);

  function clearPendingMedia() {
    if (pendingMedia.kind === "video") {
      revokeVideoObjectUrl(pendingMedia.previewUrl);
    }
    if (pendingMedia.kind === "carousel") {
      for (const item of pendingMedia.items) {
        revokeVideoObjectUrl(item.previewUrl);
      }
    }
    setPendingMedia({ kind: "none" });
  }

  function handleFabTap() {
    setTapBurst(true);
    window.setTimeout(() => setTapBurst(false), 380);
    dirtyRef.current = false;
    clearPendingMedia();
    setStep("media");
    setView("actions");
    setOpen(true);
  }

  const handleClose = useCallback(() => {
    dirtyRef.current = false;
    setOpen(false);
    setView("actions");
    setStep("media");
    if (pendingMedia.kind === "video") {
      revokeVideoObjectUrl(pendingMedia.previewUrl);
    }
    if (pendingMedia.kind === "carousel") {
      // Ownership moves to composer after Next — only revoke if still on media step leftovers.
    }
    setPendingMedia({ kind: "none" });
    releaseModalViewportState();
    resetScrollChrome();
  }, [pendingMedia]);

  const requestClose = useCallback(() => {
    const hasMedia =
      pendingMedia.kind === "carousel"
        ? pendingMedia.items.length > 0
        : pendingMedia.kind !== "none";
    if (view === "post" && (dirtyRef.current || hasMedia)) {
      const confirmed = window.confirm("Discard this post? Your draft will be lost.");
      if (!confirmed) return;
    }
    handleClose();
  }, [handleClose, pendingMedia, view]);

  const startPostFlow = useCallback(() => {
    dirtyRef.current = false;
    setPendingMedia({ kind: "none" });
    setStep("media");
    setView("post");
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    markCreatePostModalOpen(true);
    lockBodyScrollForModal();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      restoreBodyScrollLock();
      markCreatePostModalOpen(false);
    };
  }, [open, requestClose]);

  const fab = (
    <button
      type="button"
      onClick={handleFabTap}
      className={`cq-quad-create-fab group fixed z-[45] flex items-center justify-center rounded-full touch-manipulation ${
        tapBurst ? "cq-quad-create-fab--tap" : ""
      }`}
      aria-label="Create post"
    >
      <Plus className="cq-quad-create-fab-icon transition-transform group-hover:scale-105" strokeWidth={2.5} />
    </button>
  );

  const modal =
    open && typeof document !== "undefined" ? (
      view === "actions" ? (
        <QuadCreateActionSheet onClose={handleClose} onCreatePost={startPostFlow} />
      ) : (
        <div
          className="cq-composer-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Create a new post"
          onClick={requestClose}
        >
          <div
            className={`cq-composer-shell cq-composer-shell--${step}`}
            onClick={(e) => e.stopPropagation()}
          >
            {step === "media" ? (
              <PostMediaPicker
                onClose={requestClose}
                onNext={(media) => {
                  setPendingMedia(media);
                  setStep("compose");
                }}
              />
            ) : (
              <FieldNoteComposer
                key={`${feedTab}-${open}-compose`}
                character={character}
                defaultVisibility={baseFeedType(feedTab)}
                initialImage={pendingMedia.kind === "image" ? pendingMedia.dataUrl : ""}
                initialVideo={
                  pendingMedia.kind === "video"
                    ? {
                        file: pendingMedia.file,
                        previewUrl: pendingMedia.previewUrl,
                        durationSeconds: pendingMedia.durationSeconds,
                      }
                    : null
                }
                initialCarousel={
                  pendingMedia.kind === "carousel"
                    ? {
                        items: pendingMedia.items,
                        coverClientId: pendingMedia.coverClientId,
                      }
                    : null
                }
                onBack={() => setStep("media")}
                onCancel={requestClose}
                onDirtyChange={(d) => {
                  dirtyRef.current = d;
                }}
                onPosted={() => {
                  onPosted();
                  handleClose();
                }}
                onXpReward={onXpReward}
              />
            )}
          </div>
        </div>
      )
    ) : null;

  if (typeof document === "undefined") return null;

  return (
    <>
      {createPortal(fab, document.body)}
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
