"use client";

import {
  isAllowedVideoMime,
  QUAD_VIDEO_MAX_DURATION_SECONDS,
  resolveQuadVideoMaxBytes,
  videoDurationErrorMessage,
  videoFormatErrorMessage,
  videoProcessErrorMessage,
  videoTooLargeErrorMessage,
} from "@/lib/quadVideo";

export type ProbedVideo = {
  file: File;
  objectUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
  mimeType: string;
};

/** iOS can take several seconds to read metadata for iCloud-backed library videos. */
export const VIDEO_PROBE_TIMEOUT_MS = 20_000;
/**
 * iOS Safari may never fire `loadeddata`/`seeked` for an off-DOM, non-playing <video>.
 * The poster is optional, so give up quickly instead of blocking the upload.
 */
export const VIDEO_POSTER_TIMEOUT_MS = 6_000;

export class VideoMediaTimeoutError extends Error {
  readonly step: "metadata" | "poster";
  constructor(step: "metadata" | "poster", timeoutMs: number) {
    super(
      step === "metadata"
        ? "This video took too long to read. Try again or choose another video."
        : `Video cover frame timed out after ${timeoutMs}ms.`,
    );
    this.name = "VideoMediaTimeoutError";
    this.step = step;
  }
}

function revokeQuietly(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

function teardownVideo(video: HTMLVideoElement) {
  video.onloadedmetadata = null;
  video.onloadeddata = null;
  video.onseeked = null;
  video.onerror = null;
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    // ignore
  }
}

/** Best-effort codec support hints for diagnostics (e.g. iPhone HEVC on non-Safari). */
export function videoCodecSupportHints(): { hevc: string; h264: string } {
  if (typeof document === "undefined") return { hevc: "", h264: "" };
  try {
    const probe = document.createElement("video");
    return {
      hevc: probe.canPlayType?.('video/mp4; codecs="hvc1"') ?? "",
      h264: probe.canPlayType?.('video/mp4; codecs="avc1.42E01E"') ?? "",
    };
  } catch {
    return { hevc: "", h264: "" };
  }
}

/** Probe duration/dimensions/audio using a temporary <video> element. */
export async function probeVideoFile(
  file: File,
  opts: { timeoutMs?: number } = {},
): Promise<ProbedVideo> {
  const mime = (file.type || "").toLowerCase() || "video/mp4";
  if (!isAllowedVideoMime(mime) && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
    throw new Error(videoFormatErrorMessage());
  }
  const maxBytes = resolveQuadVideoMaxBytes(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_QUAD_VIDEO_MAX_BYTES : undefined,
  );
  if (file.size > maxBytes) {
    throw new Error(videoTooLargeErrorMessage());
  }

  const timeoutMs = opts.timeoutMs ?? VIDEO_PROBE_TIMEOUT_MS;
  const objectUrl = URL.createObjectURL(file);
  try {
    const meta = await new Promise<{
      durationSeconds: number;
      width: number;
      height: number;
      hasAudio: boolean;
    }>((resolve, reject) => {
      const video = document.createElement("video");
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        teardownVideo(video);
        fn();
      };
      const timer = setTimeout(
        () => finish(() => reject(new VideoMediaTimeoutError("metadata", timeoutMs))),
        timeoutMs,
      );

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        const durationSeconds = Number(video.duration);
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          finish(() => reject(new Error(videoProcessErrorMessage())));
          return;
        }
        if (durationSeconds > QUAD_VIDEO_MAX_DURATION_SECONDS + 0.25) {
          finish(() => reject(new Error(videoDurationErrorMessage())));
          return;
        }
        const anyVideo = video as HTMLVideoElement & {
          mozHasAudio?: boolean;
          webkitAudioDecodedByteCount?: number;
          audioTracks?: { length: number };
        };
        // Best-effort browser detection. Playback always keeps the file's audio track;
        // this flag is metadata only and is re-stored from the upload path.
        const hasAudio =
          anyVideo.mozHasAudio === true ||
          (typeof anyVideo.webkitAudioDecodedByteCount === "number" &&
            anyVideo.webkitAudioDecodedByteCount > 0) ||
          (typeof anyVideo.audioTracks?.length === "number" && anyVideo.audioTracks.length > 0);
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        finish(() => resolve({ durationSeconds, width, height, hasAudio }));
      };
      video.onerror = () => {
        finish(() => reject(new Error(videoProcessErrorMessage())));
      };
      video.src = objectUrl;
    });

    return {
      file,
      objectUrl,
      durationSeconds: meta.durationSeconds,
      width: meta.width,
      height: meta.height,
      hasAudio: meta.hasAudio,
      mimeType: mime.startsWith("video/") ? mime : "video/mp4",
    };
  } catch (error) {
    revokeQuietly(objectUrl);
    throw error;
  }
}

/**
 * Capture a poster JPEG from the first readable frame.
 * Always settles: resolves with a JPEG, or rejects on error/timeout.
 */
export async function captureVideoPoster(
  objectUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<Blob> {
  const timeoutMs = opts.timeoutMs ?? VIDEO_POSTER_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      teardownVideo(video);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new VideoMediaTimeoutError("poster", timeoutMs))),
      timeoutMs,
    );

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const draw = () => {
      if (settled) return;
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 720;
        const h = video.videoHeight || 1280;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(() => reject(new Error(videoProcessErrorMessage())));
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            finish(() => (blob ? resolve(blob) : reject(new Error(videoProcessErrorMessage()))));
          },
          "image/jpeg",
          0.82,
        );
      } catch {
        finish(() => reject(new Error(videoProcessErrorMessage())));
      }
    };

    video.onloadeddata = () => {
      const seekTo = Math.min(0.1, Math.max(0, (video.duration || 1) * 0.05));
      if (seekTo > 0) {
        video.onseeked = draw;
        video.currentTime = seekTo;
      } else {
        draw();
      }
    };
    video.onerror = () => finish(() => reject(new Error(videoProcessErrorMessage())));
    video.src = objectUrl;
    try {
      video.load();
    } catch {
      // ignore — timeout still settles the promise
    }
  });
}

export function revokeVideoObjectUrl(url: string | null | undefined) {
  if (url) revokeQuietly(url);
}
