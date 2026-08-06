"use client";

import { ApiRequestError } from "@/lib/client/dashboardApi";
import { captureVideoPoster, probeVideoFile, revokeVideoObjectUrl } from "@/lib/client/probeVideoFile";
import { prepareQuadImage } from "@/lib/client/prepareQuadImage";
import {
  formatUploadStageError,
  logQuadUpload,
  logQuadUploadError,
} from "@/lib/client/quadUploadLog";
import { uploadFormDataWithProgress } from "@/lib/client/uploadImageWithProgress";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  QUAD_UPLOAD_QUEUE_CONCURRENCY,
  carouselMaxItemsErrorMessage,
  filterCarouselFiles,
  mediaFileFingerprint,
  resolveQuadPostTotalUploadBytes,
} from "@/lib/quadMedia";
import { resolveQuadVideoMaxBytes } from "@/lib/quadVideo";

const MAX_UPLOAD_ATTEMPTS = 3;

export type CarouselItemStage =
  | "waiting"
  | "preparing"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export type ComposerCarouselItem = {
  /** Stable client id — survives reorder. */
  clientId: string;
  kind: "image" | "video";
  file: File;
  fingerprint: string;
  previewUrl: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  stage: CarouselItemStage;
  percent: number;
  error?: string;
  mediaId?: string;
  playbackUrl?: string;
  thumbnailUrl?: string | null;
  abort?: AbortController;
  idempotencyKey: string;
};

export type UploadedCarouselMedia = {
  clientId: string;
  mediaId: string;
  mediaType: "image" | "video";
  sortOrder: number;
  playbackUrl: string;
  thumbnailUrl: string | null;
};

type MediaUploadResult = {
  mediaId: string;
  playbackUrl: string;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
};

export function createCarouselItemFromFile(file: File, kind: "image" | "video"): ComposerCarouselItem {
  return {
    clientId: crypto.randomUUID(),
    kind,
    file,
    fingerprint: mediaFileFingerprint(file),
    previewUrl: URL.createObjectURL(file),
    stage: "waiting",
    percent: 0,
    idempotencyKey: `cq-${crypto.randomUUID()}`,
  };
}

export function revokeCarouselItem(item: ComposerCarouselItem) {
  item.abort?.abort();
  revokeVideoObjectUrl(item.previewUrl);
}

export function canAddMoreItems(count: number): boolean {
  return count < QUAD_CAROUSEL_MAX_ITEMS;
}

export function filterNewFiles(existing: ComposerCarouselItem[], files: File[]): {
  accepted: File[];
  rejectedReason?: string;
} {
  const { acceptedIndexes, rejectedReason } = filterCarouselFiles(existing, files);
  return { accepted: acceptedIndexes.map((i) => files[i]!), rejectedReason };
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof ApiRequestError && error.code === "ABORTED")
  );
}

