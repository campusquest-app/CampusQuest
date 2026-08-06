import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  carouselMaxItemsErrorMessage,
  extensionForImageMime,
  isAllowedImageMime,
  resolveQuadPostTotalUploadBytes,
  type QuadCarouselMediaDto,
} from "@/lib/quadMedia";
import {
  attachMediaToPost,
  getReadyQuadVideoMedia,
  uploadQuadPosterBuffer,
  uploadQuadVideoBuffer,
  type ReadyQuadVideoMedia,
} from "@/lib/server/quadVideoUpload";
import { QUAD_VIDEO_MAX_DURATION_SECONDS, videoDurationErrorMessage } from "@/lib/quadVideo";

const QUAD_MEDIA_BUCKET = "quad-post-images";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type ReadyQuadMedia = ReadyQuadVideoMedia & {
  mediaType: "image" | "video";
};

export async function getReadyQuadMedia(args: {
  mediaId: string;
  userId: string;
}): Promise<ReadyQuadMedia> {
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
  if (media.media_type !== "image" && media.media_type !== "video") {
    throw new ApiError(400, "Unsupported media type.", "MEDIA_TYPE_INVALID");
  }
  if (media.processing_status !== "ready") {
    throw new ApiError(400, "Media is not ready to publish.", "MEDIA_NOT_READY");
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
    mediaType: media.media_type,
    storagePath: media.storage_path as string,
    playbackPath: (media.playback_path as string | null) ?? null,
    thumbnailPath: (media.thumbnail_path as string | null) ?? null,
    mimeType: (media.mime_type as string) || (media.media_type === "video" ? "video/mp4" : "image/jpeg"),
    fileSizeBytes: Number(media.file_size_bytes),
    durationSeconds: Number(media.duration_seconds ?? 0),
    hasAudio: media.has_audio === true,
    width: (media.width as number | null) ?? null,
    height: (media.height as number | null) ?? null,
    playbackUrl: playPublic.publicUrl,
    posterUrl,
  };
}

export async function uploadQuadImageBuffer(args: {
  buffer: Buffer;
  mime: string;
  userId: string;
  width?: number | null;
  height?: number | null;
  idempotencyKey?: string | null;
}): Promise<{
  mediaId: string;
  playbackUrl: string;
  thumbnailUrl: string | null;
  storagePath: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
}> {
  const mime = args.mime.toLowerCase().trim().replace("image/jpg", "image/jpeg");
  if (!isAllowedImageMime(mime)) {
    throw new ApiError(400, "This image format is not supported.", "IMAGE_FORMAT_UNSUPPORTED");
  }
  if (args.buffer.length === 0 || args.buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(400, "This image file is too large.", "IMAGE_TOO_LARGE");
  }

  const admin = createAdminClient();
  if (args.idempotencyKey) {
    const { data: existing } = await admin
      .from("quad_post_media")
      .select("id, storage_path, playback_path, thumbnail_path, mime_type, file_size_bytes, width, height")
      .eq("uploader_id", args.userId)
      .eq("idempotency_key", args.idempotencyKey)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.storage_path) {
      const path = (existing.playback_path || existing.storage_path) as string;
      const { data: publicUrlData } = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(path);
      let thumbnailUrl: string | null = null;
      if (existing.thumbnail_path) {
        thumbnailUrl = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(existing.thumbnail_path as string)
          .data.publicUrl;
      }
      return {
        mediaId: existing.id as string,
        playbackUrl: publicUrlData.publicUrl,
        thumbnailUrl,
        storagePath: existing.storage_path as string,
        fileSizeBytes: Number(existing.file_size_bytes),
        width: (existing.width as number | null) ?? null,
        height: (existing.height as number | null) ?? null,
        mimeType: (existing.mime_type as string) || mime,
      };
    }
  }

  const ext = extensionForImageMime(mime);
  const mediaId = crypto.randomUUID();
  const storagePath = `${args.userId}/quad-media/${mediaId}/original.${ext}`;

  const { error: insErr } = await admin.from("quad_post_media").insert({
    id: mediaId,
    post_id: null,
    uploader_id: args.userId,
    media_type: "image",
    storage_path: storagePath,
    playback_path: storagePath,
    thumbnail_path: storagePath,
    mime_type: mime,
    file_size_bytes: args.buffer.length,
    duration_seconds: null,
    width: args.width ?? null,
    height: args.height ?? null,
    has_audio: false,
    processing_status: "processing",
    idempotency_key: args.idempotencyKey ?? null,
    sort_order: 0,
  });
  if (insErr) throw new ApiError(400, insErr.message, "IMAGE_MEDIA_INSERT_FAILED");

  const { error: uploadError } = await admin.storage.from(QUAD_MEDIA_BUCKET).upload(storagePath, args.buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    await admin
      .from("quad_post_media")
      .update({ processing_status: "failed", processing_error: uploadError.message })
      .eq("id", mediaId);
    throw new ApiError(502, "We couldn’t process this image. Try another file.", "IMAGE_UPLOAD_FAILED");
  }

  await admin
    .from("quad_post_media")
    .update({ processing_status: "ready", processing_error: null })
    .eq("id", mediaId);

  const { data: publicUrlData } = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(storagePath);
  return {
    mediaId,
    playbackUrl: publicUrlData.publicUrl,
    thumbnailUrl: publicUrlData.publicUrl,
    storagePath,
    fileSizeBytes: args.buffer.length,
    width: args.width ?? null,
    height: args.height ?? null,
    mimeType: mime,
  };
}

