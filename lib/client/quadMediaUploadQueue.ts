"use client";

import { waitForClientAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import {
  captureVideoPoster,
  probeVideoFile,
  revokeVideoObjectUrl,
  videoCodecSupportHints,
  VideoMediaTimeoutError,
} from "@/lib/client/probeVideoFile";
import { prepareQuadImage } from "@/lib/client/prepareQuadImage";
import {
  logMediaStage,
  logQuadUpload,
  logQuadUploadError,
  type QuadUploadStage,
} from "@/lib/client/quadUploadLog";
import { uploadFileToSignedUrl, uploadFormDataWithProgress } from "@/lib/client/uploadImageWithProgress";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  QUAD_UPLOAD_QUEUE_CONCURRENCY,
  filterCarouselFiles,
  mediaFileFingerprint,
  resolveQuadPostTotalUploadBytes,
} from "@/lib/quadMedia";
import {
  resolveQuadVideoMaxBytes,
  videoDurationErrorMessage,
  videoFormatErrorMessage,
  videoTooLargeErrorMessage,
} from "@/lib/quadVideo";

const MAX_UPLOAD_ATTEMPTS = 3;
const IS_DEV = process.env.NODE_ENV !== "production";
/** Hard ceiling for everything before the network request (token, probe, poster, compression). */
export const MEDIA_PREPARE_TIMEOUT_MS = 45_000;
/** Abort an upload that makes no progress (or gets no response) for this long. */
export const MEDIA_UPLOAD_STALL_TIMEOUT_MS = 120_000;
/** Media bytes go straight to Storage; these API calls carry only small JSON / a cover frame. */
export const MEDIA_UPLOAD_INIT_PATH = "/api/quad/posts/media/upload-init";
export const MEDIA_UPLOAD_COMPLETE_PATH = "/api/quad/posts/media/upload-complete";
export const MEDIA_UPLOAD_DISCARD_PATH = "/api/quad/posts/media/upload-discard";
/** Cover frames above this are skipped (optional, and the complete call must stay small). */
const MAX_POSTER_BYTES = 3 * 1024 * 1024;

/** Client ids currently owned by a running upload — guards against duplicate starts across re-renders. */
const inFlightClientIds = new Set<string>();

class MediaPrepareTimeoutError extends Error {
  constructor() {
    super("Preparing this media took too long. Tap Retry or remove it.");
    this.name = "MediaPrepareTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
  /** Stable for the item's lifetime: the server reuses the same media row for retries. */
  idempotencyKey: string;
  /** Server media row reserved by upload-init (set before bytes are sent). */
  uploadMediaId?: string;
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

type UploadInitResult =
  | { status: "ready"; media: MediaUploadResult }
  | {
      status: "upload";
      mediaId: string;
      signedUrl: string;
      contentType: string;
      upsert: boolean;
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

/** Reset a failed item so the queue restarts it. */
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
  };
}

export function revokeCarouselItem(item: ComposerCarouselItem) {
  item.abort?.abort();
  revokeVideoObjectUrl(item.previewUrl);
}

/** Best-effort release of an unattached server upload (the daily sweep catches misses). */
export function discardCarouselItemUpload(item: Pick<ComposerCarouselItem, "mediaId" | "uploadMediaId">) {
  const mediaId = item.mediaId ?? item.uploadMediaId;
  if (!mediaId) return;
  void postAuthed(MEDIA_UPLOAD_DISCARD_PATH, { mediaId }).catch(() => {});
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof ApiRequestError && error.code === "ABORTED")
  );
}

/** Deterministic local failures: retrying automatically just repeats the same wait. */
function isNonRetryablePrepareError(error: unknown): boolean {
  return (
    error instanceof MediaPrepareTimeoutError ||
    (error instanceof VideoMediaTimeoutError && error.step === "metadata") ||
    (error instanceof Error && !(error instanceof ApiRequestError) && STUDENT_SAFE_LOCAL_MESSAGES.has(error.message.trim()))
  );
}

/** Validation/authorization rejections repeat identically; transient ones are worth retrying. */
function isNonRetryableServerError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) return false;
  if (error.code === "STORAGE_OBJECT_TOO_LARGE") return true;
  if (error.code === "STORAGE_UPLOAD_FAILED" || error.code === "MEDIA_UPLOAD_MISSING") return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408;
}

const IMAGE_TOO_LARGE_MESSAGE = "This photo is too large to upload.";
const UNSUPPORTED_TYPE_MESSAGE = "This file type isn’t supported.";
const NETWORK_FAILURE_MESSAGE = "Upload failed. Check your connection and tap Retry.";

