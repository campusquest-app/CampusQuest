import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMBER_COPY, EMBER_ERROR_CODES, isEligibleEmberGiver } from "@/lib/embers";
import { PUSH_ENABLED_NOTIFICATION_TYPES } from "@/lib/pushNotificationTypes";
import { notificationIconKind } from "@/lib/client/notificationCenterModel";

const createNotification = vi.fn();
vi.mock("@/lib/server/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/notifications")>(
    "@/lib/server/notifications",
  );
  return { ...actual, createNotification: (...args: unknown[]) => createNotification(...args) };
});

const adminFrom = vi.fn();
vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => ({ from: adminFrom }),
}));

import { notifyQuadPostEmbered } from "@/lib/server/quadPostNotifications";
import { getViewerEmberAllowance } from "@/lib/server/embers";
import { hasUnlimitedDailyEmbers } from "@/lib/embers";

describe("Ember server policy", () => {
  it("does not add Ember notifications to native push", () => {
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("quad_post_ember")).toBe(false);
    expect(PUSH_ENABLED_NOTIFICATION_TYPES.has("quad_post_like")).toBe(false);
    expect(notificationIconKind("quad_post_ember")).toBe("quad");
  });

  it("keeps historical spark tables and does not drop reaction rows", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20261018020000_ember_daily_allowance.sql"),
      "utf8",
    );
    expect(migration).toContain("reaction_type = 'spark'");
    expect(migration).toContain("ember_daily_limit");
    expect(migration).toContain("America/New_York");
    expect(migration).toContain("quad_post_ember");
    const privacy = readFileSync(
      join(process.cwd(), "supabase/migrations/20261018050000_ember_admin_allowance_and_privacy.sql"),
      "utf8",
    );
    expect(privacy).toContain("actor_role in ('admin', 'super_admin')");
    expect(privacy).toContain("ember_self_not_allowed");
    expect(privacy).toContain("ember_daily_limit");
    expect(privacy).toContain("Read likes and own ember reactions");
    expect(privacy).toContain("revoke select (hype_count)");
    expect(privacy).not.toMatch(/email/i);
    expect(privacy).not.toMatch(/delete from public\.quad_post_reactions/i);
    expect(migration).not.toMatch(/drop table public\.quad_post_reactions/i);
    expect(migration).not.toMatch(/delete from public\.quad_post_reactions/i);
    const original = readFileSync(
      join(process.cwd(), "supabase/migrations/20260606120000_quad_post_reactions.sql"),
      "utf8",
    );
    expect(original).toContain("quad_spark_xp_grants");
  });

  it("rejects unauthorized roles from giving Embers", () => {
    expect(isEligibleEmberGiver({ role: null, student_status: null }).ok).toBe(false);
    const faculty = isEligibleEmberGiver({ role: "faculty_staff" });
    expect(faculty.ok).toBe(false);
    if (!faculty.ok) expect(faculty.code).toBe(EMBER_ERROR_CODES.notEligible);
  });
});

describe("Ember allowance query", () => {
  it("counts only the current campus-day spark rows", async () => {
    const lt = vi.fn().mockResolvedValue({ count: 2, error: null });
    const gte = vi.fn().mockReturnValue({ lt });
    const eqType = vi.fn().mockReturnValue({ gte });
    const eqUser = vi.fn().mockReturnValue({ eq: eqType });
    const select = vi.fn().mockReturnValue({ eq: eqUser });
    const userClient = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { role: "student" }, error: null }),
              }),
            }),
          };
        }
        return { select };
      }),
    };

    const allowance = await getViewerEmberAllowance({
      userClient: userClient as never,
      userId: "user-1",
      now: new Date("2026-07-09T16:00:00.000Z"),
    });

    expect(allowance).toMatchObject({ used: 2, remaining: 1, limit: 3, unlimited: false });
    expect(gte).toHaveBeenCalledWith("created_at", "2026-07-09T04:00:00.000Z");
    expect(lt).toHaveBeenCalledWith("created_at", "2026-07-10T04:00:00.000Z");
  });

  it("does not apply the daily cap when the stored role is admin or super_admin", async () => {
    expect(hasUnlimitedDailyEmbers("admin")).toBe(true);
    const from = vi.fn().mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: "super_admin" }, error: null }),
        }),
      }),
    });
    const allowance = await getViewerEmberAllowance({
      userClient: { from } as never,
      userId: "admin-1",
      now: new Date("2026-07-09T16:00:00.000Z"),
    });
    expect(allowance.unlimited).toBe(true);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(from).not.toHaveBeenCalledWith("quad_post_reactions");
  });
});

describe("Ember notifications", () => {
  beforeEach(() => {
    createNotification.mockReset();
    adminFrom.mockReset();
  });

  it("skips a second insert when the same actor already notified this post", async () => {
    adminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "n1" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const result = await notifyQuadPostEmbered({
      postOwnerUserId: "owner",
      actorUserId: "actor",
      postId: "post-1",
    });

    expect(result).toEqual({ id: "n1" });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("keeps Ember notification copy anonymous and positive", () => {
    expect(EMBER_COPY.notificationTitle).toBe("Your post received an Ember!");
    expect(EMBER_COPY.notificationBody).toBe("Someone appreciated what you shared.");
    expect(EMBER_COPY.notificationBody).not.toMatch(/most|rank|leaderboard|\d+\s+Embers/i);
    const notifications = readFileSync(join(process.cwd(), "lib/server/notifications.ts"), "utf8");
    expect(notifications).toContain('row.type === "quad_post_ember"');
    expect(notifications).toContain("anonymousEmber ? null");
    const center = readFileSync(join(process.cwd(), "components/NotificationsCenter.tsx"), "utf8");
    expect(center).toContain("isEmberNotice");
    expect(center).toContain("!isEmberNotice");
  });

  it("hides private totals from non-authors in the reaction API", () => {
    const reactions = readFileSync(join(process.cwd(), "lib/server/quadReactions.ts"), "utf8");
    expect(reactions).toContain("emberTotalForViewer");
    expect(reactions).toContain("if (viewerId !== authorId) return null");
    expect(reactions).toContain("discloseEmberCounts");
    expect(reactions).toContain("Already awarded — keep the row");
    expect(reactions).toMatch(/if \(existing\?\.id\) \{\s*return;\s*\}/);
    const posts = readFileSync(join(process.cwd(), "lib/server/quadPosts.ts"), "utf8");
    expect(posts).not.toMatch(/^\s*hype_count,?$/m);
    expect(posts).toContain("Feed reads omit hype_count");
  });

  it("creates one in-app Ember notification", async () => {
    adminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    createNotification.mockResolvedValue({ id: "n2" });

    const result = await notifyQuadPostEmbered({
      postOwnerUserId: "owner",
      actorUserId: "actor",
      postId: "post-1",
    });

    expect(result).toEqual({ id: "n2" });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "quad_post_ember",
        body: EMBER_COPY.notificationBody,
        relatedEntityId: "post-1",
        actorId: "actor",
      }),
    );
  });
});
