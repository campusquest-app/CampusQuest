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

export const QUAD_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

/** Server accepts these after client prepare (HEIC must be converted client-side). */
export const QUAD_IMAGE_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Soft target for compressed uploads (keeps us under typical serverless body limits). */
export const QUAD_IMAGE_UPLOAD_TARGET_BYTES = 2_800_000;

/** Absolute server-side ceiling after prepare (bytes). */
export const QUAD_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;

export function normalizeImageMime(mime: string | null | undefined): string {
  return (mime ?? "").toLowerCase().trim().replace("image/jpg", "image/jpeg");
}

export function isAllowedImageMime(mime: string): boolean {
  const m = normalizeImageMime(mime);
  return (QUAD_IMAGE_MIME_TYPES as readonly string[]).includes(m);
}

export function isUploadableImageMime(mime: string): boolean {
  const m = normalizeImageMime(mime);
  return (QUAD_IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(m);
}

/** Android galleries often omit File.type — fall back to extension. */
export function looksLikeImageFile(file: { name?: string; type?: string }): boolean {
  if (isAllowedImageMime(file.type ?? "")) return true;
  return IMAGE_EXT.test(file.name ?? "");
}

export function looksLikeVideoFile(file: { name?: string; type?: string }): boolean {
  const type = (file.type ?? "").toLowerCase();
  if (type.startsWith("video/") || type === "video/quicktime" || type === "video/x-m4v") return true;
  return VIDEO_EXT.test(file.name ?? "");
}

export function isHeicLikeFile(file: { name?: string; type?: string }): boolean {
  const mime = normalizeImageMime(file.type);
  if (mime === "image/heic" || mime === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file.name ?? "");
}

export function extensionForImageMime(mime: string): string {
  switch (normalizeImageMime(mime)) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
    case "image/heif":
      return "heic";
    default:
      return "jpg";
  }
}

export function guessImageMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
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

/** True when a carousel item has a usable http(s) playback URL and is ready. */
export function isRenderableCarouselMedia(
  item: Pick<QuadCarouselMediaDto, "url" | "processingStatus"> | null | undefined,
): boolean {
  if (!item) return false;
  if (item.processingStatus && item.processingStatus !== "ready") return false;
  const url = typeof item.url === "string" ? item.url.trim() : "";
  return /^https?:\/\//i.test(url);
}

/** Drop null/empty/failed media before rendering carousel slides. */
export function filterRenderableCarouselMedia(
  items: Array<QuadCarouselMediaDto | null | undefined> | null | undefined,
): QuadCarouselMediaDto[] {
  if (!items?.length) return [];
  return items.filter((item): item is QuadCarouselMediaDto => isRenderableCarouselMedia(item));
}

export function clampCarouselIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

/**
 * Remove a failed media id from the visible list and keep the active index in range.
 * Used when an image/video fires onError while the user is viewing a slide.
 */
export function removeFailedCarouselMedia(
  items: QuadCarouselMediaDto[],
  failedId: string,
  currentIndex: number,
): { items: QuadCarouselMediaDto[]; index: number } {
  const next = items.filter((item) => item.id !== failedId);
  return { items: next, index: clampCarouselIndex(currentIndex, next.length) };
}

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