/** Local validation messages that are already written for students. */
const STUDENT_SAFE_LOCAL_MESSAGES = new Set<string>([
  videoTooLargeErrorMessage(),
  videoDurationErrorMessage(),
  videoFormatErrorMessage(),
  "You need to be signed in to upload media.",
  "This image format is not supported. Use JPG, PNG, WebP, or HEIC.",
  "This image is still too large after compression. Try a smaller photo.",
]);

/**
 * Students see a specific message for known validation problems and a generic one otherwise.
 * HTTP codes, Storage/Supabase details and server internals stay in the dev-only diagnostic.
 */
export function userFacingUploadError(error: unknown, kind: "image" | "video"): string {
  const generic =
    kind === "video" ? "This video couldn’t be uploaded. Please try again." : "This photo couldn’t be uploaded. Please try again.";
  const tooLarge = kind === "video" ? videoTooLargeErrorMessage() : IMAGE_TOO_LARGE_MESSAGE;

  if (error instanceof MediaPrepareTimeoutError) return error.message;
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case "VIDEO_TOO_LONG":
        return videoDurationErrorMessage();
      case "VIDEO_TOO_LARGE":
      case "IMAGE_TOO_LARGE":
      case "STORAGE_OBJECT_TOO_LARGE":
      case "PAYLOAD_TOO_LARGE":
        return tooLarge;
      case "VIDEO_FORMAT_UNSUPPORTED":
      case "IMAGE_FORMAT_UNSUPPORTED":
      case "IMAGE_HEIC_UNSUPPORTED_SERVER":
      case "MEDIA_CONTENT_TYPE_MISMATCH":
        return kind === "video" ? videoFormatErrorMessage() : UNSUPPORTED_TYPE_MESSAGE;
      case "NETWORK_ERROR":
      case "UPLOAD_STALLED":
        return NETWORK_FAILURE_MESSAGE;
      case "MEDIA_UPLOAD_PENDING_LIMIT":
        return "Too many uploads in progress. Wait a moment, then tap Retry.";
      default:
        break;
    }
    if (error.status === 413) return tooLarge;
    if (error.status === 401) return "Your session expired. Sign in again to upload.";
    return generic;
  }
  if (error instanceof Error && STUDENT_SAFE_LOCAL_MESSAGES.has(error.message.trim())) {
    return error.message.trim();
  }
  return generic;
}

function diagnosticFor(stage: QuadUploadStage, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof ApiRequestError ? ` status=${error.status}` : "";
  const code = error instanceof ApiRequestError && error.code ? ` code=${error.code}` : "";
  return `stage=${stage}${status}${code}: ${message}`;
}

type PreparedUpload = {
  file: Blob;
  contentType: string;
  init: {
    kind: "image" | "video";
    mimeType: string;
    fileSizeBytes: number;
    idempotencyKey: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    hasAudio?: boolean;
  };
  poster: Blob | null;
  patch: Partial<Pick<ComposerCarouselItem, "durationSeconds" | "width" | "height" | "hasAudio">>;
};

/** iOS sometimes reports an empty type for MOV/HEVC picks; fall back on the extension. */
function videoMimeFor(file: Blob & { name?: string }): string {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("video/")) return type;
  const ext = (file.name ?? "").split(".").pop()?.toLowerCase();
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "m4v") return "video/x-m4v";
  return "video/mp4";
}

/**
 * Everything before the network request. Must not touch UI state: it can be abandoned by
 * the preparation deadline, and a late resolution must not overwrite a failed item.
 */
