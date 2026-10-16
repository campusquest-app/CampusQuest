import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/http";

const adminFrom = vi.fn();
const deleteUser = vi.fn();
const getUserById = vi.fn();
const deleteRelatedUserData = vi.fn();
const collectUserStorageObjects = vi.fn();
const removeUserStorageObjects = vi.fn();
const logAdminAuditAction = vi.fn();
const fetchProfileRole = vi.fn();

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => ({
    from: adminFrom,
    auth: { admin: { deleteUser, getUserById } },
  }),
}));
vi.mock("@/lib/server/adminUserDeletion", () => ({
  deleteRelatedUserData: (...args: unknown[]) => deleteRelatedUserData(...args),
}));
vi.mock("@/lib/server/userStorageCleanup", () => ({
  collectUserStorageObjects: (...args: unknown[]) => collectUserStorageObjects(...args),
  removeUserStorageObjects: (...args: unknown[]) => removeUserStorageObjects(...args),
}));
vi.mock("@/lib/server/audit", () => ({
  logAdminAuditAction: (...args: unknown[]) => logAdminAuditAction(...args),
}));
vi.mock("@/lib/server/permissions", () => ({
  fetchProfileRole: (...args: unknown[]) => fetchProfileRole(...args),
}));

import { deleteOwnAccount } from "@/lib/server/selfAccountDeletion";
import { listContentReportsForModeration, resolveContentReport } from "@/lib/server/contentReports";

function table(result: { data?: unknown; error?: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "order", "limit", "update", "delete", "gte"]) {
    builder[name] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("self-serve account deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserById.mockResolvedValue({ data: { user: { id: "student-1" } }, error: null });
    deleteUser.mockResolvedValue({ error: null });
    deleteRelatedUserData.mockResolvedValue({ "quad_posts.user_id": 2 });
    collectUserStorageObjects.mockResolvedValue([{ bucket: "quad-post-images", path: "student-1/a.jpg" }]);
    removeUserStorageObjects.mockResolvedValue({ removed: 1, failed: 0 });
    adminFrom.mockImplementation(() => table({ data: null, error: null }));
  });

  it("refuses to delete platform admin accounts from the app", async () => {
    fetchProfileRole.mockResolvedValue("admin");
    await expect(deleteOwnAccount({ userId: "admin-1", userEmail: "admin@example.edu" })).rejects.toMatchObject({
      code: "ACCOUNT_DELETE_ADMIN_FORBIDDEN",
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(deleteRelatedUserData).not.toHaveBeenCalled();
  });

  it("collects storage, deletes auth, then removes objects and leftover rows", async () => {
    fetchProfileRole.mockResolvedValue("student");
    const order: string[] = [];
    collectUserStorageObjects.mockImplementation(async () => {
      order.push("collect");
      return [{ bucket: "quad-post-images", path: "student-1/a.jpg" }];
    });
    deleteUser.mockImplementation(async () => {
      order.push("auth");
      return { error: null };
    });
    removeUserStorageObjects.mockImplementation(async () => {
      order.push("storage");
      return { removed: 1, failed: 0 };
    });
    deleteRelatedUserData.mockImplementation(async () => {
      order.push("data");
      return {};
    });
    const result = await deleteOwnAccount({ userId: "student-1", userEmail: "s@uri.edu" });
    expect(result.userId).toBe("student-1");
    expect(order).toEqual(["collect", "auth", "storage", "data"]);
    expect(deleteUser).toHaveBeenCalledWith("student-1");
    expect(adminFrom).toHaveBeenCalledWith("profiles");
    expect(adminFrom).toHaveBeenCalledWith("user_stats");
  });

  it("leaves nothing deleted when the auth delete fails", async () => {
    fetchProfileRole.mockResolvedValue("student");
    deleteUser.mockResolvedValue({ error: { message: "boom" } });
    await expect(deleteOwnAccount({ userId: "student-1", userEmail: "s@uri.edu" })).rejects.toMatchObject({
      code: "ACCOUNT_DELETE_AUTH_FAILED",
    });
    expect(collectUserStorageObjects).toHaveBeenCalledWith(expect.anything(), "student-1");
    expect(deleteUser).toHaveBeenCalled();
    expect(removeUserStorageObjects).not.toHaveBeenCalled();
    expect(deleteRelatedUserData).not.toHaveBeenCalled();
  });

  it("does not resurrect the account when post-auth cleanup fails", async () => {
    fetchProfileRole.mockResolvedValue("student");
    deleteRelatedUserData.mockRejectedValue(new Error("fk"));
    const result = await deleteOwnAccount({ userId: "student-1", userEmail: "s@uri.edu" });
    expect(result.userId).toBe("student-1");
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it("is only reachable through an authenticated, confirmed DELETE route", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/me/account/route.ts"), "utf8");
    expect(route).toContain("requireAuthUser(request)");
    expect(route).toContain("deleteOwnAccountSchema");
    expect(route).toContain("export async function DELETE");
    expect(route).not.toMatch(/export async function (GET|POST)/);
  });
});

describe("content report moderation queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAdminAuditAction.mockResolvedValue(undefined);
  });

  it("lists reports with reporter, reported user and comment context", async () => {
    adminFrom.mockImplementation((name: string) => {
      if (name === "content_reports") {
        return table({
          data: [
            {
              id: "r1",
              reporter_id: "u1",
              target_type: "comment",
              target_id: "c1",
              reported_user_id: "u2",
              reason: "harassment",
              details: null,
              status: "open",
              moderator_note: null,
              reviewed_by: null,
              reviewed_at: null,
              created_at: "2026-10-01T00:00:00.000Z",
            },
          ],
          error: null,
        });
      }
      if (name === "profiles") {
        return table({
          data: [
            { id: "u1", username: "reporter", display_name: "Reporter" },
            { id: "u2", username: "target", display_name: "Target" },
          ],
          error: null,
        });
      }
      if (name === "quad_post_comments") {
        return table({ data: [{ id: "c1", body: "mean comment", user_id: "u2", post_id: "p1" }], error: null });
      }
      throw new Error(`unexpected table ${name}`);
    });
    const reports = await listContentReportsForModeration(50);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      id: "r1",
      targetType: "comment",
      reporter: { username: "reporter" },
      reportedUser: { username: "target" },
      comment: { body: "mean comment" },
    });
  });

  it("resolves a report and writes an audit entry", async () => {
    adminFrom.mockImplementation(() =>
      table({
        data: { id: "r1", status: "resolved", target_type: "user", target_id: "u2", reported_user_id: "u2" },
        error: null,
      }),
    );
    const result = await resolveContentReport({
      reportId: "r1",
      status: "resolved",
      moderatorNote: "Warned user",
      reviewerUserId: "admin-1",
      reviewerEmail: "admin@campusquestapp.com",
    });
    expect(result.status).toBe("resolved");
    expect(logAdminAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "report_resolved", adminUserId: "admin-1", targetUserId: "u2" }),
    );
  });

  it("surfaces update failures", async () => {
    adminFrom.mockImplementation(() => table({ data: null, error: { message: "nope" } }));
    await expect(resolveContentReport({ reportId: "r1", status: "dismissed" })).rejects.toBeInstanceOf(ApiError);
  });

  it("is mounted behind the admin guard and in the admin moderation UI", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/internal/admin/moderation/content/reports/route.ts"),
      "utf8",
    );
    expect(route).toContain("requireAdminUser(request)");
    const section = fs.readFileSync(path.join(process.cwd(), "components/admin/AdminModerationSection.tsx"), "utf8");
    expect(section).toContain("<ContentReportsModerationCard />");
  });
});
