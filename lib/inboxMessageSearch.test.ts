import { describe, expect, it } from "vitest";
import { buildInboxMessageSearchResults, type InboxConversationRow, type InboxFriendRow } from "./inboxMessageSearch";

const conversations: InboxConversationRow[] = [
  {
    conversationId: "c1",
    otherUser: { id: "u1", username: "alex_rhody", displayName: "Alex Kim", avatarUrl: null },
    latestMessage: {
      id: "m1",
      senderId: "u1",
      recipientId: "me",
      content: "See you at the library",
      createdAt: "2026-06-01T12:00:00.000Z",
      readAt: null,
    },
  },
];

const friends: InboxFriendRow[] = [
  {
    userId: "u2",
    username: "jamie_ram",
    displayName: "Jamie Ram",
    avatarUrl: null,
    avatarCustomJson: null,
  },
];

describe("buildInboxMessageSearchResults", () => {
  it("returns conversations when search is empty", () => {
    const results = buildInboxMessageSearchResults({
      query: "",
      conversations,
      friends,
      avatarForFriend: () => "🎓",
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("conversation");
  });

  it("finds friends without conversations", () => {
    const results = buildInboxMessageSearchResults({
      query: "jamie",
      conversations,
      friends,
      avatarForFriend: () => "🎓",
    });
    expect(results.some((row) => row.kind === "friend" && row.displayName === "Jamie Ram")).toBe(true);
  });

  it("matches usernames with @ prefix", () => {
    const results = buildInboxMessageSearchResults({
      query: "@alex",
      conversations,
      friends,
      avatarForFriend: () => "🎓",
    });
    expect(results.some((row) => row.kind === "conversation")).toBe(true);
  });
});
