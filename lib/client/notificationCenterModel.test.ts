import { describe, expect, it } from "vitest";
import {
  buildNotificationDisplayItems,
  formatNotificationTime,
  notificationIconKind,
  type NotificationLike,
} from "./notificationCenterModel";

function row(overrides: Partial<NotificationLike> & { id: string }): NotificationLike {
  return {
    type: "event_rsvp_reminder",
    relatedEntityType: "event",
    relatedEntityId: "event-1",
    readAt: null,
    createdAt: "2026-10-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildNotificationDisplayItems", () => {
  it("sorts newest first", () => {
    const items = buildNotificationDisplayItems([
      row({ id: "old", createdAt: "2026-10-13T12:00:00.000Z" }),
      row({ id: "new", createdAt: "2026-10-14T12:00:00.000Z" }),
    ]);
    expect(items.map((item) => item.key)).toEqual(["new", "old"]);
  });

  it("collapses direct-message rows for the same conversation into one card", () => {
    const items = buildNotificationDisplayItems([
      row({ id: "m1", type: "direct_message", relatedEntityType: "conversation", relatedEntityId: "c1", createdAt: "2026-10-14T10:00:00.000Z" }),
      row({ id: "m2", type: "direct_message", relatedEntityType: "conversation", relatedEntityId: "c1", createdAt: "2026-10-14T11:00:00.000Z", readAt: "2026-10-14T11:05:00.000Z" }),
      row({ id: "m3", type: "direct_message", relatedEntityType: "conversation", relatedEntityId: "c2", createdAt: "2026-10-14T09:00:00.000Z" }),
    ]);
    expect(items).toHaveLength(2);
    const c1 = items[0];
    expect(c1.key).toBe("conversation:c1");
    expect(c1.notification.id).toBe("m2");
    expect(c1.ids).toEqual(["m2", "m1"]);
    expect(c1.unreadIds).toEqual(["m1"]);
    expect(c1.messageCount).toBe(2);
    expect(items[1].key).toBe("conversation:c2");
  });

  it("never groups non-message notifications that share an entity", () => {
    const items = buildNotificationDisplayItems([
      row({ id: "a", type: "organization_event_announcement" }),
      row({ id: "b", type: "event_rsvp_reminder" }),
    ]);
    expect(items).toHaveLength(2);
  });

  it("drops repeated rows with the same id", () => {
    const items = buildNotificationDisplayItems([row({ id: "dup" }), row({ id: "dup" })]);
    expect(items).toHaveLength(1);
  });

  it("filters to cards that still have unread rows", () => {
    const items = buildNotificationDisplayItems(
      [
        row({ id: "read", readAt: "2026-10-14T12:01:00.000Z" }),
        row({ id: "unread" }),
        row({ id: "m1", type: "direct_message", relatedEntityType: "conversation", relatedEntityId: "c1", readAt: "2026-10-14T12:01:00.000Z" }),
        row({ id: "m2", type: "direct_message", relatedEntityType: "conversation", relatedEntityId: "c1", createdAt: "2026-10-14T11:00:00.000Z" }),
      ],
      "unread",
    );
    expect(items.map((item) => item.key).sort()).toEqual(["conversation:c1", "unread"]);
  });
});

describe("notificationIconKind", () => {
  it.each([
    ["direct_message", "message"],
    ["friend_request", "social"],
    ["connection_accepted", "social"],
    ["event_rsvp_reminder", "event"],
    ["organization_event_announcement", "announcement"],
    ["organization_request_approved", "organization"],
    ["moderation_safety_update", "safety"],
    ["verification_request_approved", "verification"],
    ["marketplace_offer", "marketplace"],
    ["quad_post_like", "quad"],
    ["something_new", "general"],
  ])("maps %s to %s", (type, kind) => {
    expect(notificationIconKind(type)).toBe(kind);
  });
});

describe("formatNotificationTime", () => {
  const now = new Date("2026-10-14T12:00:00.000Z").getTime();

  it("uses compact relative times for recent activity", () => {
    expect(formatNotificationTime("2026-10-14T11:59:30.000Z", now)).toBe("Just now");
    expect(formatNotificationTime("2026-10-14T11:15:00.000Z", now)).toBe("45m");
    expect(formatNotificationTime("2026-10-14T07:00:00.000Z", now)).toBe("5h");
    expect(formatNotificationTime("2026-10-11T12:00:00.000Z", now)).toBe("3d");
  });

  it("falls back to a date for older activity and tolerates bad input", () => {
    expect(formatNotificationTime("2026-09-01T12:00:00.000Z", now)).not.toMatch(/^\d+[mhd]$/);
    expect(formatNotificationTime("not-a-date", now)).toBe("");
  });
});
