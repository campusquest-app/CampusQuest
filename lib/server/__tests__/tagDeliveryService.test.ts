import { describe, expect, it } from "vitest";
import {
  buildTagNotificationCopy,
  shouldSendTagDm,
} from "@/lib/server/tagDeliveryService";

describe("buildTagNotificationCopy", () => {
  it("builds the standard tagged copy", () => {
    expect(buildTagNotificationCopy({ authorUsername: "test123", pending: false })).toEqual({
      type: "quad_post_tag",
      title: "You were tagged",
      body: "test123 tagged you in a post.",
    });
  });

  it("builds the manual-approval review copy", () => {
    expect(buildTagNotificationCopy({ authorUsername: "test123", pending: true })).toEqual({
      type: "quad_post_tag_approval",
      title: "Review a tag",
      body: "test123 tagged you in a post. Review tag.",
    });
  });
});

describe("shouldSendTagDm", () => {
  const base = {
    status: "approved" as const,
    isSelf: false,
    blocked: false,
    canViewPost: true,
    alreadyDeliveredDm: false,
  };

  it("sends for newly approved user tags that can view the post", () => {
    expect(shouldSendTagDm(base)).toBe(true);
  });

  it("does not send for self-tags", () => {
    expect(shouldSendTagDm({ ...base, isSelf: true })).toBe(false);
  });

  it("does not send when blocked", () => {
    expect(shouldSendTagDm({ ...base, blocked: true })).toBe(false);
  });

  it("does not send while pending manual approval", () => {
    expect(shouldSendTagDm({ ...base, status: "pending" })).toBe(false);
  });

  it("does not send when following-only / privacy blocks the viewer", () => {
    expect(shouldSendTagDm({ ...base, canViewPost: false })).toBe(false);
  });

  it("does not resend when a DM was already delivered for the post", () => {
    expect(shouldSendTagDm({ ...base, alreadyDeliveredDm: true })).toBe(false);
  });
});

describe("tag delivery acceptance matrix", () => {
  it("covers the required combinations", () => {
    // Students tagged → notif + DM
    expect(
      shouldSendTagDm({
        status: "approved",
        isSelf: false,
        blocked: false,
        canViewPost: true,
        alreadyDeliveredDm: false,
      }),
    ).toBe(true);

    // Faculty/org path is out of this helper — org/event tags never call shouldSendTagDm.
    // Pending until approval → no DM
    expect(
      shouldSendTagDm({
        status: "pending",
        isSelf: false,
        blocked: false,
        canViewPost: true,
        alreadyDeliveredDm: false,
      }),
    ).toBe(false);

    // After approval (alreadyDelivered still false) → DM
    expect(
      shouldSendTagDm({
        status: "approved",
        isSelf: false,
        blocked: false,
        canViewPost: true,
        alreadyDeliveredDm: false,
      }),
    ).toBe(true);

    // Post edit retry for same tag → alreadyDeliveredDm true → no second DM
    expect(
      shouldSendTagDm({
        status: "approved",
        isSelf: false,
        blocked: false,
        canViewPost: true,
        alreadyDeliveredDm: true,
      }),
    ).toBe(false);
  });
});
