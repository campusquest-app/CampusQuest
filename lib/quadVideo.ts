/** Shared Quad video limits + pure helpers (client + server safe). */

export const QUAD_VIDEO_MAX_DURATION_SECONDS = 180;
export const QUAD_VIDEO_MAX_DURATION_LABEL = "3 minutes";

/**
 * Default max video upload size (250 MB): fits a 3-minute 1080p phone recording (HEVC ≈ 60 MB/min,
 * H.264 ≈ 80 MB/min at 1080p30). Videos upload browser → Storage directly, so this is bounded by the
 * Supabase project's Storage upload limit, not Vercel. Override with QUAD_VIDEO_MAX_BYTES (server)
 * and NEXT_PUBLIC_QUAD_VIDEO_MAX_BYTES (client) — keep both ≤ the Supabase limit.
 */
export const QUAD_VIDEO_MAX_BYTES_DEFAULT = 250 * 1024 * 1024;

export const QUAD_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
] as const;

export type QuadVideoMime = (typeof QUAD_VIDEO_MIME_TYPES)[number];

export const QUAD_MEDIA_TYPES = ["none", "image", "video"] as const;
export type QuadMediaType = (typeof QUAD_MEDIA_TYPES)[number];

export const QUAD_MEDIA_PROCESSING = ["uploading", "processing", "ready", "failed"] as const;
export type QuadMediaProcessingStatus = (typeof QUAD_MEDIA_PROCESSING)[number];

export function isAllowedVideoMime(mime: string): boolean {
  const m = mime.toLowerCase().trim();
  return (QUAD_VIDEO_MIME_TYPES as readonly string[]).includes(m);
}

export function extensionForVideoMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/x-m4v":
      return "m4v";
    default:
      return "mp4";
  }
}

export function looksLikeVideoUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/^data:video\//i.test(u)) return true;
  if (/\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(u)) return true;
  if (/\/storage\/v1\/object\/public\/quad-post-images\/.+\.(mp4|mov|webm|m4v)/i.test(u)) return true;
  return false;
}

export function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function videoDurationErrorMessage(): string {
  return `This video is longer than the ${QUAD_VIDEO_MAX_DURATION_SECONDS / 60}-minute limit.`;
}

export function videoTooLargeErrorMessage(): string {
  return "This video file is too large to upload.";
}

export function videoFormatErrorMessage(): string {
  return "This video format is not supported.";
}

export function videoProcessErrorMessage(): string {
  return "We couldn’t process this video. Try another file.";
}

export function resolveQuadVideoMaxBytes(envValue?: string | null): number {
  const n = Number(envValue);
  if (Number.isFinite(n) && n >= 5 * 1024 * 1024) return Math.floor(n);
  return QUAD_VIDEO_MAX_BYTES_DEFAULT;
}
