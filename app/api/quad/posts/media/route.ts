import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { isAllowedVideoMime, QUAD_VIDEO_MAX_DURATION_SECONDS } from "@/lib/quadVideo";
import { isAllowedImageMime } from "@/lib/quadMedia";
import {
  uploadQuadImageBuffer,
  uploadQuadPosterBuffer,
  uploadQuadVideoBuffer,
} from "@/lib/server/quadPostMedia";

/**
 * Multipart upload for a single carousel item (image or video).
 * Fields: file, kind(image|video), poster?, durationSeconds?, width?, height?, hasAudio?, idempotencyKey?
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:media:upload", limit: 40, windowMs: 60_000 });

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError(400, "Use multipart/form-data for media upload.", "MEDIA_MULTIPART_REQUIRED");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      throw new ApiError(400, "No media file provided.", "MEDIA_MISSING");
    }
    const mime = (file.type || "").toLowerCase();
    const kindHint = String(form.get("kind") ?? "").toLowerCase();
    const isVideo =
      kindHint === "video" || mime.startsWith("video/") || isAllowedVideoMime(mime);
    const isImage =
      kindHint === "image" || mime.startsWith("image/") || isAllowedImageMime(mime);

    if (!isVideo && !isImage) {
      throw new ApiError(400, "This media format is not supported.", "MEDIA_FORMAT_UNSUPPORTED");
    }

    const width = form.get("width") != null ? Number(form.get("width")) : null;
    const height = form.get("height") != null ? Number(form.get("height")) : null;
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim() || null;
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isVideo) {
      const durationSeconds = Number(form.get("durationSeconds"));
      const hasAudio = String(form.get("hasAudio") ?? "false") === "true";
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new ApiError(400, "We couldn’t process this video. Try another file.", "VIDEO_DURATION_INVALID");
      }
      if (durationSeconds > QUAD_VIDEO_MAX_DURATION_SECONDS + 0.5) {
        throw new ApiError(400, "Videos can be up to 3 minutes.", "VIDEO_TOO_LONG");
      }
      const uploaded = await uploadQuadVideoBuffer({
        buffer,
        mime: isAllowedVideoMime(mime) ? mime : "video/mp4",
        userId: auth.user.id,
        durationSeconds,
        width: Number.isFinite(width as number) ? (width as number) : null,
        height: Number.isFinite(height as number) ? (height as number) : null,
        hasAudio,
        idempotencyKey,
      });
      let posterUrl: string | null = null;
      const poster = form.get("poster");
      if (poster instanceof Blob && poster.size > 0) {
        const result = await uploadQuadPosterBuffer({
          buffer: Buffer.from(await poster.arrayBuffer()),
          mime: (poster.type || "image/jpeg").toLowerCase(),
          userId: auth.user.id,
          mediaId: uploaded.mediaId,
        });
        posterUrl = result.posterUrl;
      }
      return ok({
        mediaId: uploaded.mediaId,
        mediaType: "video" as const,
        playbackUrl: uploaded.playbackUrl,
        thumbnailUrl: posterUrl,
        posterUrl,
        durationSeconds: uploaded.durationSeconds,
        hasAudio: uploaded.hasAudio,
        width: uploaded.width,
        height: uploaded.height,
        mimeType: uploaded.mimeType,
        fileSizeBytes: uploaded.fileSizeBytes,
        processingStatus: "ready" as const,
      });
    }

    const uploaded = await uploadQuadImageBuffer({
      buffer,
      mime: isAllowedImageMime(mime) ? mime.replace("image/jpg", "image/jpeg") : "image/jpeg",
      userId: auth.user.id,
      width: Number.isFinite(width as number) ? (width as number) : null,
      height: Number.isFinite(height as number) ? (height as number) : null,
      idempotencyKey,
    });
    return ok({
      mediaId: uploaded.mediaId,
      mediaType: "image" as const,
      playbackUrl: uploaded.playbackUrl,
      thumbnailUrl: uploaded.thumbnailUrl,
      posterUrl: null,
      durationSeconds: null,
      hasAudio: false,
      width: uploaded.width,
      height: uploaded.height,
      mimeType: uploaded.mimeType,
      fileSizeBytes: uploaded.fileSizeBytes,
      processingStatus: "ready" as const,
    });
  } catch (error) {
    return fail(error);
  }
}
