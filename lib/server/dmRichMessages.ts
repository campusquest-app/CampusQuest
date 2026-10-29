import { anonymousAuthorPresentation } from "@/lib/anonymousPost";
import { resolveProfileAvatar } from "@/lib/avatarSource";
import { ApiError } from "@/lib/server/http";
import { sniffImageMimeFromBytes } from "@/lib/server/sniffImageMime";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { getAcceptedFriendUserIds } from "@/lib/server/friendProfileAccess";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type DirectMessageType = "text" | "image" | "shared_post" | "audio" | "system";
export type SharedPostType = "quad" | "memory";

export type SharedPostPreview = {
  postId: string;
  postType: SharedPostType;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  caption: string;
  imageUrl: string | null;
  mediaType?: "image" | "video" | "none" | null;
  mediaCount?: number;
  targetMediaId?: string | null;
  locationName: string | null;
  unavailable?: boolean;
  locked?: boolean;
};

export type DirectMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string | null;
  type: DirectMessageType;
  content: string;
  imageUrl: string | null;
  sharedPostId: string | null;
  sharedPostType: SharedPostType | null;
  metadata: Record<string, unknown>;
  sharedPostPreview: SharedPostPreview | null;
  previewText: string;
  createdAt: string;
  readAt: string | null;
  isFavorited: boolean;
  sender?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

const DM_IMAGES_BUCKET = "dm-images";
const DM_AUDIO_BUCKET = "dm-audio";
const DATA_IMAGE_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/i;
const DATA_AUDIO_RE = /^data:(audio\/(?:webm|mp4|mpeg|ogg|wav)(?:;[^;]*)*);base64,(.+)$/i;
const MAX_DM_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DM_AUDIO_BYTES = 8 * 1024 * 1024;
const DM_SIGNED_URL_SECONDS = 10 * 60;
const DM_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function sniffAudioMimeFromBytes(buffer: Buffer): string | null {
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") {
    return "audio/wav";
  }
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "ID3") return "audio/mpeg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0) return "audio/mpeg";
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "audio/webm";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12).toLowerCase();
    if (brand.startsWith("m4a") || brand === "mp42" || brand === "isom" || brand.startsWith("mp4")) return "audio/mp4";
  }
  return null;
}

export function parseDmStorageRef(raw: string): { bucket: "dm-images" | "dm-audio"; path: string } | null {
  const trimmed = raw.trim();
  const direct = /^(dm-images|dm-audio)\/(.+)$/.exec(trimmed);
  if (direct?.[1] === "dm-images" || direct?.[1] === "dm-audio") {
    return { bucket: direct[1], path: direct[2] };
  }
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/(dm-images|dm-audio)\/(.+)$/);
    if (!match || (match[1] !== "dm-images" && match[1] !== "dm-audio")) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

export function assertDmMediaPath(path: string, conversationId: string): void {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    throw new ApiError(400, "Invalid media path.", "DM_MEDIA_PATH_INVALID");
  }
  const [folder, owner, file] = path.split("/");
  if (folder !== conversationId || !owner || !file || path.split("/").length < 3) {
    throw new ApiError(403, "Conversation access denied.", "CONVERSATION_FORBIDDEN");
  }
}

export function storedDmMediaRef(raw: string, conversationId: string, expectedBucket: "dm-images" | "dm-audio"): string {
  const parsed = parseDmStorageRef(raw);
  if (!parsed || parsed.bucket !== expectedBucket) {
    throw new ApiError(400, "Media must be uploaded to this conversation.", "DM_MEDIA_REF_INVALID");
  }
  assertDmMediaPath(parsed.path, conversationId);
  return `${parsed.bucket}/${parsed.path}`;
}

