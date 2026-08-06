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

function revokeQuietly(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

/** Probe duration/dimensions/audio using a temporary <video> element. */
export async function probeVideoFile(file: File): Promise<ProbedVideo> {
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

  const objectUrl = URL.createObjectURL(file);
  try {
    const meta = await new Promise<{
      durationSeconds: number;
      width: number;
      height: number;
      hasAudio: boolean;
    }>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = objectUrl;

      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };

      video.onloadedmetadata = () => {
        const durationSeconds = Number(video.duration);
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          cleanup();
          reject(new Error(videoProcessErrorMessage()));
          return;
        }
        if (durationSeconds > QUAD_VIDEO_MAX_DURATION_SECONDS + 0.25) {
          cleanup();
          reject(new Error(videoDurationErrorMessage()));
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

        resolve({
          durationSeconds,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          hasAudio,
        });
        cleanup();
      };
      video.onerror = () => {
        cleanup();
        reject(new Error(videoProcessErrorMessage()));
      };
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

/** Capture a poster JPEG from the first readable frame. */
export async function captureVideoPoster(objectUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    video.onloadeddata = () => {
      const seekTo = Math.min(0.1, Math.max(0, (video.duration || 1) * 0.05));
      const draw = () => {
        try {
          const canvas = document.createElement("canvas");
          const w = video.videoWidth || 720;
          const h = video.videoHeight || 1280;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error(videoProcessErrorMessage()));
            return;
          }
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob(
            (blob) => {
              video.removeAttribute("src");
              video.load();
              if (!blob) {
                reject(new Error(videoProcessErrorMessage()));
                return;
              }
              resolve(blob);
            },
            "image/jpeg",
            0.82,
          );
        } catch {
          reject(new Error(videoProcessErrorMessage()));
        }
      };
      if (seekTo > 0) {
        video.currentTime = seekTo;
        video.onseeked = draw;
      } else {
        draw();
      }
    };
    video.onerror = () => reject(new Error(videoProcessErrorMessage()));
  });
}

export function revokeVideoObjectUrl(url: string | null | undefined) {
  if (url) revokeQuietly(url);
}
