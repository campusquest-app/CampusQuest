import { describe, expect, it, vi, beforeEach } from "vitest";
import { QUAD_POST_XP_AMOUNT, QUAD_POST_XP_DAILY_CAP } from "@/lib/quadPostXp";

const mockAdmin = {
  from: vi.fn(),
};

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => mockAdmin,
}));

const addXpInternal = vi.fn().mockResolvedValue({ xpLog: { id: "log-1" } });
vi.mock("@/lib/server/services", () => ({
  addXpInternal: (...args: unknown[]) => addXpInternal(...args),
}));

vi.mock("@/lib/server/quadPosts", () => ({
  logQuadPostError: vi.fn(),
}));

import { countQuadPostXpGrantsToday, maybeAwardQuadPostCreationXp } from "@/lib/server/quadPostXp";

type GrantTableMock = {
  existingPostId?: string | null;
  grantsToday?: number;
  insertError?: { code?: string; message?: string } | null;
  lookupError?: { code?: string; message?: string } | null;
};

function mockGrantTable(config: GrantTableMock) {
  return {
    select: vi.fn().mockImplementation((_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) {
        return {
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              count: config.grantsToday ?? 0,
              error: null,
            }),
          }),
        };
      }
      return {
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: config.existingPostId ? { post_id: config.existingPostId } : null,
            error: config.lookupError ?? null,
          }),
        }),
      };
    }),
    insert: vi.fn().mockResolvedValue({ error: config.insertError ?? null }),
  };
}

describe("maybeAwardQuadPostCreationXp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("awards XP once per post", async () => {
    mockAdmin.from.mockReturnValue(
      mockGrantTable({ grantsToday: 0, existingPostId: null }),
    );

    const result = await maybeAwardQuadPostCreationXp({ userId: "user-1", postId: "post-1" });
    expect(result).toEqual({ awarded: true, xpAmount: QUAD_POST_XP_AMOUNT });
    expect(addXpInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        amount: QUAD_POST_XP_AMOUNT,
        sourceType: "quad_post",
        sourceId: "post-1",
        note: "Quad post published",
      }),
    );
  });

  it("skips when daily cap is reached", async () => {
    mockAdmin.from.mockReturnValue(
      mockGrantTable({ grantsToday: QUAD_POST_XP_DAILY_CAP, existingPostId: null }),
    );

    const result = await maybeAwardQuadPostCreationXp({ userId: "user-1", postId: "post-2" });
    expect(result).toEqual({ awarded: false, xpAmount: 0, dailyCapReached: true });
    expect(addXpInternal).not.toHaveBeenCalled();
  });

  it("does not award duplicate XP for the same post", async () => {
    mockAdmin.from.mockReturnValue(
      mockGrantTable({ grantsToday: 0, existingPostId: "post-3" }),
    );

    const result = await maybeAwardQuadPostCreationXp({ userId: "user-1", postId: "post-3" });
    expect(result).toEqual({ awarded: false, xpAmount: 0 });
    expect(addXpInternal).not.toHaveBeenCalled();
  });

  it("does not throw when lookup fails", async () => {
    mockAdmin.from.mockReturnValue(
      mockGrantTable({ lookupError: { message: "db down" } }),
    );

    const result = await maybeAwardQuadPostCreationXp({ userId: "user-1", postId: "post-4" });
    expect(result).toEqual({ awarded: false, xpAmount: 0 });
  });
});

describe("countQuadPostXpGrantsToday", () => {
  it("returns zero when table is missing", async () => {
    mockAdmin.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          gte: vi.fn().mockResolvedValue({ count: null, error: { code: "42P01", message: "missing" } }),
        }),
      }),
    });
    await expect(countQuadPostXpGrantsToday(mockAdmin as never, "user-1")).resolves.toBe(0);
  });
});
