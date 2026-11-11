import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  FUTURE_PUSH_NOTIFICATION_TYPES,
  PUSH_ENABLED_NOTIFICATION_TYPES,
} from "@/lib/pushNotificationTypes";
import {
  apnsDataForDestination,
  assertShareablePost,
  broadcastContentKey,
  destinationAllowedForRole,
  disableDeviceTokens,
  dispatchBroadcastPushes,
  enabledTokensForUser,
  osPermissionStep,
  planBroadcast,
  registerDeviceToken,
  unsentRecipients,
  validateBroadcastDraft,
  type BroadcastDraft,
  type RecipientSnapshot,
} from "@/lib/push/adminBroadcast";

const student: RecipientSnapshot = {
  userId: "student-1",
  role: "student",
  verified: true,
  pushEnabled: true,
  announcementsEnabled: true,
  perksEnabled: false,
  hasIosDevice: true,
};

const business: RecipientSnapshot = {
  userId: "business-1",
  role: "local_business",
  verified: false,
  pushEnabled: true,
  announcementsEnabled: true,
  perksEnabled: true,
  hasIosDevice: true,
};

function draft(overrides: Partial<BroadcastDraft> = {}): BroadcastDraft {
  return {
    mode: "audience",
    audience: "opted_in",
    title: "What's happening at URI?",
    body: "Check the latest posts.",
    category: "announcements",
    destination: { kind: "local_businesses" },
    confirm: "SEND",
    ...overrides,
  };
}

describe("admin push planning", () => {
  it("rejects a test that is not limited to one user", () => {
    expect(validateBroadcastDraft(draft({ mode: "test", audience: "opted_in", confirm: "TEST" }))).toMatch(/one user/);
  });

  it("keeps a test on the selected user when other accounts are present", () => {
    const plan = planBroadcast(
      draft({ mode: "test", audience: "user", userId: student.userId, confirm: "TEST" }),
      [student, business],
    );
    expect(plan.recipients.map((item) => item.userId)).toEqual([student.userId]);
    expect(plan.skipped.outside_test_user).toBe(1);
  });

  it("filters verified students and local business accounts by role", () => {
    const people = [student, { ...student, userId: "staff", role: "faculty_staff" }, business];
    const students = planBroadcast(draft({ audience: "verified_students", destination: { kind: "campus_feed" } }), people);
    expect(students.recipients.map((item) => item.userId)).toEqual([student.userId]);
    const businesses = planBroadcast(draft({ audience: "local_business" }), people);
    expect(businesses.recipients.map((item) => item.userId)).toEqual([business.userId]);
  });

  it("does not send a local business account to the campus feed", () => {
    expect(destinationAllowedForRole("local_business", { kind: "campus_feed" })).toBe(false);
    expect(destinationAllowedForRole("local_business", { kind: "events" })).toBe(false);
    expect(destinationAllowedForRole("local_business", { kind: "post", postId: "post-1" }, "public")).toBe(false);
    expect(destinationAllowedForRole("local_business", { kind: "post", postId: "post-1" }, "local_businesses")).toBe(true);
    const plan = planBroadcast(draft({ destination: { kind: "campus_feed" } }), [student, business]);
    expect(plan.recipients.map((item) => item.userId)).toEqual([student.userId]);
    expect(plan.skipped.destination_forbidden).toBe(1);
  });

  it("respects promotional opt-out and still allows announcements", () => {
    const optedOut = { ...student, perksEnabled: false, announcementsEnabled: false };
    const perks = planBroadcast(draft({ category: "perks", destination: { kind: "student_perks" } }), [student, business]);
    expect(perks.recipients.map((item) => item.userId)).toEqual([business.userId]);
    const announcements = planBroadcast(draft(), [optedOut]);
    expect(announcements.inAppCount).toBe(0);
    expect(announcements.skipped.announcements_off).toBe(1);
  });

  it("does not plan a second inbox row for someone already notified", () => {
    const plan = planBroadcast(draft({ audience: "user", userId: student.userId }), [student]);
    expect(unsentRecipients(plan, new Set([student.userId]))).toEqual([]);
  });

  it("rejects anonymous posts without reading an author", () => {
    const problem = assertShareablePost({ isAnonymous: true, visibility: "public", feed: "public" });
    expect(problem).toMatch(/Anonymous/);
    expect(problem).not.toMatch(/author|user_id/i);
  });

  it("changes the content key when the message changes", () => {
    expect(broadcastContentKey(draft())).not.toBe(broadcastContentKey(draft({ body: "A different message." })));
  });

  it("builds a destination payload without a device token", () => {
    const data = apnsDataForDestination({ kind: "local_businesses" });
    expect(data.destination).toBe("local_businesses");
    expect(data).not.toHaveProperty("device_token");
  });
});

