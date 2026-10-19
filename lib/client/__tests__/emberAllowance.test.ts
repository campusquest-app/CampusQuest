import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMBER_COPY, EMBER_ERROR_CODES } from "@/lib/embers";
import {
  applyOptimisticEmberGive,
  emberActionLabel,
  getEmberAllowance,
  hasSeenEmberExplainer,
  markEmberExplainerSeen,
  remainingEmbersCopy,
  setEmberAllowance,
  snapshotEmberAllowance,
} from "@/lib/client/emberAllowance";
import { ApiRequestError } from "@/lib/client/dashboardApi";

const { restoreReactionStateToAllCopies, snapshot } = vi.hoisted(() => ({
  restoreReactionStateToAllCopies: vi.fn(),
  snapshot: { sparked: false },
}));

vi.mock("@/lib/client/apiSession", () => ({
  getAccessToken: () => "token",
}));

vi.mock("@/lib/quadFieldNote", () => ({
  isPersistedQuadPostId: () => true,
}));

vi.mock("@/lib/feedStore", () => ({
  getNoteForReaction: () => ({ id: "note-1" }),
  snapshotReactionStateForNote: () => ({
    nodCount: 0,
    hypeCount: 4,
    liked: false,
    sparked: snapshot.sparked,
    likedByPreview: [],
  }),
  optimisticToggleSparkOnAllCopies: vi.fn(),
  applyServerReactionStateToAllCopies: vi.fn(),
  restoreReactionStateToAllCopies,
}));

const toggleQuadPostReaction = vi.fn();
vi.mock("@/lib/client/quadPostsClient", () => ({
  likeQuadPost: vi.fn(),
  unlikeQuadPost: vi.fn(),
  toggleQuadPostReaction: (...args: unknown[]) => toggleQuadPostReaction(...args),
}));

import { toggleQuadSpark } from "@/lib/client/quadReactionActions";
import { subscribeEmberCast } from "@/lib/client/emberCastEvents";

const memoryStorage = new Map<string, string>();

describe("Ember allowance store and first-use", () => {
  beforeEach(() => {
    memoryStorage.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => memoryStorage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memoryStorage.set(key, value);
        },
        clear: () => memoryStorage.clear(),
      },
    });
    setEmberAllowance({
      used: 1,
      remaining: 2,
      limit: 3,
      resetsAt: "2026-07-10T04:00:00.000Z",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("optimistically decrements remaining and can restore the snapshot", () => {
    const snap = snapshotEmberAllowance();
    applyOptimisticEmberGive();
    expect(getEmberAllowance()?.used).toBe(2);
    expect(getEmberAllowance()?.remaining).toBe(1);
    setEmberAllowance(snap);
    expect(getEmberAllowance()).toEqual(snap);
  });

  it("remembers the first-use explainer after acknowledgment", () => {
    expect(hasSeenEmberExplainer()).toBe(false);
    markEmberExplainerSeen();
    expect(hasSeenEmberExplainer()).toBe(true);
  });

  it("announces give/remove state for screen readers", () => {
    expect(emberActionLabel({ active: false, count: 4, remaining: 2, isOwnPost: false })).toBe(
      "Give Ember. 2 of 3 Embers left today",
    );
    expect(emberActionLabel({ active: false, count: 4, remaining: 2, isOwnPost: false })).not.toContain("4");
    expect(emberActionLabel({ active: true, count: 5, remaining: 1, isOwnPost: false })).toBe("Ember given");
    expect(emberActionLabel({ active: false, count: 3, remaining: null, isOwnPost: false, unlimited: true })).toBe(
      "Give Ember",
    );
    expect(emberActionLabel({ active: false, count: 0, remaining: 0, isOwnPost: true })).toBe(
      EMBER_COPY.ownPost,
    );
    expect(remainingEmbersCopy(2)).toBe("2 of 3 Embers left today");
  });
});

