import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { sniffImageMimeFromBuffer } from "@/lib/server/sniffImageMime";
import { sniffVideoContainer, uploadQuadPosterBuffer } from "@/lib/server/quadVideoUpload";
import {
  QUAD_CAROUSEL_MAX_ITEMS,
  QUAD_IMAGE_MAX_BYTES,
  extensionForImageMime,
  isUploadableImageMime,
  normalizeImageMime,
} from "@/lib/quadMedia";
import {
  QUAD_VIDEO_MAX_DURATION_SECONDS,
  extensionForVideoMime,
  isAllowedVideoMime,
  resolveQuadVideoMaxBytes,
  videoDurationErrorMessage,
  videoFormatErrorMessage,
  videoTooLargeErrorMessage,
} from "@/lib/quadVideo";

/**
 * Direct-to-Storage uploads for Quad post media.
 *
 * The browser never sends media bytes through our API (Vercel caps request bodies at ~4.5 MB).
 * Instead: init (server picks the path + creates the row) → browser PUTs to a signed upload URL
 * scoped to that single path → complete (server verifies the stored object, then marks ready).
 *
 * The quad_post_media row exists before any bytes land, so every stored object is tracked.
 */

export const QUAD_MEDIA_BUCKET = "quad-post-images";
/** Signed upload tokens are valid for 2 hours (Supabase default). */
const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
/** Pending (not yet completed) uploads a user may hold at once — one full carousel. */
export const QUAD_DIRECT_UPLOAD_MAX_PENDING = QUAD_CAROUSEL_MAX_ITEMS;
const SNIFF_BYTES = 4096;
const SNIFF_TIMEOUT_MS = 10_000;
export const STALE_PENDING_UPLOAD_MS = 24 * 60 * 60 * 1000;
export const STALE_UNATTACHED_READY_MS = 7 * 24 * 60 * 60 * 1000;

const MEDIA_ROW_COLUMNS =
  "id, uploader_id, post_id, media_type, processing_status, storage_path, playback_path, thumbnail_path, mime_type, file_size_bytes, duration_seconds, has_audio, width, height";

type MediaRow = {
  id: string;
  uploader_id: string;
  post_id: string | null;
  media_type: "image" | "video";
  processing_status: "uploading" | "processing" | "ready" | "failed";
  storage_path: string;
  playback_path: string | null;
  thumbnail_path: string | null;
  mime_type: string;
  file_size_bytes: number | string;
  duration_seconds: number | string | null;
  has_audio: boolean | null;
  width: number | null;
  height: number | null;
};

export type DirectUploadInitInput = {
  kind: "image" | "video";
  mimeType: string;
  fileSizeBytes: number;
  idempotencyKey: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
};

export type QuadMediaReadyPayload = {
  mediaId: string;
  mediaType: "image" | "video";
  playbackUrl: string;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  mimeType: string;
  fileSizeBytes: number;
  processingStatus: "ready";
};

export type DirectUploadInitResult =
  | { status: "ready"; media: QuadMediaReadyPayload }
  | {
      status: "upload";
      mediaId: string;
      bucket: string;
      path: string;
      token: string;
      signedUrl: string;
      contentType: string;
      upsert: boolean;
    };

type AdminClient = ReturnType<typeof createAdminClient>;

function maxBytesFor(kind: "image" | "video"): number {
  return kind === "video" ? resolveQuadVideoMaxBytes(process.env.QUAD_VIDEO_MAX_BYTES) : QUAD_IMAGE_MAX_BYTES;
}

function tooLargeError(kind: "image" | "video"): ApiError {
  return kind === "video"
    ? new ApiError(413, videoTooLargeErrorMessage(), "VIDEO_TOO_LARGE")
    : new ApiError(
        413,
        `This image file is too large (max ${Math.round(QUAD_IMAGE_MAX_BYTES / (1024 * 1024))}MB).`,
        "IMAGE_TOO_LARGE",
      );
}

function optionalPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Validate the client's init request. Owner/bucket/path are never accepted from the client. */
export function parseDirectUploadInit(body: unknown): DirectUploadInitInput {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const kind = raw.kind === "image" || raw.kind === "video" ? raw.kind : null;
  if (!kind) throw new ApiError(400, "Media kind must be image or video.", "MEDIA_KIND_INVALID");

  const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
    throw new ApiError(400, "A valid upload id is required.", "IDEMPOTENCY_KEY_INVALID");
  }

  const rawMime = typeof raw.mimeType === "string" ? raw.mimeType.toLowerCase().split(";")[0]!.trim() : "";
  let mimeType: string;
  if (kind === "video") {
    if (!isAllowedVideoMime(rawMime)) {
      throw new ApiError(400, videoFormatErrorMessage(), "VIDEO_FORMAT_UNSUPPORTED");
    }
    mimeType = rawMime;
  } else {
    const normalized = normalizeImageMime(rawMime);
    if (normalized === "image/heic" || normalized === "image/heif") {
      throw new ApiError(
        400,
        "HEIC photos must be converted to JPG on the device before upload.",
        "IMAGE_HEIC_UNSUPPORTED_SERVER",
      );
    }
    if (!isUploadableImageMime(normalized)) {
      throw new ApiError(400, "This image format is not supported.", "IMAGE_FORMAT_UNSUPPORTED");
    }
    mimeType = normalized;
  }

  const fileSizeBytes = Number(raw.fileSizeBytes);
  if (!Number.isInteger(fileSizeBytes) || fileSizeBytes <= 0) {
    throw new ApiError(400, "Selected media file is empty.", "MEDIA_EMPTY");
  }
  if (fileSizeBytes > maxBytesFor(kind)) throw tooLargeError(kind);

  let durationSeconds: number | null = null;
  if (kind === "video") {
    durationSeconds = Number(raw.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new ApiError(400, "Video duration is missing or invalid. Try another file.", "VIDEO_DURATION_INVALID");
    }
    if (durationSeconds > QUAD_VIDEO_MAX_DURATION_SECONDS + 0.5) {
      throw new ApiError(400, videoDurationErrorMessage(), "VIDEO_TOO_LONG");
    }
    // Column check is (0, 180]; tolerate probe rounding up to +0.5s like the legacy route.
    durationSeconds = Math.min(durationSeconds, QUAD_VIDEO_MAX_DURATION_SECONDS);
  }

  return {
    kind,
    mimeType,
    fileSizeBytes,
    idempotencyKey,
    durationSeconds,
    width: optionalPositiveInt(raw.width),
    height: optionalPositiveInt(raw.height),
    hasAudio: kind === "video" && raw.hasAudio === true,
  };
}

