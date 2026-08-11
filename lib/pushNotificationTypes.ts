/**
 * Push notification types that generate a native alert (v1).
 * Everything else stays in-app only to avoid notification spam.
 */
export const PUSH_ENABLED_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "direct_message",
  "friend_request",
  "connection_accepted",
  "quad_post_mention",
  "quad_post_tag",
  "quad_post_tag_approval",
  "quad_post_comment",
  "organization_request_approved",
  "organization_request_denied",
  "moderation_safety_update",
  "organization_event_announcement",
]);

export type PushCategory = "messages" | "social" | "events" | "system";

export function pushCategoryForType(type: string): PushCategory {
  switch (type) {
    case "direct_message":
      return "messages";
    case "organization_event_announcement":
      return "events";
    case "moderation_safety_update":
    case "organization_request_approved":
    case "organization_request_denied":
      return "system";
    default:
      return "social";
  }
}

export type PushPayload = {
  type: string;
  notificationId: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  conversationId?: string | null;
  postId?: string | null;
  eventId?: string | null;
};

export function buildPushPayload(args: {
  type: string;
  notificationId: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}): PushPayload {
  const relatedEntityType = args.relatedEntityType ?? null;
  const relatedEntityId = args.relatedEntityId ?? null;
  return {
    type: args.type,
    notificationId: args.notificationId,
    relatedEntityType,
    relatedEntityId,
    conversationId: relatedEntityType === "conversation" ? relatedEntityId : null,
    postId: relatedEntityType === "quad_post" ? relatedEntityId : null,
    eventId: relatedEntityType === "event" ? relatedEntityId : null,
  };
}
