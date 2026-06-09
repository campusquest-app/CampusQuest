"use client";

import {
  getNoteForReaction,
  applyServerReactionStateToAllCopies,
  optimisticToggleLikeOnAllCopies,
  optimisticToggleSparkOnAllCopies,
  restoreReactionStateToAllCopies,
  snapshotReactionStateForNote,
} from "@/lib/feedStore";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, CQ_MISSING_SESSION_CODE } from "@/lib/client/dashboardApi";
import { likeQuadPost, unlikeQuadPost, toggleQuadPostReaction } from "@/lib/client/quadPostsClient";

export type QuadReactionActionResult =
  | { ok: true }
  | { ok: false; message: string; requiresSignIn?: boolean; demoPost?: boolean };

function mapReactionError(error: unknown): QuadReactionActionResult {
  if (error instanceof ApiRequestError) {
    if (error.code === CQ_MISSING_SESSION_CODE || error.status === 401) {
      return { ok: false, message: "Please sign in to like posts.", requiresSignIn: true };
    }
    return { ok: false, message: "Could not save your reaction. Please try again." };
  }
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return { ok: false, message: "Unable to connect. Check your connection and try again." };
  }
  return { ok: false, message: "Could not save your reaction. Please try again." };
}

export async function toggleQuadLike(args: {
  noteId: string;
  userId: string;
  onOptimistic: () => void;
}): Promise<QuadReactionActionResult> {
  const { noteId, userId, onOptimistic } = args;

  if (!getAccessToken()) {
    return { ok: false, message: "Please sign in to like posts.", requiresSignIn: true };
  }

  if (!isPersistedQuadPostId(noteId)) {
    return {
      ok: false,
      demoPost: true,
      message: "Demo posts reset when you refresh. Like real campus posts to keep your reaction.",
    };
  }

  if (!getNoteForReaction(noteId)) {
    return { ok: false, message: "This post is no longer available." };
  }

  const snapshot = snapshotReactionStateForNote(noteId, userId);
  if (!snapshot) {
    return { ok: false, message: "This post is no longer available." };
  }

  const wantsLike = !snapshot.liked;
  optimisticToggleLikeOnAllCopies(noteId, userId);
  onOptimistic();

  try {
    const result = wantsLike ? await likeQuadPost(noteId) : await unlikeQuadPost(noteId);
    applyServerReactionStateToAllCopies(noteId, userId, {
      likeCount: result.likeCount,
      sparkCount: snapshot.hypeCount,
      currentUserHasLiked: result.currentUserHasLiked,
      currentUserHasSparked: snapshot.sparked,
    });
    onOptimistic();
    return { ok: true };
  } catch (error) {
    restoreReactionStateToAllCopies(noteId, userId, snapshot);
    onOptimistic();
    return mapReactionError(error);
  }
}

export async function toggleQuadSpark(args: {
  noteId: string;
  userId: string;
  onOptimistic: () => void;
  onSparkSent?: () => void;
}): Promise<QuadReactionActionResult> {
  const { noteId, userId, onOptimistic, onSparkSent } = args;

  if (!getAccessToken()) {
    return { ok: false, message: "Please sign in to react to posts.", requiresSignIn: true };
  }

  if (!isPersistedQuadPostId(noteId)) {
    return {
      ok: false,
      demoPost: true,
      message: "Demo posts reset when you refresh. Spark real campus posts to keep your reaction.",
    };
  }

  if (!getNoteForReaction(noteId)) {
    return { ok: false, message: "This post is no longer available." };
  }

  const snapshot = snapshotReactionStateForNote(noteId, userId);
  if (!snapshot) {
    return { ok: false, message: "This post is no longer available." };
  }

  const wasSparked = snapshot.sparked;
  optimisticToggleSparkOnAllCopies(noteId, userId);
  onOptimistic();

  try {
    const result = await toggleQuadPostReaction(noteId, "spark");
    applyServerReactionStateToAllCopies(noteId, userId, result);
    onOptimistic();
    if (result.active && !wasSparked) onSparkSent?.();
    return { ok: true };
  } catch (error) {
    restoreReactionStateToAllCopies(noteId, userId, snapshot);
    onOptimistic();
    return mapReactionError(error);
  }
}