async function prepareUpload(
  item: ComposerCarouselItem,
  setStage: (stage: QuadUploadStage) => void,
): Promise<PreparedUpload> {
  const startedMs = Date.now();
  logMediaStage("processing started", {
    clientId: item.clientId,
    kind: item.kind,
    mime: item.file.type || null,
    extension: item.file.name.split(".").pop()?.toLowerCase() ?? null,
    sizeBytes: item.file.size,
  });

  setStage("mime_detect");
  const hasToken = await waitForClientAccessToken(800);
  if (!hasToken) {
    throw new Error("You need to be signed in to upload media.");
  }
  logQuadUpload("file_meta", {
    clientId: item.clientId,
    authenticated: true,
    kind: item.kind,
    mime: item.file.type,
    size: item.file.size,
  });

  if (item.kind === "video") {
    setStage("file_meta");
    const maxBytes = resolveQuadVideoMaxBytes(
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_QUAD_VIDEO_MAX_BYTES : undefined,
    );
    if (item.file.size <= 0) throw new Error("Selected video is empty.");
    if (item.file.size > maxBytes) throw new Error(videoTooLargeErrorMessage());

    const probed = await probeVideoFile(item.file);
    try {
      logMediaStage("metadata loaded", {
        clientId: item.clientId,
        mime: probed.mimeType,
        durationSeconds: Number(probed.durationSeconds.toFixed(2)),
        width: probed.width,
        height: probed.height,
        hasAudio: probed.hasAudio,
        codecSupport: videoCodecSupportHints(),
      });
      if (!(probed.file instanceof Blob) || probed.file.size <= 0) {
        throw new Error("Video file was empty after validation.");
      }
      // Original bytes are uploaded as-is (no transcoding) — iPhone MOV/HEVC included.
      const mimeType = videoMimeFor(probed.file);

      setStage("thumbnail");
      const posterStartedMs = Date.now();
      logMediaStage("thumbnail started", { clientId: item.clientId });
      let poster: Blob | null = null;
      try {
        const captured = await captureVideoPoster(probed.objectUrl);
        if (captured.size > 0 && captured.size <= MAX_POSTER_BYTES) poster = captured;
        logMediaStage("thumbnail completed", {
          clientId: item.clientId,
          posterBytes: captured.size,
          ms: Date.now() - posterStartedMs,
        });
      } catch (posterError) {
        // The cover frame is optional; upload the video without it.
        logQuadUploadError("thumbnail", posterError, { clientId: item.clientId });
        logMediaStage("error", {
          clientId: item.clientId,
          stage: "thumbnail",
          recovered: true,
          message: posterError instanceof Error ? posterError.message : String(posterError),
          ms: Date.now() - posterStartedMs,
        });
      }
      logMediaStage("processing completed", { clientId: item.clientId, ms: Date.now() - startedMs });
      return {
        file: probed.file,
        contentType: mimeType,
        init: {
          kind: "video",
          mimeType,
          fileSizeBytes: probed.file.size,
          idempotencyKey: item.idempotencyKey,
          durationSeconds: probed.durationSeconds,
          width: probed.width || undefined,
          height: probed.height || undefined,
          hasAudio: probed.hasAudio,
        },
        poster,
        patch: {
          durationSeconds: probed.durationSeconds,
          width: probed.width,
          height: probed.height,
          hasAudio: probed.hasAudio,
        },
      };
    } finally {
      revokeVideoObjectUrl(probed.objectUrl);
    }
  }

  setStage("compression");
  const prepared = await prepareQuadImage(item.file);
  if (!(prepared.file instanceof Blob) || prepared.file.size <= 0) {
    throw new Error("Prepared image is empty.");
  }
  if (!prepared.file.type) {
    throw new Error("Prepared image is missing a content type.");
  }
  logMediaStage("processing completed", {
    clientId: item.clientId,
    ms: Date.now() - startedMs,
    preparedBytes: prepared.file.size,
    preparedMime: prepared.file.type,
  });
  const imageMime = prepared.file.type.toLowerCase().replace("image/jpg", "image/jpeg");
  return {
    file: prepared.file,
    contentType: imageMime,
    init: {
      kind: "image",
      mimeType: imageMime,
      fileSizeBytes: prepared.file.size,
      idempotencyKey: item.idempotencyKey,
      width: prepared.width || undefined,
      height: prepared.height || undefined,
    },
    poster: null,
    patch: { width: prepared.width ?? item.width, height: prepared.height ?? item.height },
  };
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
        logQuadUpload("upload_retry", { clientId: current.clientId, attempt, kind: current.kind });
        current = {
          ...current,
          stage: "preparing",
          percent: 0,
          error: undefined,
          diagnostic: undefined,
          abort: controller,
        };
        onUpdate(current);
        await sleep(400 * attempt);
      }

      const prepared = await withTimeout(
        prepareUpload(current, (stage) => {
          lastStage = stage;
        }),
        MEDIA_PREPARE_TIMEOUT_MS,
        () => new MediaPrepareTimeoutError(),
      );
      if (controller.signal.aborted) {
        throw new DOMException("Upload cancelled.", "AbortError");
      }
      current = { ...current, ...prepared.patch, stage: "uploading", percent: 0 };
      onUpdate(current);

      // 1) Server authenticates, validates, reserves the row + path, and signs one upload.
      lastStage = "database_insert";
      const init = await postAuthed<UploadInitResult, PreparedUpload["init"]>(
        MEDIA_UPLOAD_INIT_PATH,
        prepared.init,
      );
      if (controller.signal.aborted) {
        current = {
          ...current,
          uploadMediaId: init.status === "upload" ? init.mediaId : init.media.mediaId,
        };
        throw new DOMException("Upload cancelled.", "AbortError");
      }

      let data: MediaUploadResult;
      if (init.status === "ready") {
        // Same idempotency key already finished on the server (e.g. retry after a lost response).
        data = init.media;
      } else {
        current = { ...current, uploadMediaId: init.mediaId };
        onUpdate(current);

        // 2) Bytes go straight to Supabase Storage — never through our API.
        lastStage = "upload_start";
        logQuadUpload("upload_start", {
          clientId: current.clientId,
          attempt,
          kind: current.kind,
          size: prepared.file.size,
          bucket: "quad-post-images",
        });
        logMediaStage("upload started", {
          clientId: current.clientId,
          attempt,
          kind: current.kind,
          mime: prepared.contentType,
          sizeBytes: prepared.file.size,
          target: "storage-direct",
        });
        const uploadStartedMs = Date.now();
        let lastLoggedDecile = -1;
        await uploadFileToSignedUrl({
          signedUrl: init.signedUrl,
          file: prepared.file,
          contentType: init.contentType,
          upsert: init.upsert,
          signal: controller.signal,
          stallTimeoutMs: MEDIA_UPLOAD_STALL_TIMEOUT_MS,
          onProgress: (fraction) => {
            const percent = Math.round(fraction * 100);
            current = { ...current, stage: "uploading", percent };
            onUpdate(current);
            const decile = Math.floor(percent / 10);
            if (decile !== lastLoggedDecile) {
              lastLoggedDecile = decile;
              logMediaStage("upload progress", { clientId: current.clientId, percent });
            }
          },
        });
        logMediaStage("upload completed", {
          clientId: current.clientId,
          ms: Date.now() - uploadStartedMs,
        });
        if (controller.signal.aborted) {
          throw new DOMException("Upload cancelled.", "AbortError");
        }

        // 3) Server verifies the stored object and registers it; only then is it ready.
        lastStage = "supabase_response";
        current = { ...current, stage: "processing", percent: 100 };
        onUpdate(current);
        const completeForm = new FormData();
        completeForm.append("mediaId", init.mediaId);
        if (prepared.poster) completeForm.append("poster", prepared.poster, "poster.jpg");
        data = await uploadFormDataWithProgress<MediaUploadResult>({
          path: MEDIA_UPLOAD_COMPLETE_PATH,
          form: completeForm,
          signal: controller.signal,
          stallTimeoutMs: MEDIA_UPLOAD_STALL_TIMEOUT_MS,
        });
      }

      if (!data.mediaId || !data.playbackUrl) {
        throw new Error("Upload succeeded but the server did not return a media id.");
      }
      logMediaStage("database record created", {
        clientId: current.clientId,
        mediaId: data.mediaId,
        hasThumbnail: Boolean(data.thumbnailUrl ?? data.posterUrl),
      });

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
      logMediaStage("ready", { clientId: current.clientId, mediaId: data.mediaId, kind: current.kind });
      return;
    } catch (error) {
      lastError = error;
      if (isAbortError(error)) {
        // User removed/replaced the item — not a sticky failure. Never finalize it; release any
        // reserved server upload (a complete that raced the abort is released too).
        discardCarouselItemUpload(current);
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
        size: current.file.size,
        mime: current.file.type,
      });
      logMediaStage("error", {
        clientId: current.clientId,
        stage: lastStage,
        attempt,
        status: error instanceof ApiRequestError ? error.status : undefined,
        code: error instanceof ApiRequestError ? error.code : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
        break;
      }
      if (isNonRetryablePrepareError(error) || isNonRetryableServerError(error)) {
        break;
      }
    }
  }

  const message = userFacingUploadError(lastError, current.kind);
  const diagnostic = diagnosticFor(lastStage, lastError);
  onUpdate({
    ...current,
    stage: "failed",
    percent: current.stage === "uploading" ? current.percent : 0,
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

  // Items queued behind the concurrency limit still read "waiting" in React state, so a
  // re-render can call this again before they start. Claim ids synchronously to avoid double uploads.
  const pending = items.filter((i) => {
    if (opts?.onlyClientIds && !opts.onlyClientIds.has(i.clientId)) return false;
    if (i.stage !== "waiting" || inFlightClientIds.has(i.clientId)) return false;
    inFlightClientIds.add(i.clientId);
    return true;
  });

  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const item = pending[index++]!;
      try {
        await uploadOne(item, (next) => onUpdate(next.clientId, next));
      } finally {
        inFlightClientIds.delete(item.clientId);
      }
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
