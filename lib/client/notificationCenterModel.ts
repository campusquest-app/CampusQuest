export type NotificationFilter = "all" | "unread";

export type NotificationIconKind =
  | "message"
  | "social"
  | "event"
  | "announcement"
  | "organization"
  | "safety"
  | "verification"
  | "marketplace"
  | "quad"
  | "general";

export type NotificationLike = {
  id: string;
  type: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationDisplayItem<T extends NotificationLike> = {
  key: string;
  notification: T;
  /** Every notification row this card represents (DM rows collapse per conversation). */
  ids: string[];
  unreadIds: string[];
  messageCount: number;
};

export function notificationIconKind(type: string): NotificationIconKind {
  if (type === "direct_message") return "message";
  if (type === "friend_request" || type === "connection_accepted") return "social";
  if (type === "event_rsvp_reminder") return "event";
  if (type === "organization_event_announcement") return "announcement";
  if (type.startsWith("organization_")) return "organization";
  if (type === "moderation_safety_update") return "safety";
  if (type.startsWith("verification_request_")) return "verification";
  if (type.startsWith("marketplace_")) return "marketplace";
  if (type.startsWith("quad")) return "quad";
  return "general";
}

function createdAtMs(item: NotificationLike) {
  const ms = new Date(item.createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Newest-first cards. Direct-message rows are written once per message, so all rows
 * for the same conversation collapse into a single card to avoid duplicate entries.
 */
export function buildNotificationDisplayItems<T extends NotificationLike>(
  notifications: readonly T[],
  filter: NotificationFilter = "all",
): NotificationDisplayItem<T>[] {
  const sorted = [...notifications].sort((a, b) => createdAtMs(b) - createdAtMs(a));
  const seenIds = new Set<string>();
  const byConversation = new Map<string, NotificationDisplayItem<T>>();
  const items: NotificationDisplayItem<T>[] = [];

  for (const notification of sorted) {
    if (seenIds.has(notification.id)) continue;
    seenIds.add(notification.id);
    const unread = !notification.readAt;
    const conversationKey =
      notification.type === "direct_message" &&
      notification.relatedEntityType === "conversation" &&
      notification.relatedEntityId
        ? notification.relatedEntityId
        : null;

    if (conversationKey) {
      const existing = byConversation.get(conversationKey);
      if (existing) {
        existing.ids.push(notification.id);
        if (unread) existing.unreadIds.push(notification.id);
        existing.messageCount += 1;
        continue;
      }
      const item: NotificationDisplayItem<T> = {
        key: `conversation:${conversationKey}`,
        notification,
        ids: [notification.id],
        unreadIds: unread ? [notification.id] : [],
        messageCount: 1,
      };
      byConversation.set(conversationKey, item);
      items.push(item);
      continue;
    }

    items.push({
      key: notification.id,
      notification,
      ids: [notification.id],
      unreadIds: unread ? [notification.id] : [],
      messageCount: 1,
    });
  }

  return filter === "unread" ? items.filter((item) => item.unreadIds.length > 0) : items;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatNotificationTime(createdAt: string, now: number = Date.now()): string {
  const ms = new Date(createdAt).getTime();
  if (!Number.isFinite(ms)) return "";
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
