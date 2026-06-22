import { logNotificationError, logNotificationInfo } from "@/lib/server/notificationDebug";
import { createNotification } from "@/lib/server/notifications";
import { createAdminClient } from "@/lib/server/supabase";

function truncatePreview(text: string, max = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export async function notifyQuadPostLiked(args: {
  postOwnerUserId: string;
  actorUserId: string;
  actorUsername: string;
  postId: string;
}) {
  const { postOwnerUserId, actorUserId, actorUsername, postId } = args;
  if (postOwnerUserId === actorUserId) return null;

  const handle = actorUsername.trim() || "Someone";
  try {
    const notification = await createNotification({
      userId: postOwnerUserId,
      type: "quad_post_like",
      title: "New like on your post",
      body: `${handle} liked your post`,
      relatedEntityType: "quad_post",
      relatedEntityId: postId,
      actorId: actorUserId,
    });
    logNotificationInfo("quad-post-like:created", {
      postId,
      actorUserId,
      postOwnerUserId,
      notificationId: notification.id,
    });
    return notification;
  } catch (error) {
    logNotificationError("quad-post-like:create-failed", {
      postId,
      actorUserId,
      postOwnerUserId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function removeQuadPostLikeNotification(args: {
  postOwnerUserId: string;
  actorUserId: string;
  postId: string;
}) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .delete()
    .eq("user_id", args.postOwnerUserId)
    .eq("type", "quad_post_like")
    .eq("actor_id", args.actorUserId)
    .eq("related_entity_id", args.postId);

  if (error) {
    logNotificationError("quad-post-like:remove-failed", {
      postId: args.postId,
      actorUserId: args.actorUserId,
      postOwnerUserId: args.postOwnerUserId,
      message: error.message,
      code: error.code,
    });
  }
}

export async function notifyQuadPostCommented(args: {
  postOwnerUserId: string;
  actorUserId: string;
  actorUsername: string;
  postId: string;
  commentId: string;
  commentBody: string;
}) {
  const { postOwnerUserId, actorUserId, actorUsername, postId, commentId, commentBody } = args;
  if (postOwnerUserId === actorUserId) return null;

  const handle = actorUsername.trim() || "Someone";
  const preview = truncatePreview(commentBody);
  try {
    const notification = await createNotification({
      userId: postOwnerUserId,
      type: "quad_post_comment",
      title: "New comment on your post",
      body: `${handle} commented: ${preview}`,
      relatedEntityType: "quad_post",
      relatedEntityId: postId,
      actorId: actorUserId,
    });
    logNotificationInfo("quad-post-comment:created", {
      postId,
      commentId,
      actorUserId,
      postOwnerUserId,
      notificationId: notification.id,
    });
    return notification;
  } catch (error) {
    logNotificationError("quad-post-comment:create-failed", {
      postId,
      commentId,
      actorUserId,
      postOwnerUserId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
