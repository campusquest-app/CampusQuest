"use client";

import { waitForClientAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { captureVideoPoster, probeVideoFile, revokeVideoObjectUrl } from "@/lib/client/probeVideoFile";
import { prepareQuadImage } from "@/lib/client/prepareQuadImage";
import {
  formatUploadStageError,
  logQuadUpload,
  logQuadUploadError,
  type QuadUploadStage,
} from "@/lib/client/quadUploadLog";
import { uploadFormDataWithProgress } from "@/lib/client/uploadImageWithProgress";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  QUAD_UPLOAD_QUEUE_CONCURRENCY,
  filterCarouselFiles,
  mediaFileFingerprint,
  resolveQuadPostTotalUploadBytes,
} from "@/lib/quadMedia";
import { resolveQuadVideoMaxBytes } from "@/lib/quadVideo";

const MAX_UPLOAD_ATTEMPTS = 3;
const IS_DEV = process.env.NODE_ENV !== "production";

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
  /** Real upload progress 0–100 when stage is uploading; otherwise stage marker. */
  percent: number;
  error?: string;
  /** Dev-only diagnostic: stage + original error. */
  diagnostic?: string;
  failedStage?: QuadUploadStage;
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

/** Reset a failed item so the queue restarts with a fresh storage identity. */
export function resetCarouselItemForRetry(item: ComposerCarouselItem): ComposerCarouselItem {
  item.abort?.abort();
  return {
    ...item,
    abort: undefined,
    stage: "waiting",
    percent: 0,
    error: undefined,
    diagnostic: undefined,
    failedStage: undefined,
    mediaId: undefined,
    playbackUrl: undefined,
    thumbnailUrl: undefined,
    // Fresh key → new server path (no reuse of a failed/partial media row).
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

export function carouselHasBlockingMedia(items: ComposerCarouselItem[]): boolean {
  return items.some(
    (i) =>
      i.stage === "waiting" ||
      i.stage === "preparing" ||
      i.stage === "uploading" ||
      i.stage === "processing" ||
      i.stage === "failed",
  );
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

function userFacingError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "Upload failed. Please try again.";
}

function diagnosticFor(stage: QuadUploadStage, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof ApiRequestError ? ` status=${error.status}` : "";
  const code = error instanceof ApiRequestError && error.code ? ` code=${error.code}` : "";
  return `stage=${stage}${status}${code}: ${message}`;
}

async function uploadOne(item: ComposerCarouselItem, onUpdate: (next: ComposerCarouselItem) => void): Promise<void> {
  const controller = new AbortController();
  let current: ComposerCarouselItem = {
    ...item,
    abort: controller,
    stage: "preparing",
    percent: 0,
    error: undefined,
    diagnostic: undefined,
    failedStage: undefined,
  };
  onUpdate(current);

  let lastError: unknown;
  let lastStage: QuadUploadStage = "item_failed";

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        lastStage = "upload_retry";
        logQuadUpload("upload_retry", {
          clientId: current.clientId,
          attempt,
          kind: current.kind,
          filename: current.file.name,
        });
        current = {
          ...current,
          stage: "preparing",
          percent: 0,
          error: undefined,
          diagnostic: undefined,
          abort: controller,
          // New path identity on each automatic retry too.
          idempotencyKey: `cq-${crypto.randomUUID()}`,
        };
        onUpdate(current);
        await sleep(400 * attempt);
      }

      lastStage = "mime_detect";
      const hasToken = await waitForClientAccessToken(800);
      if (!hasToken) {
        throw new Error("You need to be signed in to upload media.");
      }
      logQuadUpload("file_meta", {
        clientId: current.clientId,
        authenticated: true,
        kind: current.kind,
        filename: current.file.name,
        mime: current.file.type,
        size: current.file.size,
        attempt,
      });

      const form = new FormData();
      form.append("kind", current.kind);
      form.append("idempotencyKey", current.idempotencyKey);

      if (current.kind === "video") {
        lastStage = "file_meta";
        const maxBytes = resolveQuadVideoMaxBytes(
          typeof process !== "undefined" ? process.env.NEXT_PUBLIC_QUAD_VIDEO_MAX_BYTES : undefined,
        );
        if (current.file.size <= 0) throw new Error("Selected video is empty.");
        if (current.file.size > maxBytes) throw new Error("This video file is too large.");

        const probed = await probeVideoFile(current.file);
        current = {
          ...current,
          durationSeconds: probed.durationSeconds,
          width: probed.width,
          height: probed.height,
          hasAudio: probed.hasAudio,
        };
        onUpdate(current);
        logQuadUpload("dimensions", {
          width: probed.width,
          height: probed.height,
          durationSeconds: probed.durationSeconds,
        });

        if (!(probed.file instanceof Blob) || probed.file.size <= 0) {
          throw new Error("Video file was empty after validation.");
        }
        form.append("file", probed.file, probed.file.name || "video.mp4");
        form.append("durationSeconds", String(probed.durationSeconds));
        form.append("width", String(probed.width || 0));
        form.append("height", String(probed.height || 0));
        form.append("hasAudio", probed.hasAudio ? "true" : "false");
        try {
          lastStage = "thumbnail";
          logQuadUpload("thumbnail", { clientId: current.clientId });
          const poster = await captureVideoPoster(probed.objectUrl);
          if (poster.size > 0) form.append("poster", poster, "poster.jpg");
        } catch (posterError) {
          // Thumbnail/cover failure must not cancel the media upload.
          logQuadUploadError("thumbnail", posterError, { clientId: current.clientId });
        }
        revokeVideoObjectUrl(probed.objectUrl);
      } else {
        lastStage = "compression";
        const prepared = await prepareQuadImage(current.file);
        if (!(prepared.file instanceof Blob) || prepared.file.size <= 0) {
          throw new Error("Prepared image is empty.");
        }
        if (!prepared.file.type) {
          throw new Error("Prepared image is missing a content type.");
        }
        current = {
          ...current,
          width: prepared.width ?? current.width,
          height: prepared.height ?? current.height,
        };
        onUpdate(current);
        form.append("file", prepared.file, prepared.file.name || "photo.jpg");
        if (prepared.width) form.append("width", String(prepared.width));
        if (prepared.height) form.append("height", String(prepared.height));
      }

      lastStage = "upload_start";
      current = { ...current, stage: "uploading", percent: 0 };
      onUpdate(current);
      logQuadUpload("upload_start", {
        clientId: current.clientId,
        attempt,
        kind: current.kind,
        filename: current.file.name,
        size: current.file.size,
        bucket: "quad-post-images",
      });

      const data = await uploadFormDataWithProgress<MediaUploadResult>({
        path: "/api/quad/posts/media",
        form,
        signal: controller.signal,
        onProgress: (fraction) => {
          const percent = Math.round(fraction * 100);
          current = { ...current, stage: "uploading", percent };
          onUpdate(current);
          logQuadUpload("upload_progress", {
            clientId: current.clientId,
            percent,
            attempt,
          });
        },
      });

      lastStage = "supabase_response";
      current = { ...current, stage: "processing", percent: 100 };
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

      lastStage = "upload_complete";
      current = {
        ...current,
        stage: "ready",
        percent: 100,
        mediaId: data.mediaId,
        playbackUrl: data.playbackUrl,
        thumbnailUrl: data.thumbnailUrl ?? data.posterUrl ?? null,
        abort: undefined,
        error: undefined,
        diagnostic: undefined,
        failedStage: undefined,
      };
      onUpdate(current);
      logQuadUpload("upload_complete", { clientId: current.clientId, mediaId: data.mediaId });
      return;
    } catch (error) {
      lastError = error;
      if (isAbortError(error)) {
        // Do not treat abort as a sticky failure — leave waiting so UI can restart if still mounted.
        onUpdate({
          ...current,
          stage: "waiting",
          percent: 0,
          abort: undefined,
          error: undefined,
          diagnostic: undefined,
        });
        return;
      }
      logQuadUploadError(lastStage, error, {
        clientId: current.clientId,
        attempt,
        kind: current.kind,
        filename: current.file.name,
        size: current.file.size,
        mime: current.file.type,
      });
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        break;
      }
    }
  }

  const message = userFacingError(lastError);
  const diagnostic = diagnosticFor(lastStage, lastError);
  onUpdate({
    ...current,
    stage: "failed",
    // Never leave the UI stuck implying a permanent 0% blank state with no reason.
    percent: Math.max(current.percent, current.stage === "uploading" ? current.percent : 0),
    error: IS_DEV ? `${message} (${diagnostic})` : message,
    diagnostic,
    failedStage: lastStage,
    abort: undefined,
  });
}

/** Process waiting items with limited concurrency. One failure never cancels others. */
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
          diagnostic: "stage=file_meta: post total upload bytes exceeded",
          failedStage: "file_meta",
        });
      }
    }
    return;
  }

  const pending = items.filter((i) => {
    if (opts?.onlyClientIds && !opts.onlyClientIds.has(i.clientId)) return false;
    return i.stage === "waiting";
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
