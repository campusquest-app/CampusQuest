"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Award,
  Building2,
  Calendar,
  ImageIcon,
  Plus,
  Type,
  X,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { FieldNoteComposer } from "@/components/FieldNoteComposer";
type QuadFeedTab = "public" | "friends" | "trending";

type PostType = "text" | "photo" | "event" | "achievement" | "organization";

const POST_TYPES: {
  id: PostType;
  label: string;
  description: string;
  icon: typeof Type;
}[] = [
  { id: "text", label: "Text Post", description: "Share a campus moment", icon: Type },
  { id: "photo", label: "Photo Post", description: "Add an image to your post", icon: ImageIcon },
  { id: "event", label: "Event Post", description: "Promote something happening", icon: Calendar },
  { id: "achievement", label: "Achievement Post", description: "Celebrate a win", icon: Award },
  { id: "organization", label: "Organization Update", description: "Share org news", icon: Building2 },
];

function baseFeedType(feedTab: QuadFeedTab): "public" | "friends" {
  return feedTab === "friends" ? "friends" : "public";
}

function initialBodyForType(type: PostType): string {
  switch (type) {
    case "event":
      return "What's happening on campus: ";
    case "achievement":
      return "Just unlocked: ";
    case "organization":
      return "Org update: ";
    default:
      return "";
  }
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
  const [postType, setPostType] = useState<PostType | null>(null);
  const [tapBurst, setTapBurst] = useState(false);

  function handleFabTap() {
    setTapBurst(true);
    window.setTimeout(() => setTapBurst(false), 380);
    setPostType(null);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setPostType(null);
  }

  function handleSelectType(type: PostType) {
    setPostType(type);
  }

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
        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quad-create-post-title"
        onClick={handleClose}
      >
        <div
          className="cq-create-post-modal w-full max-w-lg max-h-[min(88vh,calc(100dvh-var(--cq-topnav-h,64px)-env(safe-area-inset-bottom,0px)-1rem))] overflow-y-auto rounded-2xl border shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cq-create-post-modal-header sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md">
            <h3 id="quad-create-post-title" className="font-display text-sm font-bold tracking-wide">
              {postType ? "Create Post" : "What do you want to share?"}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {postType == null ? (
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {POST_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleSelectType(type.id)}
                    className="cq-create-post-type-card flex items-start gap-3 rounded-xl px-3 py-3 text-left active:scale-[0.98]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-uri-keaney/35 bg-uri-keaney/15 text-uri-keaney">
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0">
                      <span className="cq-create-post-type-card-title block text-sm font-semibold">{type.label}</span>
                      <span className="cq-create-post-type-card-desc mt-0.5 block text-[11px] leading-snug">
                        {type.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4">
              <button type="button" onClick={() => setPostType(null)} className="cq-composer-back-link">
                ← Choose a different post type
              </button>
              <FieldNoteComposer
                key={`${feedTab}-${postType}-${open}`}
                character={character}
                defaultVisibility={baseFeedType(feedTab)}
                initialBody={initialBodyForType(postType)}
                autoOpenPhotoPicker={postType === "photo"}
                onPosted={() => {
                  onPosted();
                  handleClose();
                }}
              />
            </div>
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
