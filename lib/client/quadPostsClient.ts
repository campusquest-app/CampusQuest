"use client";

import {
  isPersistedQuadPostId,
  quadPostRowToFieldNote,
  type QuadPostApiRow,
  type QuadReactionType,
} from "@/lib/quadFieldNote";
import type { FieldNote } from "@/lib/types";
import type { QuadPostXpReward } from "@/lib/quadPostXp";
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
  xpReward: QuadPostXpReward;
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

export async function fetchTaggedPosts(
  entityType: "user" | "organization" | "event" | "external_event",
  entityId: string,
  viewerId: string,
  limit = 30,
): Promise<FieldNote[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(
    `/api/quad/tagged/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}?${qs.toString()}`,
  );
  return data.posts.map((row) => quadPostRowToFieldNote(row, viewerId));
}

export async function fetchQuadPostById(postId: string, viewerId?: string): Promise<FieldNote | null> {
  if (!isPersistedQuadPostId(postId)) return null;
  const qs = new URLSearchParams({ postId, limit: "1" });
  const data = await fetchAuthed<{ posts: QuadPostApiRow[] }>(`/api/quad/posts?${qs.toString()}`);
  const row = data.posts[0];
  if (!row) return null;
  return quadPostRowToFieldNote(row, viewerId);
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
    tags?: {
      entityType: "user" | "organization" | "event" | "external_event";
      entityId: string;
      displayLabel?: string;
      subtitle?: string | null;
      mentionSlug?: string | null;
    }[];
    photoTags?: {
      entityType: "user" | "organization" | "event" | "external_event";
      entityId: string;
      mediaKey?: string;
      positionX: number;
      positionY: number;
      displayLabel?: string;
    }[];
    mentions?: {
      entityType: "user" | "organization" | "event" | "external_event";
      entityId: string;
      displayText: string;
      startIndex: number;
      endIndex: number;
    }[];
    mediaType?: "none" | "image" | "video";
    mediaId?: string;
    mediaItems?: { mediaId: string; sortOrder: number }[];
    coverMediaId?: string;
    publishIdempotencyKey?: string;
    posterUrl?: string;
    mediaDurationSeconds?: number;
    mediaHasAudio?: boolean;
    mediaWidth?: number;
    mediaHeight?: number;
    mediaMimeType?: string;
    mediaFileSizeBytes?: number;
  },
  viewerId?: string,
): Promise<CreateQuadPostResult> {
  let proofUrl = payload.proofUrl?.trim();
  if (payload.mediaType !== "video" && proofUrl && isQuadPostProofDataUrl(proofUrl)) {
    proofUrl = await uploadQuadPostProofDataUrl(proofUrl);
  }

  const body = {
    ...payload,
    proofUrl: proofUrl && proofUrl.length > 0 ? proofUrl : undefined,
  } as Record<string, unknown>;

  let data: { post: QuadPostApiRow; realmMoment: RealmMomentCreatedMeta | null; xpReward?: QuadPostXpReward };
  try {
    data = await postAuthed<
      { post: QuadPostApiRow; realmMoment: RealmMomentCreatedMeta | null; xpReward?: QuadPostXpReward },
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
  return {
    note,
    realmMoment: data.realmMoment ?? null,
    xpReward: data.xpReward ?? { awarded: false, xpAmount: 0 },
  };
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
