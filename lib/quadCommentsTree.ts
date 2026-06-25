import type { QuadComment } from "@/lib/types";

export type QuadCommentNode = QuadComment & { replies: QuadCommentNode[] };

/** Build a threaded tree from a flat comment list (one level or deeper). */
export function nestQuadComments(comments: QuadComment[]): QuadCommentNode[] {
  const sorted = [...comments].sort((a, b) => a.createdAt - b.createdAt);
  const nodes = new Map<string, QuadCommentNode>(
    sorted.map((comment) => [comment.id, { ...comment, replies: [] }]),
  );
  const roots: QuadCommentNode[] = [];

  for (const comment of sorted) {
    const node = nodes.get(comment.id);
    if (!node) continue;
    const parentId = comment.parentCommentId?.trim();
    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Flatten a nested API comment tree into a single list for the feed store. */
export function flattenQuadCommentTree<T extends { replies?: T[] }>(comments: T[]): T[] {
  const out: T[] = [];
  function walk(nodes: T[]) {
    for (const node of nodes) {
      const { replies, ...rest } = node as T & { replies?: T[] };
      out.push(rest as T);
      if (replies?.length) walk(replies);
    }
  }
  walk(comments);
  return out;
}
