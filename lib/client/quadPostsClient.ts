"use client";

import {
  isPersistedQuadPostId,
  quadPostRowToFieldNote,
  type QuadPostApiRow,
  type QuadReactionType,
} from "@/lib/quadFieldNote";
import type { FieldNote } from "@/lib/types";
import {
  ApiRequestError,
  fetchAuthed,
  postAuthed,
  patchAuthed,
  deleteAuthed,
} from "@/lib/client/dashboardApi";
import { isQuadPostProofDataUrl, uploadQuadPostProofDataUrl } from "@/lib/client/quadPostImageUpload";

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

export type RealmMomentCreatedMeta = {
  id: string;
  locationId: string;
  locationName: string;
  expiresAt: string;
};

export type CreateQuadPostResult = {
  note: FieldNote;
  realmMoment: RealmMomentCreatedMeta | null;
};

export async function fetchQuadHomePosts(viewerId: string, limit = 80): Promise<FieldNote[]> {
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/quad/posts?feed=public&limit=${limit}`);
  return data.posts.map((row) => quadPostRowToFieldNote(row, viewerId));
}

export async function fetchQuadFriendsPosts(viewerId: string, limit = 80): Promise<FieldNote[]> {
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/quad/posts?feed=friends&limit=${limit}`);
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
): Promise<CreateQuadPostResult> {
  let proofUrl = payload.proofUrl?.trim();
  if (proofUrl && isQuadPostProofDataUrl(proofUrl)) {
    proofUrl = await uploadQuadPostProofDataUrl(proofUrl);
  }

  const body = {
    ...payload,
    proofUrl: proofUrl && proofUrl.length > 0 ? proofUrl : undefined,
  } as Record<string, unknown>;

  let data: { post: QuadPostApiRow; realmMoment: RealmMomentCreatedMeta | null };
  try {
    data = await postAuthed<
      { post: QuadPostApiRow; realmMoment: RealmMomentCreatedMeta | null },
      Record<string, unknown>
    >("/api/quad/posts", body);
  } catch (error) {
    console.error("[cq][quad-post] API create failed", {
      message: error instanceof Error ? error.message : String(error),
      code: error instanceof ApiRequestError ? error.code : undefined,
      status: error instanceof ApiRequestError ? error.status : undefined,
      details: error instanceof ApiRequestError ? error.details : undefined,
    });
    throw error;
  }
  const note = quadPostRowToFieldNote(data.post, viewerId);
  return { note, realmMoment: data.realmMoment ?? null };
}

export type UpdateQuadPostPayload = {
  body?: string;
  visibility?: "public" | "friends";
  locationId?: string | null;
  locationName?: string | null;
};

export async function updateQuadPostRequest(
  postId: string,
  payload: UpdateQuadPostPayload,
  viewerId?: string,
): Promise<FieldNote> {
  if (!isPersistedQuadPostId(postId)) {
    throw new Error("Cannot update demo posts.");
  }
  const data = await patchAuthed<{ post: QuadPostApiRow }, UpdateQuadPostPayload>(
    `/api/quad/posts/${postId}`,
    payload,
  );
  return quadPostRowToFieldNote(data.post, viewerId);
}

export async function deleteQuadPostRequest(postId: string): Promise<void> {
  if (!isPersistedQuadPostId(postId)) {
    throw new Error("Cannot delete demo posts.");
  }
  await deleteAuthed<{ deleted: true; postId: string }>(`/api/quad/posts/${postId}`);
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
