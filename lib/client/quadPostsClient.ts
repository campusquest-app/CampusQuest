"use client";

import {
  isPersistedQuadPostId,
  quadPostRowToFieldNote,
  type QuadPostApiRow,
  type QuadReactionType,
} from "@/lib/quadFieldNote";
import type { FieldNote } from "@/lib/types";
import { fetchAuthed, postAuthed, deleteAuthed } from "@/lib/client/dashboardApi";

export type QuadPostLikeResult = {
  postId: string;
  likeCount: number;
  currentUserHasLiked: boolean;
};

export type QuadReactionToggleResult = QuadPostLikeResult & {
  reactionType: QuadReactionType;
  active: boolean;
  sparkCount: number;
  currentUserHasSparked: boolean;
};

export async function fetchQuadHomePosts(viewerId: string, limit = 80): Promise<FieldNote[]> {
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/quad/posts?limit=${limit}`);
  return data.posts.map((row) => quadPostRowToFieldNote(row, viewerId));
}

export async function fetchQuadPostsByAuthor(
  viewerId: string,
  authorId: string,
  limit = 40,
): Promise<FieldNote[]> {
  const qs = new URLSearchParams({ authorId, limit: String(limit) });
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/quad/posts?${qs.toString()}`);
  return data.posts.map((row) => quadPostRowToFieldNote(row, viewerId));
}

export async function fetchMyQuadPosts(viewerId: string, limit = 40): Promise<FieldNote[]> {
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/me/quad/posts?limit=${limit}`);
  return data.posts.map((row) => quadPostRowToFieldNote(row, viewerId));
}

export async function createQuadPostRequest(
  payload: {
    body: string;
    proofUrl?: string;
    visibility?: "public" | "friends";
    ramMarks?: { id?: string; tag: string }[];
    relatedActivityId?: string | null;
    relatedQuestSlug?: string | null;
    authorStreakDays?: number;
    locationId?: string;
    locationName?: string;
  },
  viewerId?: string,
): Promise<FieldNote> {
  const body = payload as Record<string, unknown>;
  const data = await postAuthed<{ post: QuadPostApiRow }, Record<string, unknown>>("/api/quad/posts", body);
  const note = quadPostRowToFieldNote(data.post, viewerId);
  if (payload.locationId && payload.locationName) {
    note.locationId = payload.locationId;
    note.locationName = payload.locationName;
  }
  return note;
}

export async function likeQuadPost(postId: string): Promise<QuadPostLikeResult> {
  if (!isPersistedQuadPostId(postId)) {
    throw new Error("Cannot persist reactions on demo posts.");
  }
  const data = await postAuthed<{ like: QuadPostLikeResult }, Record<string, unknown>>(
    `/api/quad/posts/${postId}/likes`,
    {},
  );
  return data.like;
}

export async function unlikeQuadPost(postId: string): Promise<QuadPostLikeResult> {
  if (!isPersistedQuadPostId(postId)) {
    throw new Error("Cannot persist reactions on demo posts.");
  }
  const data = await deleteAuthed<{ like: QuadPostLikeResult }>(`/api/quad/posts/${postId}/likes`);
  return data.like;
}

export async function toggleQuadPostReaction(
  postId: string,
  reactionType: QuadReactionType,
): Promise<QuadReactionToggleResult> {
  if (!isPersistedQuadPostId(postId)) {
    throw new Error("Cannot persist reactions on demo posts.");
  }
  const data = await postAuthed<{ reaction: QuadReactionToggleResult }, { reactionType: QuadReactionType }>(
    `/api/quad/posts/${postId}/reactions`,
    { reactionType },
  );
  return data.reaction;
}
