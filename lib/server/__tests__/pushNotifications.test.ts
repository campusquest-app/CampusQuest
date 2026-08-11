import { describe, expect, it } from "vitest";
import {
  buildPushPayload,
  PUSH_ENABLED_NOTIFICATION_TYPES,
  pushCategoryForType,
} from "@/lib/pushNotificationTypes";
import { isApnsConfigured } from "@/lib/server/apnsProvider";

describe("push notification type policy", () => {
  it("pushes high-signal social and message types", () => {
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("direct_message")).toBe(true);
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("friend_request")).toBe(true);
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("quad_post_mention")).toBe(true);
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("quad_post_comment")).toBe(true);
  });

  it("does not push noisy like or self-RSVP types", () => {
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("quad_post_like")).toBe(false);
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("event_rsvp_reminder")).toBe(false);
  });

  it("maps categories for preference checks", () => {
    expect(pushCategoryForType("direct_message")).toBe("messages");
    expect(pushCategoryForType("friend_request")).toBe("social");
    expect(pushCategoryForType("organization_event_announcement")).toBe("events");
    expect(pushCategoryForType("moderation_safety_update")).toBe("system");
  });

  it("builds deep-link metadata without message body secrets", () => {
    const payload = buildPushPayload({
      type: "direct_message",
      notificationId: "n1",
      relatedEntityType: "conversation",
      relatedEntityId: "c1",
    });
    expect(payload.conversationId).toBe("c1");
    expect(payload.notificationId).toBe("n1");
    expect(payload).not.toHaveProperty("body");
  });

  it("maps post and event entity types for navigation", () => {
    expect(
      buildPushPayload({
        type: "quad_post_comment",
        notificationId: "n2",
        relatedEntityType: "quad_post",
        relatedEntityId: "p1",
      }).postId,
    ).toBe("p1");
    expect(
      buildPushPayload({
        type: "organization_event_announcement",
        notificationId: "n3",
        relatedEntityType: "event",
        relatedEntityId: "e1",
      }).eventId,
    ).toBe("e1");
  });
});

describe("apns configuration", () => {
  it("reports unconfigured when APNs env vars are absent", () => {
    const prev = {
      APNS_KEY_ID: process.env.APNS_KEY_ID,
      APNS_TEAM_ID: process.env.APNS_TEAM_ID,
      APNS_P8_KEY: process.env.APNS_P8_KEY,
    };
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_P8_KEY;
    expect(isApnsConfigured()).toBe(false);
    process.env.APNS_KEY_ID = prev.APNS_KEY_ID;
    process.env.APNS_TEAM_ID = prev.APNS_TEAM_ID;
    process.env.APNS_P8_KEY = prev.APNS_P8_KEY;
  });
});
