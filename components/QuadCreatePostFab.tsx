"use client";

import {
  lockBodyScrollForModal,
  markCreatePostModalOpen,
  releaseModalViewportState,
  restoreBodyScrollLock,
} from "@/lib/client/modalViewportCleanup";
import { resetScrollChrome } from "@/lib/client/useScrollChrome";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import type { Character } from "@/lib/types";
import { FieldNoteComposer } from "@/components/FieldNoteComposer";
import { PostMediaPicker } from "@/components/posts/PostMediaPicker";

type QuadFeedTab = "public" | "friends" | "trending";
type Step = "media" | "compose";

function baseFeedType(feedTab: QuadFeedTab): "public" | "friends" {
  return feedTab === "friends" ? "friends" : "public";
}

export function QuadCreatePostFab({
  feedTab,
  character,
  onPosted,
}: {
  feedTab: QuadFeedTab;
  character: Character;
  onPosted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("media");
  const [pendingImage, setPendingImage] = useState("");
  const [tapBurst, setTapBurst] = useState(false);
  const dirtyRef = useRef(false);

  function handleFabTap() {
    setTapBurst(true);
    window.setTimeout(() => setTapBurst(false), 380);
    dirtyRef.current = false;
    setPendingImage("");
    setStep("media");
    setOpen(true);
  }

  const handleClose = useCallback(() => {
    dirtyRef.current = false;
    setOpen(false);
    setStep("media");
    setPendingImage("");
    releaseModalViewportState();
    resetScrollChrome();
  }, []);

  // Outside click / backdrop / Escape: confirm only when there is unsaved content.
  const requestClose = useCallback(() => {
    if (dirtyRef.current || pendingImage) {
      const confirmed = window.confirm("Discard this post? Your draft will be lost.");
      if (!confirmed) return;
    }
    handleClose();
  }, [handleClose, pendingImage]);

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
              initialImage={pendingImage}
              onClose={requestClose}
              onNext={(image) => {
                setPendingImage(image);
                setStep("compose");
              }}
            />
          ) : (
            <FieldNoteComposer
              key={`${feedTab}-${open}-compose`}
              character={character}
              defaultVisibility={baseFeedType(feedTab)}
              initialImage={pendingImage}
              onBack={() => setStep("media")}
              onCancel={requestClose}
              onDirtyChange={(d) => {
                dirtyRef.current = d;
              }}
              onPosted={() => {
                onPosted();
                handleClose();
              }}
            />
          )}
        </div>
      </div>
    ) : null;

  if (typeof document === "undefined") return null;

  return (
    <>
      {createPortal(fab, document.body)}
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
