import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import {
  extensionForVideoMime,
  isAllowedVideoMime,
  resolveQuadVideoMaxBytes,
  QUAD_VIDEO_MAX_DURATION_SECONDS,
  videoDurationErrorMessage,
  videoFormatErrorMessage,
  videoProcessErrorMessage,
  videoTooLargeErrorMessage,
} from "@/lib/quadVideo";

const QUAD_MEDIA_BUCKET = "quad-post-images";

/** Minimal MP4/MOV brand check (ftyp box). */
export function sniffVideoContainer(buffer: Buffer): "mp4" | "webm" | "unknown" {
  if (buffer.length < 12) return "unknown";
  // WebM / Matroska EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  // ISO BMFF: size(4) + 'ftyp'
  const box = buffer.toString("ascii", 4, 8);
  if (box === "ftyp") return "mp4";
  return "unknown";
}

export async function uploadQuadVideoBuffer(args: {
  buffer: Buffer;
  mime: string;
  userId: string;
  durationSeconds: number;
  width?: number | null;
  height?: number | null;
  hasAudio: boolean;
  idempotencyKey?: string | null;
}): Promise<{
  mediaId: string;
  playbackUrl: string;
  storagePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  mimeType: string;
}> {
  const mime = args.mime.toLowerCase().trim();
  if (!isAllowedVideoMime(mime)) {
    throw new ApiError(400, videoFormatErrorMessage(), "VIDEO_FORMAT_UNSUPPORTED");
  }
  const maxBytes = resolveQuadVideoMaxBytes(process.env.QUAD_VIDEO_MAX_BYTES);
  if (args.buffer.length === 0) {
    throw new ApiError(400, videoProcessErrorMessage(), "VIDEO_EMPTY");
  }
  if (args.buffer.length > maxBytes) {
    throw new ApiError(413, videoTooLargeErrorMessage(), "VIDEO_TOO_LARGE");
  }

  const sniff = sniffVideoContainer(args.buffer);
  if (sniff === "unknown") {
    throw new ApiError(400, videoFormatErrorMessage(), "VIDEO_FORMAT_UNSUPPORTED");
  }
  if (mime === "video/webm" && sniff !== "webm") {
    throw new ApiError(400, videoFormatErrorMessage(), "VIDEO_FORMAT_UNSUPPORTED");
  }
  if ((mime === "video/mp4" || mime === "video/quicktime" || mime === "video/x-m4v") && sniff !== "mp4") {
    throw new ApiError(400, videoFormatErrorMessage(), "VIDEO_FORMAT_UNSUPPORTED");
  }

  const duration = Number(args.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new ApiError(400, videoProcessErrorMessage(), "VIDEO_DURATION_INVALID");
  }
  if (duration > QUAD_VIDEO_MAX_DURATION_SECONDS + 0.5) {
    throw new ApiError(400, videoDurationErrorMessage(), "VIDEO_TOO_LONG");
  }

  const admin = createAdminClient();

  if (args.idempotencyKey) {
    const { data: existing } = await admin
      .from("quad_post_media")
      .select(
        "id, storage_path, playback_path, mime_type, file_size_bytes, duration_seconds, has_audio, width, height, processing_status",
      )
      .eq("uploader_id", args.userId)
      .eq("idempotency_key", args.idempotencyKey)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.storage_path && existing.processing_status === "ready") {
      const { data: publicUrlData } = admin.storage
        .from(QUAD_MEDIA_BUCKET)
        .getPublicUrl(existing.playback_path || existing.storage_path);
      return {
        mediaId: existing.id as string,
        playbackUrl: publicUrlData.publicUrl,
        storagePath: existing.storage_path as string,
        fileSizeBytes: Number(existing.file_size_bytes),
        durationSeconds: Number(existing.duration_seconds ?? duration),
        hasAudio: existing.has_audio === true,
        width: (existing.width as number | null) ?? null,
        height: (existing.height as number | null) ?? null,
        mimeType: (existing.mime_type as string) || mime,
      };
    }
  }

  const ext = extensionForVideoMime(mime);
  const mediaId = crypto.randomUUID();
  const storagePath = `${args.userId}/posts/${Date.now()}-${mediaId}.${ext}`;

  const { data: inserted, error: insErr } = await admin
    .from("quad_post_media")
    .insert({
      id: mediaId,
      post_id: null,
      uploader_id: args.userId,
      media_type: "video",
      storage_path: storagePath,
      playback_path: storagePath,
      thumbnail_path: null,
      mime_type: mime,
      file_size_bytes: args.buffer.length,
      duration_seconds: duration,
      width: args.width ?? null,
      height: args.height ?? null,
      has_audio: args.hasAudio === true,
      processing_status: "processing",
      idempotency_key: args.idempotencyKey ?? null,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    throw new ApiError(400, insErr?.message ?? videoProcessErrorMessage(), "VIDEO_MEDIA_INSERT_FAILED");
  }

  const { error: uploadError } = await admin.storage.from(QUAD_MEDIA_BUCKET).upload(storagePath, args.buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    await admin
      .from("quad_post_media")
      .update({ processing_status: "failed", processing_error: uploadError.message })
      .eq("id", mediaId);
    throw new ApiError(502, `Storage upload failed: ${uploadError.message}`, "VIDEO_UPLOAD_FAILED");
  }

  const { error: readyErr } = await admin
    .from("quad_post_media")
    .update({ processing_status: "ready", processing_error: null })
    .eq("id", mediaId);
  if (readyErr) {
    throw new ApiError(400, readyErr.message, "VIDEO_READY_FAILED");
  }

  const { data: publicUrlData } = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(storagePath);
  return {
    mediaId,
    playbackUrl: publicUrlData.publicUrl,
    storagePath,
    fileSizeBytes: args.buffer.length,
    durationSeconds: duration,
    hasAudio: args.hasAudio === true,
    width: args.width ?? null,
    height: args.height ?? null,
    mimeType: mime,
  };
}