async function uploadOne(item: ComposerCarouselItem, onUpdate: (next: ComposerCarouselItem) => void): Promise<void> {
  const controller = new AbortController();
  let current: ComposerCarouselItem = {
    ...item,
    abort: controller,
    stage: "preparing",
    percent: Math.max(item.percent, 2),
    error: undefined,
  };
  onUpdate(current);

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        logQuadUpload("upload_retry", {
          clientId: current.clientId,
          attempt,
          kind: current.kind,
          filename: current.file.name,
        });
        current = { ...current, stage: "preparing", percent: 5, error: undefined, abort: controller };
        onUpdate(current);
        await sleep(400 * attempt);
      }

      const form = new FormData();
      form.append("kind", current.kind);
      form.append("idempotencyKey", current.idempotencyKey);

      if (current.kind === "video") {
        const maxBytes = resolveQuadVideoMaxBytes(
          typeof process !== "undefined" ? process.env.NEXT_PUBLIC_QUAD_VIDEO_MAX_BYTES : undefined,
        );
        if (current.file.size > maxBytes) {
          throw new Error("This video file is too large.");
        }
        logQuadUpload("file_meta", {
          kind: "video",
          filename: current.file.name,
          mime: current.file.type,
          size: current.file.size,
        });
        const probed = await probeVideoFile(current.file);
        current = {
          ...current,
          durationSeconds: probed.durationSeconds,
          width: probed.width,
          height: probed.height,
          hasAudio: probed.hasAudio,
          percent: 18,
        };
        onUpdate(current);
        form.append("file", probed.file, probed.file.name || "video.mp4");
        form.append("durationSeconds", String(probed.durationSeconds));
        form.append("width", String(probed.width || 0));
        form.append("height", String(probed.height || 0));
        form.append("hasAudio", probed.hasAudio ? "true" : "false");
        try {
          logQuadUpload("thumbnail", { clientId: current.clientId });
          const poster = await captureVideoPoster(probed.objectUrl);
          form.append("poster", poster, "poster.jpg");
        } catch (posterError) {
          // Requirement: thumbnail/cover failure must not cancel the media upload.
          logQuadUploadError("thumbnail", posterError, { clientId: current.clientId });
        }
        revokeVideoObjectUrl(probed.objectUrl);
      } else {
        const prepared = await prepareQuadImage(current.file);
        current = {
          ...current,
          width: prepared.width ?? current.width,
          height: prepared.height ?? current.height,
          percent: 20,
        };
        onUpdate(current);
        form.append("file", prepared.file, prepared.file.name || "photo.jpg");
        if (prepared.width) form.append("width", String(prepared.width));
        if (prepared.height) form.append("height", String(prepared.height));
      }

      current = { ...current, stage: "uploading", percent: Math.max(current.percent, 25) };
      onUpdate(current);
      logQuadUpload("upload_start", {
        clientId: current.clientId,
        attempt,
        kind: current.kind,
        filename: current.file.name,
        size: current.file.size,
      });

      const data = await uploadFormDataWithProgress<MediaUploadResult>({
        path: "/api/quad/posts/media",
        form,
        signal: controller.signal,
        onProgress: (fraction) => {
          const percent = Math.round(25 + fraction * 60);
          current = { ...current, stage: "uploading", percent };
          onUpdate(current);
          logQuadUpload("upload_progress", {
            clientId: current.clientId,
            percent,
            attempt,
          });
        },
      });

      current = { ...current, stage: "processing", percent: 90 };
      onUpdate(current);
      logQuadUpload("supabase_response", {
        clientId: current.clientId,
        mediaId: data.mediaId,
        playbackUrl: data.playbackUrl,
        thumbnailUrl: data.thumbnailUrl ?? data.posterUrl ?? null,
      });

      if (!data.mediaId || !data.playbackUrl) {
        throw new Error("Upload succeeded but the server did not return a media id.");
      }

      current = {
        ...current,
        stage: "ready",
        percent: 100,
        mediaId: data.mediaId,
        playbackUrl: data.playbackUrl,
        thumbnailUrl: data.thumbnailUrl ?? data.posterUrl ?? null,
        abort: undefined,
        error: undefined,
      };
      onUpdate(current);
      logQuadUpload("upload_complete", { clientId: current.clientId, mediaId: data.mediaId });
      return;
    } catch (error) {
      lastError = error;
      if (isAbortError(error)) {
        onUpdate({ ...current, stage: "waiting", percent: 0, abort: undefined, error: undefined });
        return;
      }
      logQuadUploadError("item_failed", error, {
        clientId: current.clientId,
        attempt,
        kind: current.kind,
        filename: current.file.name,
        size: current.file.size,
        mime: current.file.type,
      });
      // Non-retryable auth errors stop immediately.
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        break;
      }
    }
  }

  const message =
    lastError instanceof Error && lastError.message.trim()
      ? lastError.message.trim()
      : formatUploadStageError("item_failed", lastError);
  onUpdate({
    ...current,
    stage: "failed",
    // Keep last progress so the UI does not snap back to a blank 0% forever.
    percent: Math.max(current.percent, 5),
    error: message,
    abort: undefined,
  });
}

/** Process waiting/failed-retry items with limited concurrency. One failure never cancels others. */
export async function runCarouselUploadQueue(
  items: ComposerCarouselItem[],
  onUpdate: (clientId: string, next: ComposerCarouselItem) => void,
  opts?: { onlyClientIds?: Set<string> },
): Promise<void> {
  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0);
  const maxTotal = resolveQuadPostTotalUploadBytes(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_QUAD_POST_TOTAL_UPLOAD_BYTES : undefined,
  );
  if (totalBytes > maxTotal) {
    for (const item of items) {
      if (item.stage !== "ready") {
        onUpdate(item.clientId, {
          ...item,
          stage: "failed",
          error: "This post’s media is too large.",
        });
      }
    }
    return;
  }

  const pending = items.filter((i) => {
    if (opts?.onlyClientIds && !opts.onlyClientIds.has(i.clientId)) return false;
    return i.stage === "waiting" || i.stage === "failed";
  });

  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const item = pending[index++]!;
      await uploadOne(item, (next) => onUpdate(next.clientId, next));
    }
  }
  const workers = Array.from({ length: Math.min(QUAD_UPLOAD_QUEUE_CONCURRENCY, pending.length) }, () => worker());
  await Promise.all(workers);
}

export function overallUploadProgress(items: ComposerCarouselItem[]): number {
  if (items.length === 0) return 0;
  return Math.round(items.reduce((s, i) => s + i.percent, 0) / items.length);
}

export function allCarouselItemsReady(items: ComposerCarouselItem[]): boolean {
  return items.length > 0 && items.every((i) => i.stage === "ready" && Boolean(i.mediaId));
}

export function toPublishMediaItems(items: ComposerCarouselItem[]): UploadedCarouselMedia[] {
  return items.map((item, sortOrder) => ({
    clientId: item.clientId,
    mediaId: item.mediaId!,
    mediaType: item.kind,
    sortOrder,
    playbackUrl: item.playbackUrl!,
    thumbnailUrl: item.thumbnailUrl ?? null,
  }));
}
