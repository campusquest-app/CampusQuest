"use client";

import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError } from "@/lib/client/dashboardApi";
import { captureVideoPoster, probeVideoFile, revokeVideoObjectUrl } from "@/lib/client/probeVideoFile";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  QUAD_UPLOAD_QUEUE_CONCURRENCY,
  carouselMaxItemsErrorMessage,
  filterCarouselFiles,
  mediaFileFingerprint,
  resolveQuadPostTotalUploadBytes,
} from "@/lib/quadMedia";
import { resolveQuadVideoMaxBytes } from "@/lib/quadVideo";

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

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new ApiRequestError("Session expired. Please sign in again.", 401, "UNAUTHORIZED");
  return { Authorization: `Bearer ${token}` };
}

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

async function uploadOne(item: ComposerCarouselItem, onUpdate: (next: ComposerCarouselItem) => void): Promise<void> {
  const controller = new AbortController();
  let current: ComposerCarouselItem = { ...item, abort: controller, stage: "preparing", percent: 5, error: undefined };
  onUpdate(current);

  try {
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
      const probed = await probeVideoFile(current.file);
      current = {
        ...current,
        durationSeconds: probed.durationSeconds,
        width: probed.width,
        height: probed.height,
        hasAudio: probed.hasAudio,
        percent: 20,
      };
      onUpdate(current);
      form.append("file", probed.file, probed.file.name || "video.mp4");
      form.append("durationSeconds", String(probed.durationSeconds));
      form.append("width", String(probed.width || 0));
      form.append("height", String(probed.height || 0));
      form.append("hasAudio", probed.hasAudio ? "true" : "false");
      try {
        const poster = await captureVideoPoster(probed.objectUrl);
        form.append("poster", poster, "poster.jpg");
      } catch {
        // optional
      }
      revokeVideoObjectUrl(probed.objectUrl);
    } else {
      form.append("file", current.file, current.file.name || "photo.jpg");
    }

    current = { ...current, stage: "uploading", percent: 35 };
    onUpdate(current);

    const response = await fetch("/api/quad/posts/media", {
      method: "POST",
      headers: authHeaders(),
      body: form,
      signal: controller.signal,
      credentials: "include",
    });

    current = { ...current, stage: "processing", percent: 85 };
    onUpdate(current);

    const json = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: {
        mediaId: string;
        playbackUrl: string;
        thumbnailUrl?: string | null;
        posterUrl?: string | null;
      };
      error?: { message?: string };
    } | null;

    if (!response.ok || !json?.ok || !json.data?.mediaId) {
      throw new Error(json?.error?.message || "We couldn’t process this media. Try another file.");
    }

    current = {
      ...current,
      stage: "ready",
      percent: 100,
      mediaId: json.data.mediaId,
      playbackUrl: json.data.playbackUrl,
      thumbnailUrl: json.data.thumbnailUrl ?? json.data.posterUrl ?? null,
      abort: undefined,
    };
    onUpdate(current);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      onUpdate({ ...current, stage: "waiting", percent: 0, abort: undefined });
      return;
    }
    onUpdate({
      ...current,
      stage: "failed",
      percent: 0,
      error: error instanceof Error ? error.message : "Upload failed.",
      abort: undefined,
    });
  }
}

/** Process waiting/failed-retry items with limited concurrency. */
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
