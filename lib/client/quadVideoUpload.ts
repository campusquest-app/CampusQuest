"use client";

import { ApiRequestError } from "@/lib/client/dashboardApi";
import { getAccessToken } from "@/lib/client/apiSession";
import { captureVideoPoster, probeVideoFile, revokeVideoObjectUrl, type ProbedVideo } from "@/lib/client/probeVideoFile";

export type QuadVideoUploadProgress =
  | { stage: "preparing"; percent: number }
  | { stage: "uploading"; percent: number }
  | { stage: "processing"; percent: number }
  | { stage: "ready"; percent: 100 }
  | { stage: "failed"; percent: number; message: string };

export type QuadVideoUploadResult = {
  mediaId: string;
  playbackUrl: string;
  posterUrl: string | null;
  durationSeconds: number;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  mimeType: string;
  fileSizeBytes: number;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new ApiRequestError("Session expired. Please sign in again.", 401, "UNAUTHORIZED");
  return { Authorization: `Bearer ${token}` };
}

export async function prepareAndUploadQuadVideo(args: {
  file: File;
  idempotencyKey: string;
  signal?: AbortSignal;
  onProgress?: (p: QuadVideoUploadProgress) => void;
}): Promise<QuadVideoUploadResult> {
  const { file, idempotencyKey, signal, onProgress } = args;
  onProgress?.({ stage: "preparing", percent: 5 });

  let probed: ProbedVideo | null = null;
  try {
    probed = await probeVideoFile(file);
    onProgress?.({ stage: "preparing", percent: 20 });
    let posterBlob: Blob | null = null;
    try {
      posterBlob = await captureVideoPoster(probed.objectUrl);
    } catch {
      posterBlob = null;
    }
    onProgress?.({ stage: "uploading", percent: 30 });

    const form = new FormData();
    form.append("file", probed.file, probed.file.name || "video.mp4");
    form.append("durationSeconds", String(probed.durationSeconds));
    form.append("width", String(probed.width || 0));
    form.append("height", String(probed.height || 0));
    form.append("hasAudio", probed.hasAudio ? "true" : "false");
    form.append("idempotencyKey", idempotencyKey);
    if (posterBlob) {
      form.append("poster", posterBlob, "poster.jpg");
    }

    const headers = authHeaders();
    const response = await fetch("/api/quad/posts/video", {
      method: "POST",
      headers,
      body: form,
      signal,
      credentials: "include",
    });

    onProgress?.({ stage: "processing", percent: 85 });

    const json = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: QuadVideoUploadResult & { processingStatus?: string };
      error?: { message?: string };
    } | null;

    if (!response.ok || !json?.ok || !json.data?.playbackUrl) {
      const message =
        json?.error?.message ||
        (response.status === 413 ? "This video file is too large." : "We couldn’t process this video. Try another file.");
      throw new ApiRequestError(message, response.status, "VIDEO_UPLOAD_FAILED");
    }

    onProgress?.({ stage: "ready", percent: 100 });
    return {
      mediaId: json.data.mediaId,
      playbackUrl: json.data.playbackUrl,
      posterUrl: json.data.posterUrl ?? null,
      durationSeconds: json.data.durationSeconds,
      hasAudio: json.data.hasAudio === true,
      width: json.data.width ?? null,
      height: json.data.height ?? null,
      mimeType: json.data.mimeType,
      fileSizeBytes: json.data.fileSizeBytes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn’t process this video. Try another file.";
    onProgress?.({ stage: "failed", percent: 0, message });
    throw error;
  } finally {
    if (probed) revokeVideoObjectUrl(probed.objectUrl);
  }
}
