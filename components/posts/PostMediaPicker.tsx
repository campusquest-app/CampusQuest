"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Video, X } from "lucide-react";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  carouselMaxItemsErrorMessage,
  looksLikeImageFile,
  looksLikeVideoFile,
} from "@/lib/quadMedia";
import { probeVideoFile, revokeVideoObjectUrl } from "@/lib/client/probeVideoFile";
import {
  createCarouselItemFromFile,
  filterNewFiles,
  revokeCarouselItem,
  type ComposerCarouselItem,
} from "@/lib/client/quadMediaUploadQueue";
import { ComposerCarouselEditor } from "@/components/posts/ComposerCarouselEditor";

export type PickedMedia =
  | { kind: "none" }
  | { kind: "carousel"; items: ComposerCarouselItem[]; coverClientId: string | null }
  /** @deprecated single-image seed — converted to carousel by FAB */
  | { kind: "image"; dataUrl: string }
  /** @deprecated single-video seed */
  | { kind: "video"; file: File; previewUrl: string; durationSeconds: number };

/**
 * Multi-select Photo/Video picker with carousel editor before compose.
 */
export function PostMediaPicker({
  onClose,
  onNext,
}: {
  onClose: () => void;
  onNext: (media: PickedMedia) => void;
}) {
  const [items, setItems] = useState<ComposerCarouselItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coverClientId, setCoverClientId] = useState<string | null>(null);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);

  function clearAll() {
    for (const item of items) revokeCarouselItem(item);
    setItems([]);
    setActiveIndex(0);
    setCoverClientId(null);
  }

  async function appendFiles(fileList: File[] | FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const { accepted, rejectedReason } = filterNewFiles(items, files);
    if (rejectedReason && accepted.length === 0) {
      setError(rejectedReason);
      return;
    }
    setError(rejectedReason ?? null);

    const nextItems: ComposerCarouselItem[] = [];
    for (const file of accepted) {
      const isVideo = looksLikeVideoFile(file);
      const isImage = looksLikeImageFile(file);
      if (!isVideo && !isImage) {
        console.error("[cq][quad-media] unsupported_selection", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        setError(
          `This media format is not supported${file.type ? ` (${file.type})` : file.name ? ` (${file.name})` : ""}.`,
        );
        continue;
      }
      if (isVideo) {
        try {
          const probed = await probeVideoFile(file);
          const item = createCarouselItemFromFile(probed.file, "video");
          revokeVideoObjectUrl(item.previewUrl);
          item.previewUrl = probed.objectUrl;
          item.durationSeconds = probed.durationSeconds;
          item.width = probed.width;
          item.height = probed.height;
          item.hasAudio = probed.hasAudio;
          nextItems.push(item);
        } catch (err) {
          console.error("[cq][quad-media] video_probe_failed", err);
          setError(err instanceof Error ? err.message : "Could not read that video.");
        }
      } else {
        console.info("[cq][quad-media] image_selection", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        nextItems.push(createCarouselItemFromFile(file, "image"));
      }
    }
    if (nextItems.length === 0) return;
    setItems((prev) => {
      const merged = [...prev, ...nextItems];
      if (!coverClientId && merged[0]) setCoverClientId(merged[0].clientId);
      setActiveIndex(merged.length - 1);
      return merged;
    });
  }

  function handleReorder(from: number, to: number) {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      setActiveIndex(to);
      return next;
    });
  }

  function handleRemove(clientId: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.clientId === clientId);
      if (target) revokeCarouselItem(target);
      const next = prev.filter((i) => i.clientId !== clientId);
      if (coverClientId === clientId) setCoverClientId(next[0]?.clientId ?? null);
      setActiveIndex((idx) => Math.max(0, Math.min(idx, next.length - 1)));
      return next;
    });
  }

  function handleNext() {
    if (items.length === 0) {
      onNext({ kind: "none" });
      return;
    }
    onNext({
      kind: "carousel",
      items,
      coverClientId: coverClientId ?? items[0]?.clientId ?? null,
    });
  }

  return (
    <div className="cq-mediapicker">
      <header className="cq-composer-head">
        <button type="button" onClick={onClose} className="cq-composer-head-icon" aria-label="Close">
          <X className="h-5 w-5" strokeWidth={2.2} />
        </button>
        <span className="cq-composer-head-title">New Post</span>
        <button type="button" onClick={handleNext} className="cq-composer-head-post cq-composer-head-post--ready">
          Next
        </button>
      </header>

      <div className="cq-mediapicker-stage px-3">
        {items.length > 0 ? (
          <ComposerCarouselEditor
            items={items}
            activeIndex={activeIndex}
            coverClientId={coverClientId}
            previewMuted={previewMuted}
            onSelectIndex={setActiveIndex}
            onReorder={handleReorder}
            onRemove={handleRemove}
            onRetry={() => undefined}
            onAddMore={(files) => void appendFiles(files)}
            onSetCover={setCoverClientId}
            onTogglePreviewMute={() => setPreviewMuted((m) => !m)}
          />
        ) : (
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="cq-mediapicker-empty"
            aria-label="Choose photos or videos"
          >
            <span className="cq-mediapicker-empty-glow" aria-hidden />
            <ImagePlus className="h-12 w-12" strokeWidth={1.5} />
            <p className="cq-mediapicker-empty-title">Add photos and videos</p>
            <p className="cq-mediapicker-empty-sub">
              Up to {QUAD_CAROUSEL_MAX_ITEMS} · tap to choose from your library
            </p>
          </button>
        )}
      </div>

      {error ? (
        <p className="cq-composer-error px-4" role="alert">
          {error}
        </p>
      ) : (
        <p className="px-4 text-center text-xs text-white/45">{carouselMaxItemsErrorMessage()}</p>
      )}

      <input
        ref={libraryRef}
        type="file"
        accept="image/*,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v,.heic,.heif"
        multiple
        onChange={(e) => {
          void appendFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
        aria-label="Choose photos or videos from library"
      />
      <input
        ref={cameraPhotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          void appendFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
        aria-label="Take a photo"
      />
      <input
        ref={cameraVideoRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={(e) => {
          void appendFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
        aria-label="Record a video"
      />

      <div className="cq-mediapicker-actions">
        <button
          type="button"
          onClick={() => cameraPhotoRef.current?.click()}
          className="cq-mediapicker-action"
          disabled={items.length >= QUAD_CAROUSEL_MAX_ITEMS}
        >
          <Camera className="h-5 w-5" />
          <span>Photo</span>
        </button>
        <button
          type="button"
          onClick={() => cameraVideoRef.current?.click()}
          className="cq-mediapicker-action"
          disabled={items.length >= QUAD_CAROUSEL_MAX_ITEMS}
        >
          <Video className="h-5 w-5" />
          <span>Record</span>
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="cq-mediapicker-action"
          disabled={items.length >= QUAD_CAROUSEL_MAX_ITEMS}
        >
          <ImagePlus className="h-5 w-5" />
          <span>Photo/Video</span>
        </button>
        {items.length === 0 ? (
          <button type="button" onClick={() => onNext({ kind: "none" })} className="cq-mediapicker-action">
            <span>Text only</span>
          </button>
        ) : (
          <button type="button" onClick={clearAll} className="cq-mediapicker-action">
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  );
}
