"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Award,
  Building2,
  Calendar,
  ImageIcon,
  Pencil,
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
      className={`cq-quad-create-fab group fixed z-[45] flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/40 bg-gradient-to-br from-cyan-400/95 via-cyan-500/90 to-cyan-700/90 text-white backdrop-blur-sm touch-manipulation sm:h-[4.5rem] sm:w-[4.5rem] ${
        tapBurst ? "cq-quad-create-fab--tap" : ""
      }`}
      aria-label="Create post"
    >
      <Plus className="h-7 w-7 transition-transform group-hover:scale-105 sm:h-8 sm:w-8" strokeWidth={2.5} />
      <Pencil
        className="pointer-events-none absolute -right-0.5 -top-0.5 h-3.5 w-3.5 text-cyan-100/80 opacity-0 transition-all duration-300 group-hover:opacity-100 sm:h-4 sm:w-4"
        strokeWidth={2.2}
        aria-hidden
      />
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
          className="w-full max-w-lg max-h-[min(88vh,calc(100dvh-var(--cq-topnav-h,64px)-env(safe-area-inset-bottom,0px)-1rem))] overflow-y-auto rounded-2xl border border-[rgba(100,180,255,0.15)] bg-cq-card shadow-[0_24px_64px_-16px_rgba(0,0,0,0.65)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgba(100,180,255,0.1)] bg-cq-card/95 px-4 py-3 backdrop-blur-md">
            <h3 id="quad-create-post-title" className="font-display text-sm font-bold tracking-wide text-white">
              {postType ? "Create Post" : "What do you want to share?"}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition hover:bg-white/[0.06] hover:text-white"
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
                    className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-left transition hover:border-cyan-400/25 hover:bg-cyan-500/[0.06] active:scale-[0.98]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{type.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-white/45">{type.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4">
              <button
                type="button"
                onClick={() => setPostType(null)}
                className="mb-3 text-xs font-medium text-cyan-300/70 transition hover:text-cyan-200"
              >
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
