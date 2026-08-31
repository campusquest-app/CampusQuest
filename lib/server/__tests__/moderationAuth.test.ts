import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const listUsers = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById,
        listUsers,
      },
    },
    from: fromMock,
  }),
}));

vi.mock("@/lib/server/authBootstrap", () => ({
  findAuthUserIdByEmail: vi.fn(async (email: string) => {
    if (email === "role-admin@uri.edu") return "role-admin-id";
    if (email === "student@uri.edu") return "student-id";
    return null;
  }),
}));

vi.mock("@/lib/server/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/permissions")>();
  return {
    ...actual,
    fetchProfileRole: vi.fn(async (_client: unknown, userId: string) => {
      if (userId === "role-admin-id") return "admin";
      return "student";
    }),
  };
});

describe("assertPlatformModerationAdminEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.MESSAGE_MODERATION_API_KEY = "test-mod-key";
    process.env.MODERATION_ADMIN_EMAILS = "listed-admin@campusquestapp.com";
    getUserById.mockReset();
    listUsers.mockReset();
    fromMock.mockReset();
  });

  function request(email: string, key = "test-mod-key") {
    return new Request("http://localhost/api/moderation/quad/reports", {
      headers: {
        "x-message-moderation-key": key,
        "x-admin-email": email,
      },
    });
  }

  it("allows env-listed moderation admins", async () => {
    const { assertPlatformModerationAdminEmail } = await import("@/lib/server/moderationAuth");
    await expect(
      assertPlatformModerationAdminEmail(request("listed-admin@campusquestapp.com")),
    ).resolves.toBe("listed-admin@campusquestapp.com");
  });

  it("allows platform admin email fallbacks", async () => {
    const { assertPlatformModerationAdminEmail } = await import("@/lib/server/moderationAuth");
    await expect(
      assertPlatformModerationAdminEmail(request("nicklockhart22@uri.edu")),
    ).resolves.toBe("nicklockhart22@uri.edu");
  });

  it("allows role-based platform admins", async () => {
    getUserById.mockResolvedValue({
      data: {
        user: {
          id: "role-admin-id",
          email: "role-admin@uri.edu",
          email_confirmed_at: "2026-01-01T00:00:00Z",
        },
      },
      error: null,
    });
    const { assertPlatformModerationAdminEmail } = await import("@/lib/server/moderationAuth");
    await expect(assertPlatformModerationAdminEmail(request("role-admin@uri.edu"))).resolves.toBe(
      "role-admin@uri.edu",
    );
  });

  it("rejects normal students with 403", async () => {
    getUserById.mockResolvedValue({
      data: {
        user: {
          id: "student-id",
          email: "student@uri.edu",
          email_confirmed_at: "2026-01-01T00:00:00Z",
        },
      },
      error: null,
    });
    const { assertPlatformModerationAdminEmail } = await import("@/lib/server/moderationAuth");
    await expect(assertPlatformModerationAdminEmail(request("student@uri.edu"))).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("rejects wrong moderation API key", async () => {
    const { assertPlatformModerationAdminEmail } = await import("@/lib/server/moderationAuth");
    await expect(
      assertPlatformModerationAdminEmail(request("listed-admin@campusquestapp.com", "wrong")),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("rejects missing admin email header", async () => {
    const { assertPlatformModerationAdminEmail } = await import("@/lib/server/moderationAuth");
    const req = new Request("http://localhost/api/moderation/quad/reports", {
      headers: { "x-message-moderation-key": "test-mod-key" },
    });
    await expect(assertPlatformModerationAdminEmail(req)).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });
});
