"use client";

import { useRef } from "react";
import { GripVertical, ImagePlus, Trash2, Volume2, VolumeX, Play } from "lucide-react";
import type { ComposerCarouselItem } from "@/lib/client/quadMediaUploadQueue";
import { canAddMoreItems } from "@/lib/client/quadMediaUploadQueue";
import { QUAD_CAROUSEL_MAX_ITEMS, formatVideoDuration } from "@/lib/quadMedia";

export function ComposerCarouselEditor({
  items,
  activeIndex,
  coverClientId,
  previewMuted,
  onSelectIndex,
  onReorder,
  onRemove,
  onRetry,
  onAddMore,
  onSetCover,
  onTogglePreviewMute,
}: {
  items: ComposerCarouselItem[];
  activeIndex: number;
  coverClientId: string | null;
  previewMuted: boolean;
  onSelectIndex: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (clientId: string) => void;
  onRetry: (clientId: string) => void;
  onAddMore: (files: FileList | null) => void;
  onSetCover: (clientId: string) => void;
  onTogglePreviewMute: () => void;
}) {
  const addRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const active = items[activeIndex] ?? null;
  const count = items.length;

  if (!active) return null;

  return (
    <div className="cq-carousel-editor space-y-3">
      <div className="flex items-center justify-between px-1 text-xs text-white/60">
        <span>
          {activeIndex + 1} of {count}
        </span>
        <span>
          {count}/{QUAD_CAROUSEL_MAX_ITEMS}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-black">
        {active.kind === "video" ? (
          <video
            ref={videoRef}
            key={active.clientId}
            src={active.previewUrl}
            className="max-h-[50vh] w-full object-contain"
            playsInline
            muted={previewMuted}
            controls={false}
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              if (el.paused) void el.play().catch(() => undefined);
              else el.pause();
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.previewUrl}
            alt=""
            className="max-h-[50vh] w-full object-contain"
          />
        )}

        {active.kind === "video" ? (
          <>
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
              {formatVideoDuration(active.durationSeconds ?? 0)}
            </span>
            <button
              type="button"
              onClick={onTogglePreviewMute}
              className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label={previewMuted ? "Unmute video" : "Mute video"}
            >
              {previewMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                const el = videoRef.current;
                if (!el) return;
                if (el.paused) void el.play().catch(() => undefined);
                else el.pause();
              }}
              className="absolute bottom-2 left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label="Play or pause video"
            >
              <Play className="h-5 w-5" />
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => onRemove(active.clientId)}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white"
          aria-label="Remove media"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        <div className="absolute left-2 bottom-14 rounded bg-black/55 px-2 py-1 text-[11px] text-white">
          {active.stage === "ready"
            ? "Ready"
            : active.stage === "failed"
              ? active.error || "Failed"
              : active.stage === "waiting"
                ? "Waiting"
                : `${active.stage} ${active.percent}%`}
        </div>
      </div>

      {active.stage === "failed" ? (
        <button
          type="button"
          onClick={() => onRetry(active.clientId)}
          className="text-sm font-semibold text-uri-keaney"
        >
          Retry upload
        </button>
      ) : null}

      <div className="flex items-center gap-2 overflow-x-auto pb-1" data-no-drawer-swipe="true">
        {items.map((item, index) => (
          <div
            key={item.clientId}
            draggable
            onDragStart={() => {
              dragIndex.current = index;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex.current == null || dragIndex.current === index) return;
              onReorder(dragIndex.current, index);
              dragIndex.current = null;
            }}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${
              index === activeIndex ? "border-uri-keaney" : "border-transparent"
            }`}
          >
            <button type="button" className="h-full w-full" onClick={() => onSelectIndex(index)}>
              {item.kind === "video" ? (
                <video src={item.previewUrl} muted playsInline className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
              )}
            </button>
            <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-black/50 p-0.5 text-white">
              <GripVertical className="h-3 w-3" />
            </span>
            {coverClientId === item.clientId ? (
              <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] text-white">
                Cover
              </span>
            ) : null}
            {item.stage !== "ready" ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-semibold text-white">
                {item.stage === "failed" ? "!" : `${item.percent}%`}
              </span>
            ) : null}
          </div>
        ))}

        {canAddMoreItems(count) ? (
          <button
            type="button"
            onClick={() => addRef.current?.click()}
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-white/25 text-white/70"
            aria-label="Add more photos or videos"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-[10px]">Add</span>
          </button>
        ) : null}
      </div>

      <div className="flex gap-3 text-xs">
        {coverClientId !== active.clientId ? (
          <button type="button" className="font-semibold text-uri-keaney" onClick={() => onSetCover(active.clientId)}>
            Set as cover
          </button>
        ) : (
          <span className="text-white/45">Cover photo</span>
        )}
      </div>

      <input
        ref={addRef}
        type="file"
        accept="image/*,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          onAddMore(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