export async function signDmMediaRef(raw: string | null): Promise<string | null> {
  if (!raw?.trim()) return null;
  const parsed = parseDmStorageRef(raw);
  if (!parsed) return null;
  try {
    assertDmMediaPath(parsed.path, parsed.path.split("/")[0] ?? "");
  } catch {
    return null;
  }
  const admin = createAdminClient();
  const signed = await admin.storage.from(parsed.bucket).createSignedUrl(parsed.path, DM_SIGNED_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return null;
  return signed.data.signedUrl;
}

export async function presentDirectMessageMedia<T extends { imageUrl: string | null }>(dto: T): Promise<T> {
  if (!dto.imageUrl) return dto;
  const signed = await signDmMediaRef(dto.imageUrl);
  return { ...dto, imageUrl: signed };
}

const MESSAGE_SELECT =
  "id, conversation_id, sender_id, recipient_id, content, type, image_url, shared_post_id, shared_post_type, metadata, created_at, read_at";

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

export function buildDirectMessagePreviewText(args: {
  type: DirectMessageType;
  content: string;
  imageUrl?: string | null;
}): string {
  const trimmed = args.content.trim();
  if (args.type === "image") {
    return trimmed && trimmed !== "📷 Photo" ? trimmed : "📷 Photo";
  }
  if (args.type === "audio") {
    return trimmed && trimmed !== "🎤 Voice message" ? trimmed : "🎤 Voice message";
  }
  if (args.type === "shared_post") {
    return trimmed && trimmed !== "Shared a post" ? trimmed : "Shared a post";
  }
  if (args.type === "system") {
    return trimmed || "System message";
  }
  return trimmed;
}

export function mapDirectMessageRow(
  row: {
    id: string;
    conversation_id: string;
    sender_id: string;
    recipient_id: string | null;
    content: string;
    type?: string | null;
    image_url?: string | null;
    shared_post_id?: string | null;
    shared_post_type?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at: string;
    read_at: string | null;
  },
  isFavorited: boolean,
): DirectMessageDto {
  const type = (row.type ?? "text") as DirectMessageType;
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const sharedPostPreview =
    type === "shared_post" && metadata.sharedPostPreview
      ? (metadata.sharedPostPreview as SharedPostPreview)
      : null;

  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    type,
    content: row.content,
    imageUrl: row.image_url ?? null,
    sharedPostId: row.shared_post_id ?? null,
    sharedPostType: (row.shared_post_type as SharedPostType | null) ?? null,
    metadata,
    sharedPostPreview,
    previewText: buildDirectMessagePreviewText({
      type,
      content: row.content,
      imageUrl: row.image_url,
    }),
    createdAt: row.created_at,
    readAt: row.read_at,
    isFavorited,
  };
}

export async function uploadDmImage(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  imageDataUrl: string;
}): Promise<string> {
  const { userClient, userId, conversationId, imageDataUrl } = args;
  const trimmed = imageDataUrl.trim();
  if (!trimmed.startsWith("data:image/")) {
    throw new ApiError(400, "imageDataUrl must be a data:image/ URL.", "DM_IMAGE_INVALID");
  }

  const match = DATA_IMAGE_RE.exec(trimmed);
  if (!match) {
    throw new ApiError(400, "Invalid image format.", "DM_IMAGE_INVALID");
  }

  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    throw new ApiError(400, "Could not decode image.", "DM_IMAGE_DECODE_FAILED");
  }

  if (buffer.length === 0) {
    throw new ApiError(400, "Image is empty.", "DM_IMAGE_EMPTY");
  }
  if (buffer.length > MAX_DM_IMAGE_BYTES) {
    throw new ApiError(400, "Image is too large (max 5 MB).", "DM_IMAGE_TOO_LARGE");
  }
  const sniffed = sniffImageMimeFromBytes(buffer);
  if (!sniffed || !DM_IMAGE_MIMES.has(sniffed) || sniffed !== mime) {
    throw new ApiError(400, "Image contents do not match an allowed type.", "DM_IMAGE_TYPE_MISMATCH");
  }

  const { data: participant, error: participantError } = await userClient
    .from("direct_conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (participantError) {
    throw new ApiError(400, participantError.message, "CONVERSATION_PARTICIPANT_CHECK_FAILED");
  }
  if (!participant) {
    throw new ApiError(403, "Conversation access denied.", "CONVERSATION_FORBIDDEN");
  }

  const admin = createAdminClient();
  const ext = extensionForMime(mime);
  const storagePath = `${conversationId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage.from(DM_IMAGES_BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    throw new ApiError(400, uploadError.message, "DM_IMAGE_UPLOAD_FAILED");
  }

  const signed = await signDmMediaRef(`${DM_IMAGES_BUCKET}/${storagePath}`);
  if (!signed) throw new ApiError(500, "Could not resolve image URL.", "DM_IMAGE_URL_FAILED");
  return signed;
}

function extensionForAudioMime(mime: string): string {
  const base = mime.toLowerCase().split(";")[0]!.trim();
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/mp4":
    case "audio/m4a":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
      return "wav";
    default:
      return "webm";
  }
}

export async function uploadDmAudio(args: {
  userClient: SupabaseClientLike;
  userId: string;
  conversationId: string;
  audioDataUrl: string;
}): Promise<string> {
  const { userClient, userId, conversationId, audioDataUrl } = args;
  const trimmed = audioDataUrl.trim();
  if (!trimmed.startsWith("data:audio/")) {
    throw new ApiError(400, "audioDataUrl must be a data:audio/ URL.", "DM_AUDIO_INVALID");
  }

  const match = DATA_AUDIO_RE.exec(trimmed);
  if (!match) {
    throw new ApiError(400, "Invalid audio format.", "DM_AUDIO_INVALID");
  }

  const mime = match[1].toLowerCase();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    throw new ApiError(400, "Could not decode audio.", "DM_AUDIO_DECODE_FAILED");
  }

  if (buffer.length === 0) {
    throw new ApiError(400, "Audio is empty.", "DM_AUDIO_EMPTY");
  }
  if (buffer.length > MAX_DM_AUDIO_BYTES) {
    throw new ApiError(400, "Audio is too large (max 8 MB).", "DM_AUDIO_TOO_LARGE");
  }
  const declaredAudio = mime.split(";")[0]!.trim();
  const sniffedAudio = sniffAudioMimeFromBytes(buffer);
  if (!sniffedAudio || sniffedAudio !== declaredAudio) {
    throw new ApiError(400, "Audio contents do not match an allowed type.", "DM_AUDIO_TYPE_MISMATCH");
  }

  const { data: participant, error: participantError } = await userClient
    .from("direct_conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (participantError) {
    throw new ApiError(400, participantError.message, "CONVERSATION_PARTICIPANT_CHECK_FAILED");
  }
  if (!participant) {
    throw new ApiError(403, "Conversation access denied.", "CONVERSATION_FORBIDDEN");
  }

  const admin = createAdminClient();
  const ext = extensionForAudioMime(mime);
  const storagePath = `${conversationId}/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage.from(DM_AUDIO_BUCKET).upload(storagePath, buffer, {
    contentType: mime.split(";")[0],
    upsert: false,
  });
  if (uploadError) {
    throw new ApiError(400, uploadError.message, "DM_AUDIO_UPLOAD_FAILED");
  }

  const signed = await signDmMediaRef(`${DM_AUDIO_BUCKET}/${storagePath}`);
  if (!signed) throw new ApiError(500, "Could not resolve audio URL.", "DM_AUDIO_URL_FAILED");
  return signed;
}

