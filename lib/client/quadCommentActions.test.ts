import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldNote } from "@/lib/types";

vi.mock("@/lib/client/quadCommentsClient", () => ({
  createQuadPostComment: vi.fn(),
}));

vi.mock("@/lib/client/apiSession", () => ({
  getAccessToken: vi.fn(() => "token"),
}));

import { createQuadPostComment } from "@/lib/client/quadCommentsClient";
import { submitQuadComment } from "@/lib/client/quadCommentActions";
import {
  getCommentsByNoteId,
  getDisplayCommentCount,
  mergeRemoteQuadPostsForMutations,
  setCommentsForNote,
  setRemoteQuadPostsCache,
} from "@/lib/feedStore";

const POST_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const post: FieldNote = {
  id: POST_ID,
  authorId: "author-1",
  authorName: "Author",
  authorUsername: "author",
  authorAvatar: "🎓",
  body: "Post body",
  ramMarks: [],
  nodCount: 0,
  vouchCount: 0,
  nodByUserIds: new Set(),
  vouchByUserIds: new Set(),
  hypeCount: 0,
  verifyCount: 0,
  assistCount: 0,
  hypeByUserIds: new Set(),
  verifyByUserIds: new Set(),
  assistByUserIds: new Set(),
  createdAt: Date.now(),
  isPersisted: true,
  commentCount: 1,
};

describe("submitQuadComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRemoteQuadPostsCache([post]);
    setCommentsForNote(POST_ID, []);
  });

  it("replaces optimistic comment with saved comment and bumps count", async () => {
    vi.mocked(createQuadPostComment).mockResolvedValue({
      id: "comment-1",
      noteId: POST_ID,
      authorId: "user-1",
      authorName: "Sam",
      authorUsername: "sam",
      authorAvatar: "🎓",
      body: "Nice post",
      createdAt: Date.now(),
    });

    const onOptimistic = vi.fn();
    const result = await submitQuadComment({
      noteId: POST_ID,
      author: {
        authorId: "user-1",
        authorName: "Sam",
        authorUsername: "sam",
        authorAvatar: "🎓",
        body: "Nice post",
      },
      onOptimistic,
    });

    expect(result).toEqual({ ok: true });
    expect(getCommentsByNoteId(POST_ID)).toHaveLength(1);
    expect(getCommentsByNoteId(POST_ID)[0]?.id).toBe("comment-1");
    expect(getDisplayCommentCount(POST_ID, post)).toBe(1);
    expect(onOptimistic).toHaveBeenCalled();
  });

  it("removes optimistic comment and returns error message when save fails", async () => {
    vi.mocked(createQuadPostComment).mockRejectedValue(new Error("NETWORK_ERROR: offline"));

    const onOptimistic = vi.fn();
    const result = await submitQuadComment({
      noteId: POST_ID,
      author: {
        authorId: "user-1",
        authorName: "Sam",
        authorUsername: "sam",
        authorAvatar: "🎓",
        body: "Nice post",
      },
      onOptimistic,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("connect");
    }
    expect(getCommentsByNoteId(POST_ID)).toHaveLength(0);
  });
});

describe("getDisplayCommentCount", () => {
  it("uses the higher of loaded comments and server count", () => {
    mergeRemoteQuadPostsForMutations([{ ...post, commentCount: 3 }]);
    expect(getDisplayCommentCount(POST_ID, post)).toBe(3);
  });
});