export async function attachCarouselMediaToPost(args: {
  postId: string;
  userId: string;
  items: { mediaId: string; sortOrder: number }[];
  coverMediaId?: string | null;
}): Promise<{ cover: ReadyQuadMedia; mediaCount: number }> {
  const { postId, userId, items } = args;
  if (items.length < 1 || items.length > QUAD_CAROUSEL_MAX_ITEMS) {
    throw new ApiError(400, carouselMaxItemsErrorMessage(), "CAROUSEL_COUNT_INVALID");
  }

  const sortOrders = items.map((i) => i.sortOrder);
  if (new Set(sortOrders).size !== sortOrders.length) {
    throw new ApiError(400, "Each carousel item needs a unique sort order.", "CAROUSEL_SORT_DUP");
  }
  const mediaIds = items.map((i) => i.mediaId);
  if (new Set(mediaIds).size !== mediaIds.length) {
    throw new ApiError(400, "Duplicate media in carousel.", "CAROUSEL_MEDIA_DUP");
  }

  const ready: ReadyQuadMedia[] = [];
  let totalBytes = 0;
  for (const item of items) {
    const media = await getReadyQuadMedia({ mediaId: item.mediaId, userId });
    if (media.mediaType === "video") {
      if (!Number.isFinite(media.durationSeconds) || media.durationSeconds > QUAD_VIDEO_MAX_DURATION_SECONDS + 0.5) {
        throw new ApiError(400, videoDurationErrorMessage(), "VIDEO_TOO_LONG");
      }
    }
    totalBytes += media.fileSizeBytes;
    ready.push(media);
  }

  const maxTotal = resolveQuadPostTotalUploadBytes(process.env.QUAD_POST_TOTAL_UPLOAD_BYTES);
  if (totalBytes > maxTotal) {
    throw new ApiError(413, "This post’s media is too large.", "POST_MEDIA_TOO_LARGE");
  }

  const admin = createAdminClient();
  for (const item of items) {
    const { error } = await admin
      .from("quad_post_media")
      .update({ post_id: postId, sort_order: item.sortOrder })
      .eq("id", item.mediaId)
      .eq("uploader_id", userId)
      .is("post_id", null)
      .is("deleted_at", null);
    if (error) throw new ApiError(400, error.message, "MEDIA_ATTACH_FAILED");
  }

  const coverId = args.coverMediaId && mediaIds.includes(args.coverMediaId) ? args.coverMediaId : items.sort((a, b) => a.sortOrder - b.sortOrder)[0]!.mediaId;
  const cover = ready.find((m) => m.id === coverId) ?? ready[0]!;

  await admin
    .from("quad_posts")
    .update({
      media_count: items.length,
      cover_media_id: cover.id,
      proof_url: cover.playbackUrl,
      media_type: cover.mediaType,
      poster_url: cover.mediaType === "video" ? cover.posterUrl : null,
      media_duration_seconds: cover.mediaType === "video" ? cover.durationSeconds : null,
      media_has_audio: cover.mediaType === "video" ? cover.hasAudio : false,
      media_width: cover.width,
      media_height: cover.height,
      media_mime_type: cover.mimeType,
      media_file_size_bytes: cover.fileSizeBytes,
      media_storage_path: cover.storagePath,
      media_processing_status: "ready",
    })
    .eq("id", postId)
    .eq("user_id", userId);

  return { cover, mediaCount: items.length };
}

