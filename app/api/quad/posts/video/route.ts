import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { attachMediaToPost, uploadQuadPosterBuffer, uploadQuadVideoBuffer } from "@/lib/server/quadVideoUpload";
import { isAllowedVideoMime, QUAD_VIDEO_MAX_DURATION_SECONDS } from "@/lib/quadVideo";

/**
 * Multipart upload for Quad videos.
 * Fields: file (video), poster (optional image), durationSeconds, width, height, hasAudio, idempotencyKey
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:video:upload", limit: 10, windowMs: 60_000 });

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ApiError(400, "Use multipart/form-data for video upload.", "VIDEO_MULTIPART_REQUIRED");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      throw new ApiError(400, "No video file provided.", "VIDEO_MISSING");
    }
    const mime = (file.type || "video/mp4").toLowerCase();
    if (!isAllowedVideoMime(mime)) {
      throw new ApiError(400, "This video format is not supported.", "VIDEO_FORMAT_UNSUPPORTED");
    }

    const durationSeconds = Number(form.get("durationSeconds"));
    const width = form.get("width") != null ? Number(form.get("width")) : null;
    const height = form.get("height") != null ? Number(form.get("height")) : null;
    const hasAudio = String(form.get("hasAudio") ?? "false") === "true";
    const idempotencyKey = String(form.get("idempotencyKey") ?? "").trim() || null;

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new ApiError(400, "We couldn’t process this video. Try another file.", "VIDEO_DURATION_INVALID");
    }
    if (durationSeconds > QUAD_VIDEO_MAX_DURATION_SECONDS + 0.5) {
      throw new ApiError(400, "Videos can be up to 3 minutes.", "VIDEO_TOO_LONG");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadQuadVideoBuffer({
      buffer,
      mime,
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
      const posterBuf = Buffer.from(await poster.arrayBuffer());
      const posterMime = (poster.type || "image/jpeg").toLowerCase();
      const result = await uploadQuadPosterBuffer({
        buffer: posterBuf,
        mime: posterMime,
        userId: auth.user.id,
        mediaId: uploaded.mediaId,
      });
      posterUrl = result.posterUrl;
    }

    return ok({
      mediaId: uploaded.mediaId,
      playbackUrl: uploaded.playbackUrl,
      posterUrl,
      durationSeconds: uploaded.durationSeconds,
      hasAudio: uploaded.hasAudio,
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

/** Attach a previously uploaded ready media row to a post (author-only, server-side). */
export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "quad:video:attach", limit: 30, windowMs: 60_000 });
    const body = (await request.json()) as { mediaId?: string; postId?: string };
    if (!body.mediaId || !body.postId) {
      throw new ApiError(400, "mediaId and postId are required.", "VIDEO_ATTACH_INVALID");
    }
    await attachMediaToPost({ mediaId: body.mediaId, postId: body.postId, userId: auth.user.id });
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