export async function uploadQuadPosterBuffer(args: {
  buffer: Buffer;
  mime: string;
  userId: string;
  mediaId: string;
}): Promise<{ posterUrl: string; thumbnailPath: string }> {
  const mime = args.mime.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new ApiError(400, "Poster must be a JPEG, PNG, or WebP image.", "POSTER_FORMAT");
  }
  if (args.buffer.length === 0 || args.buffer.length > 5 * 1024 * 1024) {
    throw new ApiError(400, "Poster image is invalid or too large.", "POSTER_SIZE");
  }
  const admin = createAdminClient();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const thumbnailPath = `${args.userId}/quad-media/${args.mediaId}/poster.${ext}`;
  const { error } = await admin.storage.from(QUAD_MEDIA_BUCKET).upload(thumbnailPath, args.buffer, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new ApiError(502, videoProcessErrorMessage(), "POSTER_UPLOAD_FAILED");

  await admin
    .from("quad_post_media")
    .update({ thumbnail_path: thumbnailPath })
    .eq("id", args.mediaId)
    .eq("uploader_id", args.userId);

  const { data } = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(thumbnailPath);
  return { posterUrl: data.publicUrl, thumbnailPath };
}

export type ReadyQuadVideoMedia = {
  id: string;
  storagePath: string;
  playbackPath: string | null;
  thumbnailPath: string | null;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  playbackUrl: string;
  posterUrl: string | null;
};

/** Load a ready video media row owned by the user (service role). */
export async function getReadyQuadVideoMedia(args: {
  mediaId: string;
  userId: string;
}): Promise<ReadyQuadVideoMedia> {
  const admin = createAdminClient();
  const { data: media, error } = await admin
    .from("quad_post_media")
    .select(
      "id, uploader_id, post_id, processing_status, storage_path, playback_path, thumbnail_path, mime_type, file_size_bytes, duration_seconds, has_audio, width, height, media_type",
    )
    .eq("id", args.mediaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !media) throw new ApiError(404, "Media not found.", "MEDIA_NOT_FOUND");
  if (media.uploader_id !== args.userId) throw new ApiError(403, "Not your media.", "MEDIA_FORBIDDEN");
  if (media.media_type !== "video") {
    throw new ApiError(400, "Media is not a video.", "MEDIA_TYPE_INVALID");
  }
  if (media.processing_status !== "ready") {
    throw new ApiError(400, "Video is not ready to publish.", "MEDIA_NOT_READY");
  }
  if (media.post_id) {
    throw new ApiError(400, "Media already attached to another post.", "MEDIA_ALREADY_ATTACHED");
  }
  const playbackPath = (media.playback_path as string) || (media.storage_path as string);
  const { data: playPublic } = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(playbackPath);
  let posterUrl: string | null = null;
  if (media.thumbnail_path) {
    const { data: thumbPublic } = admin.storage
      .from(QUAD_MEDIA_BUCKET)
      .getPublicUrl(media.thumbnail_path as string);
    posterUrl = thumbPublic.publicUrl;
  }
  return {
    id: media.id as string,
    storagePath: media.storage_path as string,
    playbackPath: (media.playback_path as string | null) ?? null,
    thumbnailPath: (media.thumbnail_path as string | null) ?? null,
    mimeType: (media.mime_type as string) || "video/mp4",
    fileSizeBytes: Number(media.file_size_bytes),
    durationSeconds: Number(media.duration_seconds),
    hasAudio: media.has_audio === true,
    width: (media.width as number | null) ?? null,
    height: (media.height as number | null) ?? null,
    playbackUrl: playPublic.publicUrl,
    posterUrl,
  };
}

export async function attachMediaToPost(args: {
  mediaId: string;
  postId: string;
  userId: string;
}): Promise<ReadyQuadVideoMedia> {
  const media = await getReadyQuadVideoMedia({ mediaId: args.mediaId, userId: args.userId });
  const admin = createAdminClient();
  const { error } = await admin
    .from("quad_post_media")
    .update({ post_id: args.postId })
    .eq("id", args.mediaId)
    .eq("uploader_id", args.userId)
    .is("post_id", null);
  if (error) throw new ApiError(400, error.message, "MEDIA_ATTACH_FAILED");
  return media;
}