describe("device registration rules", () => {
  it("keeps multiple devices and replaces the owner of one token", () => {
    const first = registerDeviceToken([], "token-a", "student-1");
    const both = registerDeviceToken(first, "token-b", "student-1");
    expect(enabledTokensForUser(both, "student-1")).toEqual(["token-a", "token-b"]);
    const switched = registerDeviceToken(both, "token-a", "student-2");
    expect(enabledTokensForUser(switched, "student-1")).toEqual(["token-b"]);
    expect(enabledTokensForUser(switched, "student-2")).toEqual(["token-a"]);
  });

  it("disables the previous account without disabling the next account", () => {
    const devices = registerDeviceToken(registerDeviceToken([], "token-a", "student-1"), "token-b", "student-2");
    const loggedOut = disableDeviceTokens(devices, "student-1");
    expect(enabledTokensForUser(loggedOut, "student-1")).toEqual([]);
    expect(enabledTokensForUser(loggedOut, "student-2")).toEqual(["token-b"]);
  });

  it("does not request iOS permission again after a denial", () => {
    expect(osPermissionStep("denied")).toBe("stop");
    expect(osPermissionStep("granted")).toBe("register");
    expect(osPermissionStep("prompt")).toBe("request");
  });
});

describe("APNs dispatch", () => {
  const plan = planBroadcast(draft({ mode: "test", audience: "user", userId: student.userId, confirm: "TEST" }), [
    student,
    business,
  ]);

  it("sends a test only to the selected user and records acceptance without a token", async () => {
    const calls: string[] = [];
    const result = await dispatchBroadcastPushes({
      mode: "test",
      testUserId: student.userId,
      recipients: [...plan.recipients, { userId: business.userId, inApp: true, push: true }],
      devices: [
        { userId: student.userId, deviceId: "device-1", token: "secret-student-token", environment: "development" },
        { userId: business.userId, deviceId: "device-2", token: "secret-business-token", environment: "production" },
      ],
      alreadyAttempted: new Set(),
      configured: true,
      sender: async (device) => {
        calls.push(device.userId);
        return { ok: true, apnsId: "apple-1" };
      },
    });
    expect(calls).toEqual([student.userId]);
    expect(result.appleContacted).toBe(true);
    expect(result.accepted).toBe(1);
    expect(JSON.stringify(result.attempts)).not.toContain("secret-");
  });

  it("does not call Apple again for a device that was already attempted", async () => {
    let calls = 0;
    const result = await dispatchBroadcastPushes({
      mode: "test",
      testUserId: student.userId,
      recipients: plan.recipients,
      devices: [{ userId: student.userId, deviceId: "device-1", token: "secret-student-token", environment: "development" }],
      alreadyAttempted: new Set([`${student.userId}:device-1`]),
      configured: true,
      sender: async () => {
        calls += 1;
        return { ok: true, apnsId: "apple-2" };
      },
    });
    expect(calls).toBe(0);
    expect(result.appleContacted).toBe(false);
    expect(result.attempts).toEqual([]);
  });

  it("does not contact Apple when credentials are missing", async () => {
    let calls = 0;
    const result = await dispatchBroadcastPushes({
      mode: "test",
      testUserId: student.userId,
      recipients: plan.recipients,
      devices: [{ userId: student.userId, deviceId: "device-1", token: "secret-student-token", environment: "development" }],
      alreadyAttempted: new Set(),
      configured: false,
      sender: async () => {
        calls += 1;
        return { ok: true, apnsId: "nope" };
      },
    });
    expect(calls).toBe(0);
    expect(result.appleContacted).toBe(false);
    expect(result.attempts[0]?.outcome).toBe("not_configured");
  });

  it("marks an invalid token without treating acceptance as delivery", async () => {
    const result = await dispatchBroadcastPushes({
      mode: "audience",
      recipients: planBroadcast(draft(), [student]).recipients,
      devices: [{ userId: student.userId, deviceId: "device-1", token: "expired-token", environment: "production" }],
      alreadyAttempted: new Set(),
      configured: true,
      sender: async () => ({ ok: false, status: 410, reason: "Unregistered", invalidToken: true }),
    });
    expect(result.attempts[0]?.outcome).toBe("invalid_token");
    expect(result.accepted).toBe(0);
  });
});

describe("push announcement wiring", () => {
  it("leaves future automated types disabled and keeps the admin route from calling Apple", () => {
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("campus_announcement")).toBe(false);
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("student_perk_published")).toBe(false);
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("event_rsvp_reminder")).toBe(false);
    expect(FUTURE_PUSH_NOTIFICATION_TYPES.has("campus_announcement")).toBe(true);
    const route = readFileSync(join(process.cwd(), "app/api/internal/admin/push-broadcasts/route.ts"), "utf8");
    expect(route).toContain("requireAdminUser");
    expect(route).toContain("deliverBroadcast");
    expect(route).toContain("Acceptance does not mean");
    const sender = readFileSync(join(process.cwd(), "lib/server/adminPushBroadcast.ts"), "utf8");
    expect(sender).toContain("sendApnsAlert");
    expect(sender).not.toContain("console.log");
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261111180000_admin_push_broadcasts.sql"), "utf8");
    expect(sql).toContain("push_broadcasts_idempotency_unique");
    expect(sql).toContain("apple_contacted boolean not null default false");
    expect(sql).toContain("enable row level security");
    expect(sql).not.toContain("device_token");
    expect(sql).toContain("perks_enabled boolean not null default false");
  });
});
