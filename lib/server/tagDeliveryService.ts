/**
 * Idempotent tag → notification + shared-post DM delivery.
 *
 * Only server-side callers (postTagService / approve route) invoke this.
 * The client can never forge tagged-post system DMs.
 *
 * Rules:
 * - Self-tags: nothing
 * - Blocked either way: nothing
 * - Pending tags: approval notification only (no DM)
 * - Approved user tags: standard notification + shared-post DM (if viewer can see post)
 * - Org/event tags: steward notifications only — never personal DMs
 * - Retries / re-edits: unique(tag_id, recipient) + one DM per (post, recipient)
 */

import { resolveProfileAvatar } from "@/lib/avatarSource";
import { buildSharedPostPreview, type SharedPostPreview } from "@/lib/server/dmRichMessages";
import { ApiError } from "@/lib/server/http";
import { createNotification, type CampusNotificationType } from "@/lib/server/notifications";
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { createAdminClient } from "@/lib/server/supabase";

type Admin = ReturnType<typeof createAdminClient>;

function directKeyFor(a: string, b: string) {
  return [a, b].sort().join("|");
}

async function areBlocked(admin: Admin, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const { data } = await admin
    .from("blocked_users")
    .select("id")
    .or(
      `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`,
    )
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function viewerCanSeePost(admin: Admin, viewerId: string, postId: string): Promise<{
  ok: boolean;
  visibility: string | null;
}> {
  const { data: post } = await admin
    .from("quad_posts")
    .select("id, user_id, visibility")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { ok: false, visibility: null };
  if (post.user_id === viewerId) return { ok: true, visibility: String(post.visibility ?? "public") };
  if (post.visibility === "public") return { ok: true, visibility: "public" };
  if (post.visibility !== "friends") return { ok: false, visibility: String(post.visibility ?? "") };

  const { data: connection } = await admin
    .from("student_connections")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${viewerId},addressee_id.eq.${post.user_id}),and(requester_id.eq.${post.user_id},addressee_id.eq.${viewerId})`,
    )
    .limit(1)
    .maybeSingle();
  return { ok: Boolean(connection?.id), visibility: "friends" };
}

/**
 * Tag deliveries may open a 1:1 conversation even without an accepted connection.
 * Blocks still apply. Service-role only.
 */
export async function getOrCreateDirectConversationForTagDelivery(args: {
  admin: Admin;
  authorId: string;
  recipientUserId: string;
}): Promise<{ id: string }> {
  const { admin, authorId, recipientUserId } = args;
  if (authorId === recipientUserId) {
    throw new ApiError(400, "Cannot deliver tag DM to self.", "TAG_DM_SELF");
  }
  if (await areBlocked(admin, authorId, recipientUserId)) {
    throw new ApiError(403, "Blocked users cannot receive tag DMs.", "TAG_DM_BLOCKED");
  }

  const directKey = directKeyFor(authorId, recipientUserId);
  const { data: conversation, error: conversationError } = await admin
    .from("direct_conversations")
    .upsert({ direct_key: directKey, created_by: authorId, type: "direct" }, { onConflict: "direct_key" })
    .select("id")
    .single();
  if (conversationError || !conversation) {
    throw new ApiError(
      400,
      conversationError?.message ?? "Could not create conversation.",
      "TAG_DM_CONVERSATION_FAILED",
    );
  }

  const { error: participantError } = await admin.from("direct_conversation_participants").upsert(
    [
      { conversation_id: conversation.id, user_id: authorId },
      { conversation_id: conversation.id, user_id: recipientUserId },
    ],
    { onConflict: "conversation_id,user_id" },
  );
  if (participantError) {
    throw new ApiError(400, participantError.message, "TAG_DM_PARTICIPANT_FAILED");
  }

  return conversation;
}

async function ensureDeliveryRow(args: {
  admin: Admin;
  tagId: string;
  recipientUserId: string;
  postId: string;
}): Promise<{
  id: string;
  notification_id: string | null;
  message_id: string | null;
  notification_delivered_at: string | null;
  dm_delivered_at: string | null;
}> {
  const { admin, tagId, recipientUserId, postId } = args;
  const { data: existing } = await admin
    .from("tag_deliveries")
    .select("id, notification_id, message_id, notification_delivered_at, dm_delivered_at")
    .eq("tag_id", tagId)
    .eq("recipient_user_id", recipientUserId)
    .maybeSingle();
  if (existing) return existing as never;

  const { data: inserted, error } = await admin
    .from("tag_deliveries")
    .insert({
      tag_id: tagId,
      recipient_user_id: recipientUserId,
      post_id: postId,
    })
    .select("id, notification_id, message_id, notification_delivered_at, dm_delivered_at")
    .single();

  if (error) {
    // Race: another worker inserted the same unique key — re-read.
    const { data: raced } = await admin
      .from("tag_deliveries")
      .select("id, notification_id, message_id, notification_delivered_at, dm_delivered_at")
      .eq("tag_id", tagId)
      .eq("recipient_user_id", recipientUserId)
      .maybeSingle();
    if (raced) return raced as never;
    throw new ApiError(400, error.message, "TAG_DELIVERY_UPSERT_FAILED");
  }
  return inserted as never;
}

async function postAlreadyHasDm(admin: Admin, postId: string, recipientUserId: string): Promise<boolean> {
  const { data } = await admin
    .from("tag_deliveries")
    .select("id")
    .eq("post_id", postId)
    .eq("recipient_user_id", recipientUserId)
    .not("message_id", "is", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function insertTaggedSharedPostMessage(args: {
  admin: Admin;
  conversationId: string;
  authorId: string;
  recipientUserId: string;
  postId: string;
  tagId: string;
  authorUsername: string;
  preview: SharedPostPreview;
}): Promise<string> {
  const {
    admin,
    conversationId,
    authorId,
    recipientUserId,
    postId,
    tagId,
    authorUsername,
    preview,
  } = args;

  const content = `${authorUsername} tagged you in a post.`;
  const metadata = {
    post_id: postId,
    reason: "tagged_in_post" as const,
    tag_id: tagId,
    sharedPostPreview: preview,
    systemGenerated: true,
  };

  const { data: inserted, error } = await admin
    .from("direct_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: authorId,
      recipient_id: recipientUserId,
      content,
      type: "shared_post",
      image_url: null,
      shared_post_id: postId,
      shared_post_type: "quad",
      metadata,
    })
    .select("id, created_at")
    .single();
  if (error || !inserted) {
    throw new ApiError(400, error?.message ?? "Could not send tag DM.", "TAG_DM_SEND_FAILED");
  }

  await Promise.all([
    admin.from("direct_conversations").update({ updated_at: inserted.created_at }).eq("id", conversationId),
    admin
      .from("direct_conversation_participants")
      .update({ updated_at: inserted.created_at })
      .eq("conversation_id", conversationId),
  ]);

  // No separate direct_message notification — the tag notification covers the inbox alert.
  return inserted.id as string;
}

export type DeliverUserTagInput = {
  tagId: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  recipientUserId: string;
  /** pending → approval notif only; approved → standard notif + DM */
  status: "pending" | "approved";
};

export type DeliverUserTagResult = {
  notificationId: string | null;
  messageId: string | null;
  skippedReason?: string;
};

export async function deliverApprovedUserTag(input: DeliverUserTagInput): Promise<DeliverUserTagResult> {
  const admin = createAdminClient();
  const { tagId, postId, authorId, authorUsername, recipientUserId, status } = input;

  if (authorId === recipientUserId) {
    return { notificationId: null, messageId: null, skippedReason: "self" };
  }
  if (await areBlocked(admin, authorId, recipientUserId)) {
    return { notificationId: null, messageId: null, skippedReason: "blocked" };
  }

  const delivery = await ensureDeliveryRow({ admin, tagId, recipientUserId, postId });

  let notificationId = delivery.notification_id;
  let messageId = delivery.message_id;

  // --- Notification ---
  // Pending → review notif once.
  // Approved → standard notif once (also fires after a prior review notif on approve).
  // Retries after a standard notif already landed do not create another.
  let shouldNotify = false;
  if (status === "pending") {
    shouldNotify = !delivery.notification_delivered_at;
  } else if (!delivery.dm_delivered_at) {
    if (!delivery.notification_delivered_at) {
      shouldNotify = true;
    } else if (delivery.notification_id) {
      const { data: existingNotif } = await admin
        .from("notifications")
        .select("type")
        .eq("id", delivery.notification_id)
        .maybeSingle();
      shouldNotify = existingNotif?.type === "quad_post_tag_approval";
    }
  }

  if (shouldNotify) {
    const isPending = status === "pending";
    const type: CampusNotificationType = isPending ? "quad_post_tag_approval" : "quad_post_tag";
    const body = isPending
      ? `${authorUsername} tagged you in a post. Review tag.`
      : `${authorUsername} tagged you in a post.`;

    try {
      const created = await createNotification({
        userId: recipientUserId,
        type,
        title: isPending ? "Review a tag" : "You were tagged",
        body,
        relatedEntityType: "quad_post",
        relatedEntityId: postId,
        actorId: authorId,
      });
      notificationId = created.id;
      await admin
        .from("tag_deliveries")
        .update({
          notification_id: notificationId,
          notification_delivered_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
    } catch (error) {
      console.warn("[cq][tag-delivery] notification failed", {
        tagId,
        recipientUserId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --- Shared-post DM (approved only, privacy-respecting, once per post+recipient) ---
  if (status !== "approved") {
    return { notificationId, messageId, skippedReason: "pending" };
  }
  if (delivery.dm_delivered_at || messageId) {
    return { notificationId, messageId };
  }
  if (await postAlreadyHasDm(admin, postId, recipientUserId)) {
    // Another tag on this post already DMed the recipient — mark this row's DM skipped
    // by stamping dm_delivered_at without a message_id? Better: leave null so only
    // the unique (post,recipient) with message wins. No second DM.
    return { notificationId, messageId: null, skippedReason: "dm_already_sent_for_post" };
  }

  const visibility = await viewerCanSeePost(admin, recipientUserId, postId);
  if (!visibility.ok) {
    return { notificationId, messageId: null, skippedReason: "privacy" };
  }

  try {
    const conversation = await getOrCreateDirectConversationForTagDelivery({
      admin,
      authorId,
      recipientUserId,
    });

    // Build preview as the *tagged recipient* so privacy matches their view.
    const preview = await buildSharedPostPreview({
      userClient: admin,
      viewerId: recipientUserId,
      postId,
      postType: "quad",
    });
    if (preview.unavailable || preview.locked) {
      return { notificationId, messageId: null, skippedReason: preview.locked ? "privacy" : "unavailable" };
    }

    // Enrich caption/author from author-facing select if preview is thin.
    if (!preview.authorUsername) {
      const { data: post } = await admin
        .from("quad_posts")
        .select(QUAD_POSTS_WITH_PROFILE_SELECT)
        .eq("id", postId)
        .maybeSingle();
      const profile = post ? (Array.isArray(post.profiles) ? post.profiles[0] : post.profiles) : null;
      if (profile) {
        preview.authorName = profile.display_name?.trim() || preview.authorName;
        preview.authorUsername = profile.username?.trim() || authorUsername;
        preview.authorAvatar = resolveProfileAvatar(profile);
      }
    }

    messageId = await insertTaggedSharedPostMessage({
      admin,
      conversationId: conversation.id,
      authorId,
      recipientUserId,
      postId,
      tagId,
      authorUsername,
      preview,
    });

    await admin
      .from("tag_deliveries")
      .update({
        message_id: messageId,
        dm_delivered_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
  } catch (error) {
    // Unique index may race on one-dm-per-post; treat as success-noop.
    const code = (error as { code?: string })?.code;
    if (code === "23505") {
      return { notificationId, messageId: null, skippedReason: "dm_race_duplicate" };
    }
    console.warn("[cq][tag-delivery] dm failed", {
      tagId,
      recipientUserId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      notificationId,
      messageId: null,
      skippedReason: error instanceof ApiError ? error.code : "dm_failed",
    };
  }

  return { notificationId, messageId };
}

/** Pure helpers exported for unit tests. */
export function buildTagNotificationCopy(args: {
  authorUsername: string;
  pending: boolean;
}): { type: CampusNotificationType; title: string; body: string } {
  if (args.pending) {
    return {
      type: "quad_post_tag_approval",
      title: "Review a tag",
      body: `${args.authorUsername} tagged you in a post. Review tag.`,
    };
  }
  return {
    type: "quad_post_tag",
    title: "You were tagged",
    body: `${args.authorUsername} tagged you in a post.`,
  };
}

export function shouldSendTagDm(args: {
  status: "pending" | "approved";
  isSelf: boolean;
  blocked: boolean;
  canViewPost: boolean;
  alreadyDeliveredDm: boolean;
}): boolean {
  if (args.isSelf || args.blocked || args.alreadyDeliveredDm) return false;
  if (args.status !== "approved") return false;
  return args.canViewPost;
}
