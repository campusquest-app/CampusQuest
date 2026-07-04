import { describe, expect, it } from "vitest";
import {
  applyConversationReadOptimistic,
  clampUnreadCount,
  isConversationUnread,
  reconcileUnreadBadgeAfterConfirm,
} from "@/lib/client/inboxReadSync";

const ME = "user-me";
const THEM = "user-them";

describe("inboxReadSync", () => {
  describe("clampUnreadCount", () => {
    it("never returns negative values", () => {
      expect(clampUnreadCount(-3)).toBe(0);
      expect(clampUnreadCount(0)).toBe(0);
      expect(clampUnreadCount(4.9)).toBe(4);
    });
  });

  describe("isConversationUnread", () => {
    it("detects unread direct messages from the other participant", () => {
      expect(
        isConversationUnread(
          {
            type: "direct",
            conversationId: "c1",
            otherUser: { id: THEM },
            latestMessage: {
              senderId: THEM,
              readAt: null,
            },
            lastReadAt: null,
          },
          ME,
        ),
      ).toBe(true);
    });

    it("treats own latest message as read", () => {
      expect(
        isConversationUnread(
          {
            type: "direct",
            conversationId: "c1",
            otherUser: { id: THEM },
            latestMessage: {
              senderId: ME,
              readAt: null,
            },
            lastReadAt: null,
          },
          ME,
        ),
      ).toBe(false);
    });

    it("detects unread group messages after lastReadAt", () => {
      expect(
        isConversationUnread(
          {
            type: "group",
            conversationId: "g1",
            latestMessage: {
              senderId: THEM,
              createdAt: "2026-07-04T12:00:00.000Z",
            },
            lastReadAt: "2026-07-04T11:00:00.000Z",
          },
          ME,
        ),
      ).toBe(true);
    });
  });

  describe("applyConversationReadOptimistic", () => {
    it("marks the matching direct conversation as read", () => {
      const readAt = "2026-07-04T12:30:00.000Z";
      const next = applyConversationReadOptimistic(
        [
          {
            type: "direct",
            conversationId: "c1",
            otherUser: { id: THEM },
            latestMessage: {
              senderId: THEM,
              readAt: null,
            },
            lastReadAt: null,
          },
        ],
        "c1",
        ME,
        readAt,
      );
      expect(next[0]?.type).toBe("direct");
      if (next[0]?.type === "direct") {
        expect(next[0].lastReadAt).toBe(readAt);
        expect(next[0].latestMessage?.readAt).toBe(readAt);
      }
    });

    it("leaves unrelated conversations unchanged", () => {
      const rows = applyConversationReadOptimistic(
        [
          {
            type: "direct",
            conversationId: "c1",
            otherUser: { id: THEM },
            latestMessage: { senderId: THEM, readAt: null },
            lastReadAt: null,
          },
          {
            type: "direct",
            conversationId: "c2",
            otherUser: { id: "other" },
            latestMessage: { senderId: "other", readAt: null },
            lastReadAt: null,
          },
        ],
        "c1",
        ME,
        "2026-07-04T12:30:00.000Z",
      );
      expect(rows).toHaveLength(2);
      if (rows[1]?.type === "direct") {
        expect(rows[1].latestMessage?.readAt).toBeNull();
      }
    });
  });

  describe("reconcileUnreadBadgeAfterConfirm", () => {
    it("decrements by five when one was already optimistically removed", () => {
      expect(reconcileUnreadBadgeAfterConfirm(9, 5, 1)).toBe(5);
    });

    it("restores badge when server marks zero notifications read", () => {
      expect(reconcileUnreadBadgeAfterConfirm(9, 0, 1)).toBe(10);
    });

    it("reaches zero without going negative", () => {
      expect(reconcileUnreadBadgeAfterConfirm(2, 3, 1)).toBe(0);
    });

    it("handles opening a single-notification conversation", () => {
      expect(reconcileUnreadBadgeAfterConfirm(9, 1, 1)).toBe(9);
    });
  });
});