/** Legacy single-video attach retained for older clients. */
export async function attachSingleVideoToPost(args: {
  mediaId: string;
  postId: string;
  userId: string;
}): Promise<ReadyQuadVideoMedia> {
  const media = await attachMediaToPost(args);
  const admin = createAdminClient();
  await admin
    .from("quad_post_media")
    .update({ sort_order: 0 })
    .eq("id", args.mediaId);
  await admin
    .from("quad_posts")
    .update({ media_count: 1, cover_media_id: args.mediaId })
    .eq("id", args.postId)
    .eq("user_id", args.userId);
  return media;
}

export async function loadCarouselMediaForPosts(
  postIds: string[],
): Promise<Map<string, QuadCarouselMediaDto[]>> {
  const map = new Map<string, QuadCarouselMediaDto[]>();
  if (postIds.length === 0) return map;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quad_post_media")
    .select(
      "id, post_id, media_type, sort_order, storage_path, playback_path, thumbnail_path, mime_type, file_size_bytes, duration_seconds, width, height, has_audio, processing_status",
    )
    .in("post_id", postIds)
    .is("deleted_at", null)
    .eq("processing_status", "ready")
    .order("sort_order", { ascending: true });
  if (error || !data) return map;

  for (const row of data) {
    const postId = row.post_id as string;
    const playbackPath = (row.playback_path as string) || (row.storage_path as string);
    const { data: play } = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(playbackPath);
    let thumbnailUrl: string | null = null;
    if (row.thumbnail_path) {
      thumbnailUrl = admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(row.thumbnail_path as string).data
        .publicUrl;
    } else if (row.media_type === "image") {
      thumbnailUrl = play.publicUrl;
    }
    const dto: QuadCarouselMediaDto = {
      id: row.id as string,
      mediaType: row.media_type === "video" ? "video" : "image",
      sortOrder: Number(row.sort_order ?? 0),
      url: play.publicUrl,
      thumbnailUrl,
      mimeType: (row.mime_type as string) || "application/octet-stream",
      fileSizeBytes: Number(row.file_size_bytes ?? 0),
      durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
      hasAudio: row.has_audio === true,
      processingStatus: "ready",
    };
    const list = map.get(postId) ?? [];
    list.push(dto);
    map.set(postId, list);
  }
  return map;
}

export async function enrichPostsWithCarouselMedia<T extends {
  id: string;
  proof_url?: string | null;
  media_type?: string | null;
  poster_url?: string | null;
  media_duration_seconds?: number | null;
  media_has_audio?: boolean | null;
  media_width?: number | null;
  media_height?: number | null;
  media_mime_type?: string | null;
  media_file_size_bytes?: number | null;
}>(posts: T[]): Promise<(T & { media: QuadCarouselMediaDto[]; media_count: number })[]> {
  if (posts.length === 0) return [];
  const byPost = await loadCarouselMediaForPosts(posts.map((p) => p.id));
  return posts.map((post) => {
    const media = byPost.get(post.id);
    if (media && media.length > 0) {
      return { ...post, media, media_count: media.length };
    }
    const legacy = synthesizeLegacyCarouselMedia(post);
    return { ...post, media: legacy, media_count: legacy.length };
  });
}

export function synthesizeLegacyCarouselMedia(row: {
  id: string;
  proof_url?: string | null;
  media_type?: string | null;
  poster_url?: string | null;
  media_duration_seconds?: number | null;
  media_has_audio?: boolean | null;
  media_width?: number | null;
  media_height?: number | null;
  media_mime_type?: string | null;
  media_file_size_bytes?: number | null;
}): QuadCarouselMediaDto[] {
  const url = row.proof_url?.trim();
  if (!url) return [];
  const isVideo = row.media_type === "video";
  return [
    {
      id: `legacy-${row.id}`,
      mediaType: isVideo ? "video" : "image",
      sortOrder: 0,
      url,
      thumbnailUrl: isVideo ? row.poster_url ?? null : url,
      mimeType: row.media_mime_type ?? (isVideo ? "video/mp4" : "image/jpeg"),
      fileSizeBytes: Number(row.media_file_size_bytes ?? 0),
      durationSeconds: row.media_duration_seconds != null ? Number(row.media_duration_seconds) : null,
      width: row.media_width ?? null,
      height: row.media_height ?? null,
      hasAudio: row.media_has_audio === true,
      processingStatus: "ready",
    },
  ];
}

export { getReadyQuadVideoMedia, uploadQuadPosterBuffer, uploadQuadVideoBuffer };
