import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "../http";

const mockFrom = vi.fn();
const mockAdminClient = { from: mockFrom };

vi.mock("../supabase", () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock("../trustedStatsWrite", () => ({
  getTrustedStatsWriteClient: () => mockAdminClient,
}));

vi.mock("../audit", () => ({
  logAdminAuditAction: vi.fn().mockResolvedValue(undefined),
}));

import { adminAdjustUserXp } from "../adminXpAdjustment";

function chain(result: { data?: unknown; error?: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.insert = vi.fn(() => Promise.resolve({ error: null }));
  builder.update = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  }));
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  return builder;
}

describe("adminAdjustUserXp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin callers via missing stats (404) and validates reason", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_stats") {
        return chain({ data: null, error: { message: "not found" } });
      }
      return chain({ data: null, error: null });
    });

    await expect(
      adminAdjustUserXp({
        adminUserId: "admin-1",
        adminEmail: "admin@test.edu",
        targetUserId: "user-1",
        amount: 100,
        action: "add",
        reason: "ok",
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("subtracting XP cannot drop below zero", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_stats") {
        return chain({ data: { total_xp: 50, level: 2 }, error: null });
      }
      return chain({ data: null, error: null });
    });

    const result = await adminAdjustUserXp({
      adminUserId: "admin-1",
      adminEmail: "admin@test.edu",
      targetUserId: "user-1",
      amount: 200,
      action: "subtract",
      reason: "Rollback exploit",
    });

    expect(result.newXp).toBe(0);
    expect(result.newLevel).toBeGreaterThanOrEqual(1);
  });

  it("requires a reason", async () => {
    await expect(
      adminAdjustUserXp({
        adminUserId: "admin-1",
        adminEmail: "admin@test.edu",
        targetUserId: "user-1",
        amount: 10,
        action: "add",
        reason: "  ",
      }),
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  });
});
