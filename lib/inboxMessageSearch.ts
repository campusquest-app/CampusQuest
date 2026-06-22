import { conversationPreviewText, type DirectMessageType } from "@/lib/client/dmMessagesClient";

export type InboxConversationRow = {
  type?: "direct" | "group";
  conversationId: string;
  otherUser?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  latestMessage: {
    id: string;
    senderId: string;
    recipientId: string | null;
    content: string;
    type?: DirectMessageType;
    previewText?: string;
    createdAt: string;
    readAt: string | null;
  } | null;
  lastReadAt?: string | null;
};

export type InboxFriendRow = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
};

export type InboxGroupChatRow = {
  conversationId: string;
  name: string;
  memberCount: number;
  memberNames?: string[];
  memberAvatars?: string[];
  latestMessage: string | null;
  latestMessageAt: string | null;
  lastReadAt?: string | null;
};

export type InboxMessageSearchResult =
  | {
      kind: "conversation";
      key: string;
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
      subtitle: string;
      meta: string | null;
      conversationId: string;
    }
  | {
      kind: "friend";
      key: string;
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
      subtitle: string;
      meta: string | null;
    }
  | {
      kind: "group";
      key: string;
      conversationId: string;
      name: string;
      avatar: string;
      memberAvatars: string[];
      subtitle: string;
      meta: string | null;
    };

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/^@/, "");
}

function haystackIncludes(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle);
}

function matchesPerson(
  query: string,
  fields: { displayName: string; username: string; extra?: string[] },
): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  if (haystackIncludes(fields.displayName, q)) return true;
  if (haystackIncludes(fields.username, q)) return true;
  if (fields.extra?.some((value) => haystackIncludes(value, q))) return true;
  return false;
}

function matchesGroup(query: string, group: InboxGroupChatRow): boolean {
  const q = normalizeQuery(query);
  if (!q) return false;
  if (haystackIncludes(group.name, q)) return true;
  return (group.memberNames ?? []).some((name) => haystackIncludes(name, q));
}

function isDirectConversation(row: InboxConversationRow): row is InboxConversationRow & {
  otherUser: NonNullable<InboxConversationRow["otherUser"]>;
} {
  return (row.type ?? "direct") !== "group" && Boolean(row.otherUser);
}

function conversationSortTime(row: InboxConversationRow): number {
  return new Date(row.latestMessage?.createdAt ?? 0).getTime();
}

export function buildInboxMessageSearchResults(args: {
  query: string;
  conversations: InboxConversationRow[];
  friends: InboxFriendRow[];
  groupChats?: InboxGroupChatRow[];
  avatarForFriend: (friend: InboxFriendRow) => string;
}): InboxMessageSearchResult[] {
  const q = normalizeQuery(args.query);
  const groupChats = args.groupChats ?? [];

  if (!q) {
    const directResults: InboxMessageSearchResult[] = [...args.conversations]
      .filter(isDirectConversation)
      .sort((a, b) => conversationSortTime(b) - conversationSortTime(a))
      .map((conversation) => ({
        kind: "conversation" as const,
        key: `conversation:${conversation.conversationId}`,
        userId: conversation.otherUser.id,
        username: conversation.otherUser.username,
        displayName: conversation.otherUser.displayName,
        avatar: conversation.otherUser.avatarUrl ?? "🎓",
        subtitle: conversationPreviewText(conversation.latestMessage),
        meta: conversation.latestMessage?.createdAt ?? null,
        conversationId: conversation.conversationId,
      }));

    const groupResults: InboxMessageSearchResult[] = groupChats
      .sort((a, b) => new Date(b.latestMessageAt ?? 0).getTime() - new Date(a.latestMessageAt ?? 0).getTime())
      .map((group) => ({
        kind: "group" as const,
        key: `group:${group.conversationId}`,
        conversationId: group.conversationId,
        name: group.name,
        avatar: "👥",
        memberAvatars: group.memberAvatars ?? [],
        subtitle: group.latestMessage ?? "No messages yet",
        meta: group.latestMessageAt,
      }));

    return [...directResults, ...groupResults].sort((a, b) => {
      const aTime = new Date(a.meta ?? 0).getTime();
      const bTime = new Date(b.meta ?? 0).getTime();
      return bTime - aTime;
    });
  }

  const conversationUserIds = new Set(
    args.conversations.filter(isDirectConversation).map((row) => row.otherUser.id),
  );

  const conversationResults: InboxMessageSearchResult[] = args.conversations
    .filter(isDirectConversation)
    .filter((conversation) =>
      matchesPerson(q, {
        displayName: conversation.otherUser.displayName,
        username: conversation.otherUser.username,
      }),
    )
    .sort((a, b) => conversationSortTime(b) - conversationSortTime(a))
    .map((conversation) => ({
      kind: "conversation" as const,
      key: `conversation:${conversation.conversationId}`,
      userId: conversation.otherUser.id,
      username: conversation.otherUser.username,
      displayName: conversation.otherUser.displayName,
      avatar: conversation.otherUser.avatarUrl ?? "🎓",
      subtitle: conversationPreviewText(conversation.latestMessage),
      meta: conversation.latestMessage?.createdAt ?? null,
      conversationId: conversation.conversationId,
    }));

  const friendResults: InboxMessageSearchResult[] = args.friends
    .filter((friend) => !conversationUserIds.has(friend.userId))
    .filter((friend) =>
      matchesPerson(q, {
        displayName: friend.displayName,
        username: friend.username,
      }),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((friend) => ({
      kind: "friend" as const,
      key: `friend:${friend.userId}`,
      userId: friend.userId,
      username: friend.username,
      displayName: friend.displayName,
      avatar: args.avatarForFriend(friend),
      subtitle: `@${friend.username}`,
      meta: null,
    }));

  const groupResults: InboxMessageSearchResult[] = groupChats
    .filter((group) => matchesGroup(q, group))
    .sort((a, b) => new Date(b.latestMessageAt ?? 0).getTime() - new Date(a.latestMessageAt ?? 0).getTime())
    .map((group) => ({
      kind: "group" as const,
      key: `group:${group.conversationId}`,
      conversationId: group.conversationId,
      name: group.name,
      avatar: "👥",
      memberAvatars: group.memberAvatars ?? [],
      subtitle: group.latestMessage ?? "No messages yet",
      meta: group.latestMessageAt,
    }));

  return [...conversationResults, ...friendResults, ...groupResults];
}
