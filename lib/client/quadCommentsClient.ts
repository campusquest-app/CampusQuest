"use client";

import { flattenQuadCommentTree } from "@/lib/quadCommentsTree";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import type { QuadComment } from "@/lib/types";
import { deleteAuthed, fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export type QuadPostCommentApiRow = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  parentCommentId?: string | null;
  likeCount?: number;
  viewerHasLiked?: boolean;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  replies?: QuadPostCommentApiRow[];
};

export function apiCommentToQuadComment(row: QuadPostCommentApiRow): QuadComment {
  return {
    id: row.id,
    noteId: row.postId,
    authorId: row.author.id,
    authorName: (row.author.displayName ?? "Student").trim() || "Student",
    authorUsername: (row.author.username ?? "student").trim().toLowerCase().replace(/\s+/g, "_") || "student",
    authorAvatar: row.author.avatarUrl?.trim() || "🎓",
    body: row.body,
    createdAt: Date.parse(row.createdAt),
    parentCommentId: row.parentCommentId ?? null,
    likeCount: Math.max(0, row.likeCount ?? 0),
    viewerHasLiked: row.viewerHasLiked ?? false,
  };
}

export async function fetchQuadPostComments(postId: string, limit = 100): Promise<QuadComment[]> {
  if (!isPersistedQuadPostId(postId)) return [];
  const data = await fetchAuthed<{ comments: QuadPostCommentApiRow[] }>(
    `/api/quad/posts/${postId}/comments?limit=${limit}`,
  );
  const flat = flattenQuadCommentTree(data.comments ?? []);
  return flat.map(apiCommentToQuadComment);
}

export async function createQuadPostComment(
  postId: string,
  body: string,
  parentCommentId?: string | null,
): Promise<QuadComment> {
  if (!isPersistedQuadPostId(postId)) {
    throw new Error("Cannot persist comments on demo posts.");
  }
  const data = await postAuthed<
    { comment: QuadPostCommentApiRow },
    { body: string; parentCommentId?: string | null }
  >(`/api/quad/posts/${postId}/comments`, {
    body: body.trim(),
    ...(parentCommentId ? { parentCommentId } : {}),
  });
  return apiCommentToQuadComment(data.comment);
}

export async function likeQuadComment(commentId: string): Promise<{ likeCount: number; viewerHasLiked: boolean }> {
  const data = await postAuthed<
    { like: { commentId: string; likeCount: number; viewerHasLiked: boolean } },
    Record<string, never>
  >(`/api/quad/comments/${commentId}/likes`, {});
  return { likeCount: data.like.likeCount, viewerHasLiked: data.like.viewerHasLiked };
}

export async function unlikeQuadComment(commentId: string): Promise<{ likeCount: number; viewerHasLiked: boolean }> {
  const data = await deleteAuthed<{ like: { commentId: string; likeCount: number; viewerHasLiked: boolean } }>(
    `/api/quad/comments/${commentId}/likes`,
  );
  return { likeCount: data.like.likeCount, viewerHasLiked: data.like.viewerHasLiked };
}
