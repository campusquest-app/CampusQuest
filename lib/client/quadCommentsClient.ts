"use client";

import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import type { QuadComment } from "@/lib/types";
import { fetchAuthed, postAuthed } from "@/lib/client/dashboardApi";

export type QuadPostCommentApiRow = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
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
  };
}

export async function fetchQuadPostComments(postId: string, limit = 100): Promise<QuadComment[]> {
  if (!isPersistedQuadPostId(postId)) return [];
  const data = await fetchAuthed<{ comments: QuadPostCommentApiRow[] }>(
    `/api/quad/posts/${postId}/comments?limit=${limit}`,
  );
  return (data.comments ?? []).map(apiCommentToQuadComment);
}

export async function createQuadPostComment(postId: string, body: string): Promise<QuadComment> {
  if (!isPersistedQuadPostId(postId)) {
    throw new Error("Cannot persist comments on demo posts.");
  }
  const data = await postAuthed<{ comment: QuadPostCommentApiRow }, { body: string }>(
    `/api/quad/posts/${postId}/comments`,
    { body: body.trim() },
  );
  return apiCommentToQuadComment(data.comment);
}