describe("optimistic Ember rollback", () => {
  beforeEach(() => {
    restoreReactionStateToAllCopies.mockClear();
    toggleQuadPostReaction.mockReset();
    setEmberAllowance({
      used: 1,
      remaining: 2,
      limit: 3,
      resetsAt: "2026-07-10T04:00:00.000Z",
    });
  });

  it("rolls back the post and allowance when the server rejects the Ember", async () => {
    toggleQuadPostReaction.mockRejectedValue(
      new ApiRequestError(EMBER_COPY.exhausted, 409, EMBER_ERROR_CODES.dailyLimit),
    );

    const result = await toggleQuadSpark({
      noteId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      onOptimistic: () => undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(EMBER_COPY.exhausted);
      expect(result.code).toBe(EMBER_ERROR_CODES.dailyLimit);
    }
    expect(restoreReactionStateToAllCopies).toHaveBeenCalled();
    expect(getEmberAllowance()?.used).toBe(1);
    expect(getEmberAllowance()?.remaining).toBe(2);
  });

  it("does not publish the consumption animation when the request fails", async () => {
    const casts: Array<{ noteId: string; remainingAfter: number }> = [];
    const stop = subscribeEmberCast((event) => casts.push(event));
    toggleQuadPostReaction.mockRejectedValue(
      new ApiRequestError(EMBER_COPY.saveFailed, 400, "QUAD_REACTION_INSERT_FAILED"),
    );
    await toggleQuadSpark({
      noteId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      onOptimistic: () => undefined,
    });
    expect(casts).toEqual([]);
    stop();
  });

  it("publishes a dynamic cast after a successful give, but not after a remove", async () => {
    const casts: Array<{ noteId: string; remainingAfter: number }> = [];
    const stop = subscribeEmberCast((event) => casts.push(event));
    toggleQuadPostReaction.mockResolvedValue({
      active: true,
      emberAllowance: { used: 1, remaining: 2, limit: 3, resetsAt: "2026-07-10T04:00:00.000Z" },
    });
    snapshot.sparked = false;
    const given = await toggleQuadSpark({
      noteId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      onOptimistic: () => undefined,
    });
    expect(given).toMatchObject({ ok: true, given: true });
    expect(casts).toEqual([
      { noteId: "11111111-1111-4111-8111-111111111111", remainingAfter: 2 },
    ]);

    casts.length = 0;
    snapshot.sparked = true;
    toggleQuadPostReaction.mockResolvedValue({
      active: false,
      emberAllowance: { used: 0, remaining: 3, limit: 3, resetsAt: "2026-07-10T04:00:00.000Z" },
    });
    const removed = await toggleQuadSpark({
      noteId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      onOptimistic: () => undefined,
    });
    expect(removed).toMatchObject({ ok: true, given: false });
    expect(casts).toEqual([]);
    snapshot.sparked = false;
    stop();
  });

  it("does not decrement an unlimited allowance or show a balance in the admin cast", async () => {
    setEmberAllowance({
      used: 0,
      remaining: 3,
      limit: 3,
      resetsAt: "2026-07-10T04:00:00.000Z",
      unlimited: true,
    });
    const casts: Array<{ unlimited?: boolean; remainingAfter: number }> = [];
    const stop = subscribeEmberCast((event) => casts.push(event));
    toggleQuadPostReaction.mockResolvedValue({
      active: true,
      sparkCount: null,
      emberAllowance: {
        used: 0,
        remaining: 3,
        limit: 3,
        resetsAt: "2026-07-10T04:00:00.000Z",
        unlimited: true,
      },
    });
    snapshot.sparked = false;
    await toggleQuadSpark({
      noteId: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      onOptimistic: () => undefined,
    });
    expect(getEmberAllowance()?.unlimited).toBe(true);
    expect(getEmberAllowance()?.remaining).toBe(3);
    expect(casts).toEqual([
      { noteId: "11111111-1111-4111-8111-111111111111", remainingAfter: 0, unlimited: true },
    ]);
    stop();
  });
});
