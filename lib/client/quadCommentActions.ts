"use client";

import {
  addCommentWithId,
  bumpCommentCountForNote,
  getCommentById,
  getNoteForReaction,
  patchCommentLike,
  removeCommentById,
  replaceComment,
  type AddCommentParams,
} from "@/lib/feedStore";
import { createQuadPostComment, likeQuadComment, unlikeQuadComment } from "@/lib/client/quadCommentsClient";
import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, CQ_MISSING_SESSION_CODE } from "@/lib/client/dashboardApi";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";

export type QuadCommentActionResult =
  | { ok: true }
  | { ok: false; message: string; requiresSignIn?: boolean; demoPost?: boolean };

function mapCommentError(error: unknown): QuadCommentActionResult {
  if (error instanceof ApiRequestError) {
    if (error.code === CQ_MISSING_SESSION_CODE || error.status === 401) {
      return { ok: false, message: "Please sign in to comment on posts.", requiresSignIn: true };
    }
    return { ok: false, message: "Comment could not be saved." };
  }
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return { ok: false, message: "Unable to connect. Check your connection and try again." };
  }
  return { ok: false, message: "Comment could not be saved." };
}

export async function submitQuadComment(args: {
  noteId: string;
  author: AddCommentParams;
  parentCommentId?: string | null;
  onOptimistic: () => void;
}): Promise<QuadCommentActionResult> {
  const { noteId, author, parentCommentId, onOptimistic } = args;
  const body = author.body.trim();
  if (!body) return { ok: false, message: "Enter a comment." };

  if (!getAccessToken()) {
    return { ok: false, message: "Please sign in to comment on posts.", requiresSignIn: true };
  }

  if (!getNoteForReaction(noteId) && !isPersistedQuadPostId(noteId)) {
    return { ok: false, message: "This post is no longer available." };
  }

  const authorWithParent = { ...author, parentCommentId: parentCommentId ?? null };

  if (!isPersistedQuadPostId(noteId)) {
    addCommentWithId(noteId, authorWithParent, `qc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    onOptimistic();
    return {
      ok: false,
      demoPost: true,
      message: "Demo posts reset when you refresh. Comment on real campus posts to keep your reply.",
    };
  }

  const optimisticId = `qc-opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const optimistic = addCommentWithId(noteId, authorWithParent, optimisticId);
  if (!optimistic) {
    return { ok: false, message: "This post is no longer available." };
  }
  onOptimistic();

  try {
    const saved = await createQuadPostComment(noteId, body, parentCommentId ?? null);
    replaceComment(noteId, optimisticId, saved);
    bumpCommentCountForNote(noteId);
    onOptimistic();
    return { ok: true };
  } catch (error) {
    removeCommentById(optimisticId);
    onOptimistic();
    return mapCommentError(error);
  }
}

export async function toggleQuadCommentLike(args: {
  commentId: string;
  liked: boolean;
  onOptimistic: () => void;
}): Promise<QuadCommentActionResult> {
  const { commentId, liked, onOptimistic } = args;

  if (!getAccessToken()) {
    return { ok: false, message: "Please sign in to like comments.", requiresSignIn: true };
  }

  if (commentId.startsWith("qc-opt-") || commentId.startsWith("qc-")) {
    return { ok: false, message: "Save the comment before liking it." };
  }

  const existing = getCommentById(commentId);
  const previous = {
    likeCount: existing?.likeCount ?? 0,
    viewerHasLiked: existing?.viewerHasLiked ?? false,
  };
  patchCommentLike(
    commentId,
    liked ? previous.likeCount + (previous.viewerHasLiked ? 0 : 1) : Math.max(0, previous.likeCount - (previous.viewerHasLiked ? 1 : 0)),
    liked,
  );
  onOptimistic();

  try {
    const result = liked ? await likeQuadComment(commentId) : await unlikeQuadComment(commentId);
    patchCommentLike(commentId, result.likeCount, result.viewerHasLiked);
    onOptimistic();
    return { ok: true };
  } catch (error) {
    patchCommentLike(commentId, previous.likeCount, previous.viewerHasLiked);
    onOptimistic();
    return mapCommentError(error);
  }
}
