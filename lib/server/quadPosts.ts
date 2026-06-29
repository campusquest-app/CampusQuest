import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

/**
 * Disambiguate quad_posts → profiles embed (post_likes also links both tables).
 * @see https://supabase.com/docs/guides/database/joins-and-nested-tables
 */
export const QUAD_POST_PROFILE_EMBED = "profiles!quad_posts_user_id_fkey";

export const QUAD_POSTS_WITH_PROFILE_SELECT = `
  *,
  ${QUAD_POST_PROFILE_EMBED} (
    display_name,
    username,
    avatar_custom_json,
    avatar_url
  )
`;

const DATA_IMAGE_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/i;
const MAX_PROOF_BYTES = 4 * 1024 * 1024;
const QUAD_POST_IMAGES_BUCKET = "quad-post-images";

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

/** Upload data-URL proof images to storage; pass through http(s) URLs unchanged. */
export async function normalizeQuadPostProofUrl(
  proofUrl: string | null | undefined,
  userId: string,
): Promise<string | null> {
  const proof = proofUrl?.trim();
  if (!proof) return null;

  if (!proof.startsWith("data:image/")) {
    if (/^https?:\/\//i.test(proof)) {
      return proof.slice(0, 2048);
    }
    throw new ApiError(
      400,
      "proofUrl must be an uploaded http(s) image URL. Use /api/quad/posts/proof first.",
      "PROOF_URL_INVALID",
    );
  }

  const match = DATA_IMAGE_RE.exec(proof);
  if (!match) {
    throw new ApiError(400, "Invalid proof image format.", "PROOF_INVALID_DATA_URL");
  }

  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const base64 = match[2];
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw new ApiError(400, "Could not decode proof image.", "PROOF_DECODE_FAILED");
  }

  if (buffer.length === 0) {
    throw new ApiError(400, "Proof image is empty.", "PROOF_EMPTY");
  }
  if (buffer.length > MAX_PROOF_BYTES) {
    throw new ApiError(400, "Proof image is too large (max 4 MB).", "PROOF_TOO_LARGE");
  }

  const admin = createAdminClient();
  const ext = extensionForMime(mime);
  const storagePath = `${userId}/quad-posts/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(QUAD_POST_IMAGES_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    const msg = uploadError.message ?? "Proof image upload failed.";
    if (/bucket not found|does not exist/i.test(msg)) {
      console.error("[cq][quad-post] storage bucket missing — falling back to inline data URL", {
        bucket: QUAD_POST_IMAGES_BUCKET,
        message: msg,
      });
      return proof.slice(0, 120_000);
    }
    throw new ApiError(400, msg, "PROOF_UPLOAD_FAILED");
  }

  const { data: publicUrlData } = admin.storage.from(QUAD_POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  return publicUrlData.publicUrl;
}

const MAX_UPLOAD_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/**
 * Upload an already-decoded image Buffer (from a multipart/form-data Blob) to
 * storage and return its public URL. Used by the Memory media route so clients
 * send a compressed Blob instead of a large Base64 data URL.
 */
export async function uploadImageBufferToStorage(args: {
  buffer: Buffer;
  mime: string;
  userId: string;
  folder?: string;
}): Promise<string> {
  const normalizedMime = args.mime.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_UPLOAD_MIME.has(args.mime.toLowerCase()) && !ALLOWED_UPLOAD_MIME.has(normalizedMime)) {
    throw new ApiError(400, "Unsupported image format.", "IMAGE_FORMAT_UNSUPPORTED");
  }
  if (args.buffer.length === 0) {
    throw new ApiError(400, "Image is empty.", "IMAGE_EMPTY");
  }
  if (args.buffer.length > MAX_UPLOAD_IMAGE_BYTES) {
    throw new ApiError(413, "Image is too large.", "IMAGE_TOO_LARGE");
  }

  const admin = createAdminClient();
  const ext = extensionForMime(normalizedMime);
  const folder = args.folder ?? "campus-memories";
  const storagePath = `${args.userId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(QUAD_POST_IMAGES_BUCKET)
    .upload(storagePath, args.buffer, {
      contentType: normalizedMime,
      upsert: false,
    });

  if (uploadError) {
    throw new ApiError(400, uploadError.message ?? "Image upload failed.", "IMAGE_UPLOAD_FAILED");
  }

  const { data: publicUrlData } = admin.storage.from(QUAD_POST_IMAGES_BUCKET).getPublicUrl(storagePath);
  return publicUrlData.publicUrl;
}

export function logQuadPostError(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ApiError ? error.code : undefined;
  console.error(`[cq][quad-post] ${stage}`, { message, code, ...extra });
}