async function viewerCanSeeQuadPost(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  authorId: string;
  visibility: string;
}): Promise<boolean> {
  if (args.viewerId === args.authorId) return true;
  if (args.visibility === "public") return true;
  if (args.visibility !== "friends") return false;
  const friends = await getAcceptedFriendUserIds({ userClient: args.userClient, userId: args.viewerId });
  return friends.includes(args.authorId);
}

export async function buildSharedPostPreview(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  postId: string;
  postType: SharedPostType;
  locationName?: string | null;
}): Promise<SharedPostPreview> {
  const { userClient, viewerId, postId, postType } = args;

  const { data: post, error } = await userClient
    .from("quad_posts")
    .select(QUAD_POSTS_WITH_PROFILE_SELECT)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    throw new ApiError(400, error.message, "SHARED_POST_FETCH_FAILED");
  }

  if (!post) {
    return {
      postId,
      postType,
      authorId: "",
      authorName: "Unknown",
      authorUsername: "unknown",
      authorAvatar: "🎓",
      caption: "",
      imageUrl: null,
      locationName: args.locationName ?? null,
      unavailable: true,
    };
  }

  const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  if (post.is_anonymous === true) {
    const presented = anonymousAuthorPresentation(false);
    return {
      postId,
      postType,
      authorId: presented.authorId,
      authorName: presented.authorName,
      authorUsername: presented.authorUsername,
      authorAvatar: presented.authorAvatar,
      caption: String(post.body ?? "").slice(0, 500),
      imageUrl:
        post.media_type === "video"
          ? (post.poster_url?.trim() || null)
          : (post.proof_url?.trim() || null),
      mediaType: post.media_type === "video" || post.media_type === "image" ? post.media_type : post.proof_url ? "image" : "none",
      locationName: args.locationName ?? post.location_name ?? null,
    };
  }
  const authorId = post.user_id as string;
  const canView = await viewerCanSeeQuadPost({
    userClient,
    viewerId,
    authorId,
    visibility: String(post.visibility ?? "public"),
  });

  const authorName = profile?.display_name?.trim() || "Student";
  const authorUsername = profile?.username?.trim() || "student";
  const authorAvatar = resolveProfileAvatar(profile ?? undefined);

  if (!canView) {
    return {
      postId,
      postType,
      authorId,
      authorName,
      authorUsername,
      authorAvatar,
      caption: "",
      imageUrl: null,
      locationName: args.locationName ?? post.location_name ?? null,
      locked: true,
    };
  }

  const mediaType =
    post.media_type === "video" || post.media_type === "image" ? post.media_type : post.proof_url ? "image" : "none";
  const imageUrl =
    mediaType === "video"
      ? (post.poster_url?.trim() || null)
      : (post.proof_url?.trim() || null);
  const mediaCount = Number(post.media_count ?? (imageUrl ? 1 : 0));

  return {
    postId,
    postType,
    authorId,
    authorName,
    authorUsername,
    authorAvatar,
    caption: String(post.body ?? "").slice(0, 500),
    imageUrl,
    mediaType,
    mediaCount,
    locationName: args.locationName ?? post.location_name ?? null,
  };
}

export async function resolveSharedPostForViewer(args: {
  userClient: SupabaseClientLike;
  viewerId: string;
  preview: SharedPostPreview;
}): Promise<SharedPostPreview> {
  if (args.preview.unavailable) return args.preview;
  const fresh = await buildSharedPostPreview({
    userClient: args.userClient,
    viewerId: args.viewerId,
    postId: args.preview.postId,
    postType: args.preview.postType,
    locationName: args.preview.locationName,
  });
  return fresh;
}

export { MESSAGE_SELECT };
