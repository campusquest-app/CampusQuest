import { describe, expect, it } from "vitest";
import { flattenQuadCommentTree, nestQuadComments } from "@/lib/quadCommentsTree";
import type { QuadComment } from "@/lib/types";

function comment(id: string, parentCommentId: string | null, createdAt: number): QuadComment {
  return {
    id,
    noteId: "post-1",
    authorId: "user-1",
    authorName: "Sam",
    authorUsername: "sam",
    authorAvatar: "🎓",
    body: `Comment ${id}`,
    createdAt,
    parentCommentId,
    likeCount: 0,
    viewerHasLiked: false,
  };
}

describe("quadCommentsTree", () => {
  it("nests replies under parent comments", () => {
    const flat = [
      comment("c1", null, 1),
      comment("c2", "c1", 2),
      comment("c3", null, 3),
    ];
    const tree = nestQuadComments(flat);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.id).toBe("c1");
    expect(tree[0]?.replies).toHaveLength(1);
    expect(tree[0]?.replies[0]?.id).toBe("c2");
  });

  it("flattens nested API comments", () => {
    const nested = [
      {
        id: "c1",
        replies: [{ id: "c2", replies: [] }],
      },
    ];
    expect(flattenQuadCommentTree(nested)).toEqual([{ id: "c1" }, { id: "c2" }]);
  });
});
