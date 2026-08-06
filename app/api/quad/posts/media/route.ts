import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { isAllowedVideoMime, QUAD_VIDEO_MAX_DURATION_SECONDS } from "@/lib/quadVideo";
import { isUploadableImageMime, normalizeImageMime } from "@/lib/quadMedia";
import { sniffImageMimeFromBuffer } from "@/lib/server/sniffImageMime";
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
    if (file.size <= 0) {
      throw new ApiError(400, "Selected media file is empty.", "MEDIA_EMPTY");
    }

    const fileName =
      typeof (file as File).name === "string" && (file as File).name.trim()
        ? (file as File).name.trim()
        : null;
    const kindHint = String(form.get("kind") ?? "").toLowerCase();
    const declaredMime = normalizeImageMime(file.type || "");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      throw new ApiError(400, "Selected media file is empty.", "MEDIA_EMPTY");
    }
    const sniffedImageMime = sniffImageMimeFromBuffer(buffer, fileName);
    const mime = declaredMime || sniffedImageMime || "";

    console.info("[cq][quad-media][server] request", {
      userId: auth.user.id,
      kindHint,
      declaredMime: file.type || null,
      sniffedImageMime,
      resolvedMime: mime || null,
      fileName,
      bytes: buffer.length,
      authenticated: true,
      bucket: "quad-post-images",
    });

    const isVideo =
      kindHint === "video" || mime.startsWith("video/") || isAllowedVideoMime(mime);
    const isImage =
      kindHint === "image" ||
      mime.startsWith("image/") ||
      Boolean(sniffedImageMime) ||
      isUploadableImageMime(mime);

    if (!isVideo && !isImage) {
      throw new ApiError(
        400,
        `This media format is not supported${mime ? ` (${mime})` : fileName ? ` (${fileName})` : ""}.`,
        "MEDIA_FORMAT_UNSUPPORTED",
      );
    }

    if (isImage && sniffedImageMime && (sniffedImageMime === "image/heic" || sniffedImageMime === "image/heif")) {
      throw new ApiError(
        400,
        "HEIC photos must be converted to JPG on the device before upload.",
        "IMAGE_HEIC_UNSUPPORTED_SERVER",
      );
    }

    const width = form.get("width") != null ? Number(form.get("width")) : null;
    const height = form.get("height") != null ? Number(form.get("height")) : null;
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim() || null;

    if (isVideo) {
      const durationSeconds = Number(form.get("durationSeconds"));
      const hasAudio = String(form.get("hasAudio") ?? "false") === "true";
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new ApiError(
          400,
          "Video duration is missing or invalid. Try another file.",
          "VIDEO_DURATION_INVALID",
        );
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
        try {
          const result = await uploadQuadPosterBuffer({
            buffer: Buffer.from(await poster.arrayBuffer()),
            mime: (poster.type || "image/jpeg").toLowerCase(),
            userId: auth.user.id,
            mediaId: uploaded.mediaId,
          });
          posterUrl = result.posterUrl;
        } catch (posterError) {
          // Thumbnail/cover failure must not cancel the video upload.
          console.error("[cq][quad-media][server] poster_upload_failed", posterError);
        }
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

    const resolvedImageMime = isUploadableImageMime(mime)
      ? normalizeImageMime(mime)
      : sniffedImageMime && isUploadableImageMime(sniffedImageMime)
        ? sniffedImageMime
        : null;

    if (!resolvedImageMime) {
      throw new ApiError(
        400,
        `This image format is not supported${mime ? ` (${mime})` : fileName ? ` (${fileName})` : ""}.`,
        "IMAGE_FORMAT_UNSUPPORTED",
      );
    }

    const uploaded = await uploadQuadImageBuffer({
      buffer,
      mime: resolvedImageMime,
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