function publicUrl(admin: AdminClient, path: string): string {
  return admin.storage.from(QUAD_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

function toReadyPayload(admin: AdminClient, row: MediaRow): QuadMediaReadyPayload {
  const playbackUrl = publicUrl(admin, row.playback_path || row.storage_path);
  const thumbUrl = row.thumbnail_path ? publicUrl(admin, row.thumbnail_path) : null;
  const isVideo = row.media_type === "video";
  return {
    mediaId: row.id,
    mediaType: row.media_type,
    playbackUrl,
    thumbnailUrl: thumbUrl,
    posterUrl: isVideo ? thumbUrl : null,
    durationSeconds: isVideo && row.duration_seconds != null ? Number(row.duration_seconds) : null,
    hasAudio: row.has_audio === true,
    width: row.width ?? null,
    height: row.height ?? null,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    processingStatus: "ready",
  };
}

async function loadOwnedRow(admin: AdminClient, mediaId: string, userId: string): Promise<MediaRow | null> {
  const { data, error } = await admin
    .from("quad_post_media")
    .select(MEDIA_ROW_COLUMNS)
    .eq("id", mediaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Could not load media.", "MEDIA_LOOKUP_FAILED");
  if (!data) return null;
  const row = data as MediaRow;
  if (row.uploader_id !== userId) throw new ApiError(403, "Not your media.", "MEDIA_FORBIDDEN");
  return row;
}

/**
 * Authorize one direct upload. Creates (or, for the same idempotency key, reuses) the media row
 * and returns a signed upload token that can only write the server-chosen path.
 */
export async function initDirectUpload(args: {
  userId: string;
  input: DirectUploadInitInput;
}): Promise<DirectUploadInitResult> {
  const { userId, input } = args;
  const admin = createAdminClient();

  const { data: existingData, error: lookupErr } = await admin
    .from("quad_post_media")
    .select(MEDIA_ROW_COLUMNS)
    .eq("uploader_id", userId)
    .eq("idempotency_key", input.idempotencyKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupErr) throw new ApiError(500, "Could not start the upload.", "MEDIA_LOOKUP_FAILED");
  const existing = existingData as MediaRow | null;

  let mediaId: string;
  let storagePath: string;
  let upsert: boolean;

  if (existing) {
    if (existing.post_id) {
      throw new ApiError(409, "Media already attached to another post.", "MEDIA_ALREADY_ATTACHED");
    }
    if (existing.media_type !== input.kind || existing.mime_type !== input.mimeType) {
      throw new ApiError(409, "This upload id belongs to a different file.", "IDEMPOTENCY_KEY_CONFLICT");
    }
    if (existing.processing_status === "ready") {
      return { status: "ready", media: toReadyPayload(admin, existing) };
    }
    // Retry of the same logical item: same row, same path. The earlier attempt may have left a
    // partial/complete object at this path, so the new token may overwrite it.
    const { error: resetErr } = await admin
      .from("quad_post_media")
      .update({
        processing_status: "uploading",
        processing_error: null,
        file_size_bytes: input.fileSizeBytes,
        duration_seconds: input.durationSeconds,
        width: input.width,
        height: input.height,
        has_audio: input.hasAudio,
      })
      .eq("id", existing.id)
      .eq("uploader_id", userId)
      .is("post_id", null);
    if (resetErr) throw new ApiError(500, "Could not restart the upload.", "MEDIA_RESET_FAILED");
    mediaId = existing.id;
    storagePath = existing.storage_path;
    upsert = true;
  } else {
    const since = new Date(Date.now() - SIGNED_UPLOAD_TTL_MS).toISOString();
    const { count, error: countErr } = await admin
      .from("quad_post_media")
      .select("id", { count: "exact", head: true })
      .eq("uploader_id", userId)
      .eq("processing_status", "uploading")
      .is("post_id", null)
      .is("deleted_at", null)
      .gte("created_at", since);
    if (countErr) throw new ApiError(500, "Could not start the upload.", "MEDIA_LOOKUP_FAILED");
    if ((count ?? 0) >= QUAD_DIRECT_UPLOAD_MAX_PENDING) {
      throw new ApiError(
        429,
        `You can upload up to ${QUAD_DIRECT_UPLOAD_MAX_PENDING} items at a time. Wait for current uploads to finish.`,
        "MEDIA_UPLOAD_PENDING_LIMIT",
      );
    }

    mediaId = crypto.randomUUID();
    const ext = input.kind === "video" ? extensionForVideoMime(input.mimeType) : extensionForImageMime(input.mimeType);
    // auth.uid() stays the first folder segment (storage RLS convention for this bucket).
    storagePath = `${userId}/posts/${Date.now()}-${mediaId}.${ext}`;
    upsert = false;

    const { error: insErr } = await admin.from("quad_post_media").insert({
      id: mediaId,
      post_id: null,
      uploader_id: userId,
      media_type: input.kind,
      storage_path: storagePath,
      playback_path: storagePath,
      thumbnail_path: input.kind === "image" ? storagePath : null,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      duration_seconds: input.durationSeconds,
      width: input.width,
      height: input.height,
      has_audio: input.hasAudio,
      processing_status: "uploading",
      idempotency_key: input.idempotencyKey,
      sort_order: 0,
    });
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        throw new ApiError(409, "This upload is already starting. Try again.", "MEDIA_UPLOAD_CONFLICT");
      }
      throw new ApiError(500, "Could not start the upload.", "MEDIA_INSERT_FAILED");
    }
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(QUAD_MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert });
  if (signErr || !signed?.token || !signed.signedUrl) {
    await admin
      .from("quad_post_media")
      .update({ processing_status: "failed", processing_error: "signed_upload_url_failed" })
      .eq("id", mediaId)
      .eq("uploader_id", userId);
    throw new ApiError(502, "Could not prepare the upload. Try again.", "MEDIA_SIGNED_URL_FAILED");
  }

  return {
    status: "upload",
    mediaId,
    bucket: QUAD_MEDIA_BUCKET,
    path: storagePath,
    token: signed.token,
    signedUrl: signed.signedUrl,
    contentType: input.mimeType,
    upsert,
  };
}

async function readObjectHead(admin: AdminClient, path: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(publicUrl(admin, path), {
      headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` },
      cache: "no-store",
      signal: AbortSignal.timeout(SNIFF_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(502, "Could not verify the upload. Try again.", "MEDIA_VERIFY_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new ApiError(502, "Could not verify the upload. Try again.", "MEDIA_VERIFY_UNAVAILABLE");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.subarray(0, SNIFF_BYTES);
}

function contentMatchesMime(row: MediaRow, head: Buffer): boolean {
  if (row.media_type === "image") {
    return sniffImageMimeFromBuffer(head, null) === row.mime_type;
  }
  const container = sniffVideoContainer(head);
  if (row.mime_type === "video/webm") return container === "webm";
  return container === "mp4";
}

/** Invalid content can never become ready: remove the object now and keep the row as failed. */
async function rejectUploadedObject(admin: AdminClient, row: MediaRow, reason: string): Promise<void> {
  await admin.storage.from(QUAD_MEDIA_BUCKET).remove([row.storage_path]);
  await admin
    .from("quad_post_media")
    .update({ processing_status: "failed", processing_error: reason })
    .eq("id", row.id)
    .eq("uploader_id", row.uploader_id)
    .is("post_id", null);
}

/**
 * Register a finished direct upload. Verifies the stored object's real size, content type and
 * magic bytes (never trusting the client's declared values), then marks the row ready.
 * Transient failures leave the row `uploading` so a retry can complete it idempotently.
 */
export async function completeDirectUpload(args: {
  userId: string;
  mediaId: string;
  poster?: { buffer: Buffer; mime: string } | null;
}): Promise<QuadMediaReadyPayload> {
  const admin = createAdminClient();
  const row = await loadOwnedRow(admin, args.mediaId, args.userId);
  if (!row) throw new ApiError(404, "Media not found.", "MEDIA_NOT_FOUND");
  if (row.post_id) {
    throw new ApiError(409, "Media already attached to another post.", "MEDIA_ALREADY_ATTACHED");
  }
  if (row.processing_status === "ready") return toReadyPayload(admin, row);
  if (row.processing_status !== "uploading") {
    throw new ApiError(409, "This upload is no longer active. Tap Retry.", "MEDIA_UPLOAD_NOT_PENDING");
  }

  const { data: info, error: infoErr } = await admin.storage.from(QUAD_MEDIA_BUCKET).info(row.storage_path);
  if (infoErr || !info) {
    throw new ApiError(409, "The upload did not finish. Tap Retry.", "MEDIA_UPLOAD_MISSING");
  }
  const metadata = (info.metadata ?? {}) as { size?: number; mimetype?: string };
  const actualBytes = Number(info.size ?? metadata.size ?? 0);
  const storedType = String(info.contentType ?? metadata.mimetype ?? "")
    .toLowerCase()
    .split(";")[0]!
    .trim();

  if (!Number.isFinite(actualBytes) || actualBytes <= 0) {
    await rejectUploadedObject(admin, row, "empty_object");
    throw new ApiError(400, "Selected media file is empty.", "MEDIA_EMPTY");
  }
  if (actualBytes > maxBytesFor(row.media_type)) {
    await rejectUploadedObject(admin, row, "object_too_large");
    throw tooLargeError(row.media_type);
  }
  if (storedType !== row.mime_type) {
    await rejectUploadedObject(admin, row, "content_type_mismatch");
    throw new ApiError(400, "Uploaded file type does not match.", "MEDIA_CONTENT_TYPE_MISMATCH");
  }

  const head = await readObjectHead(admin, row.storage_path);
  if (!contentMatchesMime(row, head)) {
    await rejectUploadedObject(admin, row, "content_sniff_mismatch");
    throw row.media_type === "video"
      ? new ApiError(400, videoFormatErrorMessage(), "VIDEO_FORMAT_UNSUPPORTED")
      : new ApiError(400, "This image format is not supported.", "IMAGE_FORMAT_UNSUPPORTED");
  }

  const { data: updated, error: readyErr } = await admin
    .from("quad_post_media")
    .update({ processing_status: "ready", processing_error: null, file_size_bytes: actualBytes })
    .eq("id", row.id)
    .eq("uploader_id", args.userId)
    .eq("processing_status", "uploading")
    .is("post_id", null)
    .select("id");
  if (readyErr) {
    throw new ApiError(500, "Could not finish the upload. Tap Retry.", "MEDIA_READY_FAILED");
  }
  if (!updated || updated.length === 0) {
    // Row changed underneath us (discarded or re-initialized).
    throw new ApiError(409, "This upload is no longer active. Tap Retry.", "MEDIA_UPLOAD_NOT_PENDING");
  }

  const ready: MediaRow = { ...row, processing_status: "ready", file_size_bytes: actualBytes };
  if (row.media_type === "video" && args.poster && args.poster.buffer.length > 0) {
    try {
      const { thumbnailPath } = await uploadQuadPosterBuffer({
        buffer: args.poster.buffer,
        mime: args.poster.mime,
        userId: args.userId,
        mediaId: row.id,
      });
      ready.thumbnail_path = thumbnailPath;
    } catch (posterError) {
      // Cover frame is optional; the video is already registered.
      console.error("[cq][quad-media][server] poster_upload_failed", {
        mediaId: row.id,
        message: posterError instanceof Error ? posterError.message : String(posterError),
      });
    }
  }
  return toReadyPayload(admin, ready);
}

function objectPathsFor(rows: Array<Pick<MediaRow, "storage_path" | "thumbnail_path">>): string[] {
  const paths = new Set<string>();
  for (const row of rows) {
    if (row.storage_path) paths.add(row.storage_path);
    if (row.thumbnail_path) paths.add(row.thumbnail_path);
  }
  return Array.from(paths);
}

/**
 * Soft-delete unattached rows first (guarded by post_id IS NULL), then remove only the objects of
 * rows that update actually claimed — media attached to a post is never deleted.
 */
async function releaseUnattachedRows(
  admin: AdminClient,
  ids: string[],
  reason: string,
  uploaderId?: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  let query = admin
    .from("quad_post_media")
    .update({ deleted_at: new Date().toISOString(), processing_status: "failed", processing_error: reason })
    .in("id", ids)
    .is("post_id", null)
    .is("deleted_at", null);
  if (uploaderId) query = query.eq("uploader_id", uploaderId);
  const { data: released, error } = await query.select("id, storage_path, thumbnail_path");
  if (error) throw new ApiError(500, "Could not release media.", "MEDIA_RELEASE_FAILED");
  const rows = (released ?? []) as Array<Pick<MediaRow, "storage_path" | "thumbnail_path">>;
  const paths = objectPathsFor(rows);
  if (paths.length > 0) {
    const { error: removeErr } = await admin.storage.from(QUAD_MEDIA_BUCKET).remove(paths);
    if (removeErr) {
      console.error("[cq][quad-media][server] object_remove_failed", { count: paths.length, reason });
    }
  }
  return rows.length;
}

/** User removed an item (or abandoned an in-flight upload). Idempotent. */
export async function discardDirectUpload(args: { userId: string; mediaId: string }): Promise<{ discarded: boolean }> {
  const admin = createAdminClient();
  const row = await loadOwnedRow(admin, args.mediaId, args.userId);
  if (!row) return { discarded: false };
  if (row.post_id) {
    throw new ApiError(409, "Media already attached to a post.", "MEDIA_ALREADY_ATTACHED");
  }
  const count = await releaseUnattachedRows(admin, [row.id], "discarded_by_user", args.userId);
  return { discarded: count > 0 };
}

/**
 * Sweep abandoned direct uploads: pending/failed rows older than 24h and never-attached ready
 * rows older than 7 days. Only rows with post_id IS NULL are touched.
 */
export async function cleanupStaleQuadMediaUploads(opts?: {
  now?: number;
  limit?: number;
}): Promise<{ pendingReleased: number; unattachedReadyReleased: number }> {
  const admin = createAdminClient();
  const now = opts?.now ?? Date.now();
  const limit = opts?.limit ?? 200;

  const { data: pending, error: pendingErr } = await admin
    .from("quad_post_media")
    .select("id")
    .is("post_id", null)
    .is("deleted_at", null)
    .in("processing_status", ["uploading", "processing", "failed"])
    .lt("created_at", new Date(now - STALE_PENDING_UPLOAD_MS).toISOString())
    .limit(limit);
  if (pendingErr) throw new ApiError(500, "Could not list stale uploads.", "MEDIA_CLEANUP_FAILED");

  const { data: readyRows, error: readyErr } = await admin
    .from("quad_post_media")
    .select("id")
    .is("post_id", null)
    .is("deleted_at", null)
    .eq("processing_status", "ready")
    .lt("created_at", new Date(now - STALE_UNATTACHED_READY_MS).toISOString())
    .limit(limit);
  if (readyErr) throw new ApiError(500, "Could not list stale uploads.", "MEDIA_CLEANUP_FAILED");

  const pendingReleased = await releaseUnattachedRows(
    admin,
    ((pending ?? []) as Array<{ id: string }>).map((r) => r.id),
    "stale_pending_upload",
  );
  const unattachedReadyReleased = await releaseUnattachedRows(
    admin,
    ((readyRows ?? []) as Array<{ id: string }>).map((r) => r.id),
    "stale_unattached_media",
  );
  return { pendingReleased, unattachedReadyReleased };
}
