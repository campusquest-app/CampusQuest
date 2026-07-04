"use client";

/** Server-reported read sync payload from GET /api/social/conversations/:id/messages */
export type ConversationReadSync = {
  messagesMarkedRead: number;
  notificationsMarkedRead: number;
  readAt: string;
};

export type ConversationReadOptimisticEvent = {
  type: "optimistic";
  conversationId: string;
  otherUserId?: string;
  readAt: string;
};

export type ConversationReadConfirmedEvent = {
  type: "confirmed";
  conversationId: string;
  otherUserId?: string;
  readSync: ConversationReadSync;
};

export type ConversationReadRollbackEvent = {
  type: "rollback";
  conversationId: string;
  otherUserId?: string;
  error: string;
};

export type ConversationReadEvent =
  | ConversationReadOptimisticEvent
  | ConversationReadConfirmedEvent
  | ConversationReadRollbackEvent;

type DirectConversationShape = {
  type: "direct";
  conversationId: string;
  otherUser: { id: string };
  latestMessage: {
    senderId: string;
    readAt: string | null;
  } | null;
  lastReadAt: string | null;
};

type GroupConversationShape = {
  type: "group";
  conversationId: string;
  latestMessage: {
    senderId: string;
    createdAt: string;
  } | null;
  lastReadAt: string | null;
};

export type InboxConversationShape = DirectConversationShape | GroupConversationShape;

const CONVERSATION_READ_EVENT = "campusquest:conversation-read";

export function clampUnreadCount(count: number): number {
  return Math.max(0, Math.floor(count));
}

/** Reconcile global badge after server confirms how many DM notifications were cleared. */
export function reconcileUnreadBadgeAfterConfirm(
  currentBadge: number,
  notificationsMarkedRead: number,
  optimisticDeltaApplied: number,
): number {
  return clampUnreadCount(currentBadge - notificationsMarkedRead + optimisticDeltaApplied);
}

/** True when the conversation row should show an unread indicator. */
export function isConversationUnread(
  conversation: InboxConversationShape,
  currentUserId: string,
): boolean {
  if (conversation.type === "direct") {
    const latest = conversation.latestMessage;
    return Boolean(latest && latest.senderId !== currentUserId && !latest.readAt);
  }
  const latest = conversation.latestMessage;
  if (!latest || latest.senderId === currentUserId) return false;
  if (!conversation.lastReadAt) return true;
  return new Date(latest.createdAt).getTime() > new Date(conversation.lastReadAt).getTime();
}

/** Optimistically mark a conversation as read in local inbox state. */
export function applyConversationReadOptimistic<T extends InboxConversationShape>(
  conversations: T[],
  conversationId: string,
  currentUserId: string,
  readAt: string,
): T[] {
  return conversations.map((row) => {
    if (row.conversationId !== conversationId) return row;
    if (row.type === "direct") {
      const latest = row.latestMessage;
      if (!latest || latest.senderId === currentUserId) {
        return { ...row, lastReadAt: readAt };
      }
      return {
        ...row,
        lastReadAt: readAt,
        latestMessage: { ...latest, readAt },
      };
    }
    return { ...row, lastReadAt: readAt };
  });
}

export function findConversationByOtherUserId<T extends InboxConversationShape>(
  conversations: T[],
  otherUserId: string,
): T | undefined {
  return conversations.find(
    (row) => row.type === "direct" && row.otherUser.id === otherUserId,
  );
}

export function emitConversationRead(event: ConversationReadEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONVERSATION_READ_EVENT, { detail: event }));
}

export function emitConversationReadOptimistic(args: {
  conversationId: string;
  otherUserId?: string;
  readAt?: string;
}): void {
  emitConversationRead({
    type: "optimistic",
    conversationId: args.conversationId,
    otherUserId: args.otherUserId,
    readAt: args.readAt ?? new Date().toISOString(),
  });
}

export function emitConversationReadConfirmed(args: {
  conversationId: string;
  otherUserId?: string;
  readSync: ConversationReadSync;
}): void {
  emitConversationRead({
    type: "confirmed",
    conversationId: args.conversationId,
    otherUserId: args.otherUserId,
    readSync: args.readSync,
  });
}

export function emitConversationReadRollback(args: {
  conversationId: string;
  otherUserId?: string;
  error: string;
}): void {
  emitConversationRead({
    type: "rollback",
    conversationId: args.conversationId,
    otherUserId: args.otherUserId,
    error: args.error,
  });
}

export function subscribeConversationRead(handler: (event: ConversationReadEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<ConversationReadEvent>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(CONVERSATION_READ_EVENT, wrapped);
  return () => window.removeEventListener(CONVERSATION_READ_EVENT, wrapped);
}
