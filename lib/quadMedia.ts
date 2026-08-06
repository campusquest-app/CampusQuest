/** Centralized Quad carousel / media limits (client + server safe). */

export {
  QUAD_VIDEO_MAX_DURATION_SECONDS,
  QUAD_VIDEO_MAX_DURATION_LABEL,
  QUAD_VIDEO_MAX_BYTES_DEFAULT,
  QUAD_VIDEO_MIME_TYPES,
  isAllowedVideoMime,
  extensionForVideoMime,
  looksLikeVideoUrl,
  formatVideoDuration,
  videoDurationErrorMessage,
  videoTooLargeErrorMessage,
  videoFormatErrorMessage,
  videoProcessErrorMessage,
  resolveQuadVideoMaxBytes,
  QUAD_MEDIA_TYPES,
  QUAD_MEDIA_PROCESSING,
  type QuadMediaType,
  type QuadMediaProcessingStatus,
} from "@/lib/quadVideo";

/** Max photos + videos per Quad post. */
export const QUAD_CAROUSEL_MAX_ITEMS = 15;

/** Default total bytes for all media on one post (500 MB). */
export const QUAD_POST_TOTAL_UPLOAD_BYTES_DEFAULT = 500 * 1024 * 1024;

/** Parallel uploads in the composer queue. */
export const QUAD_UPLOAD_QUEUE_CONCURRENCY = 3;

export const QUAD_IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"] as const;

export function isAllowedImageMime(mime: string): boolean {
  const m = mime.toLowerCase().trim().replace("image/jpg", "image/jpeg");
  return (QUAD_IMAGE_MIME_TYPES as readonly string[]).includes(m) || m === "image/jpeg";
}

export function extensionForImageMime(mime: string): string {
  switch (mime.toLowerCase().replace("image/jpg", "image/jpeg")) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export function carouselMaxItemsErrorMessage(): string {
  return "You can add up to 15 photos and videos.";
}

export function resolveQuadPostTotalUploadBytes(envValue?: string | null): number {
  const n = Number(envValue);
  if (Number.isFinite(n) && n >= 20 * 1024 * 1024) return Math.floor(n);
  return QUAD_POST_TOTAL_UPLOAD_BYTES_DEFAULT;
}

export type QuadCarouselMediaDto = {
  id: string;
  mediaType: "image" | "video";
  sortOrder: number;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  processingStatus: "uploading" | "processing" | "ready" | "failed";
};

/** Stable fingerprint to prevent accidental duplicate file picks. */
export function mediaFileFingerprint(file: { name: string; size: number; lastModified: number; type: string }): string {
  return `${file.name}|${file.size}|${file.lastModified}|${file.type}`;
}

export function filterCarouselFiles<T extends { fingerprint: string }>(
  existing: T[],
  files: { name: string; size: number; lastModified: number; type: string }[],
): { acceptedIndexes: number[]; rejectedReason?: string } {
  const remaining = QUAD_CAROUSEL_MAX_ITEMS - existing.length;
  if (remaining <= 0) {
    return { acceptedIndexes: [], rejectedReason: carouselMaxItemsErrorMessage() };
  }
  const seen = new Set(existing.map((i) => i.fingerprint));
  const acceptedIndexes: number[] = [];
  for (let i = 0; i < files.length; i++) {
    const fp = mediaFileFingerprint(files[i]!);
    if (seen.has(fp)) continue;
    seen.add(fp);
    acceptedIndexes.push(i);
    if (acceptedIndexes.length >= remaining) break;
  }
  if (files.length > remaining && acceptedIndexes.length >= remaining) {
    return { acceptedIndexes, rejectedReason: carouselMaxItemsErrorMessage() };
  }
  return { acceptedIndexes };
}
