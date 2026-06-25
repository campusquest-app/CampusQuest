import { resolveProfileAvatar } from "@/lib/avatarSource";
import { ApiError } from "@/lib/server/http";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { getAcceptedFriendUserIds } from "@/lib/server/friendProfileAccess";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type DirectMessageType = "text" | "image" | "shared_post";
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
const DATA_IMAGE_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/i;
const MAX_DM_IMAGE_BYTES = 5 * 1024 * 1024;

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
  if (args.type === "shared_post") {
    return trimmed && trimmed !== "Shared a post" ? trimmed : "Shared a post";
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

  const { data: publicUrlData } = admin.storage.from(DM_IMAGES_BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicUrlData.publicUrl?.trim();
  if (!publicUrl) {
    throw new ApiError(500, "Could not resolve image URL.", "DM_IMAGE_URL_FAILED");
  }
  return publicUrl;
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

  return {
    postId,
    postType,
    authorId,
    authorName,
    authorUsername,
    authorAvatar,
    caption: String(post.body ?? "").slice(0, 500),
    imageUrl: post.proof_url?.trim() || null,
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
