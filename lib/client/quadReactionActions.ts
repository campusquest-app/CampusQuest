"use client";

import {
  getNoteForReaction,
  applyServerReactionStateToAllCopies,
  optimisticToggleLikeOnAllCopies,
  optimisticGiveSparkOnAllCopies,
  restoreReactionStateToAllCopies,
  snapshotReactionStateForNote,
} from "@/lib/feedStore";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, CQ_MISSING_SESSION_CODE } from "@/lib/client/dashboardApi";
import { likeQuadPost, unlikeQuadPost, toggleQuadPostReaction } from "@/lib/client/quadPostsClient";
import {
  applyOptimisticEmberGive,
  setEmberAllowance,
  snapshotEmberAllowance,
} from "@/lib/client/emberAllowance";
import { publishEmberCast } from "@/lib/client/emberCastEvents";
import { EMBER_COPY, EMBER_ERROR_CODES, type EmberAllowance } from "@/lib/embers";

export type QuadReactionActionResult =
  | { ok: true; given?: boolean; allowance?: EmberAllowance }
  | { ok: false; message: string; code?: string; requiresSignIn?: boolean; demoPost?: boolean; allowance?: EmberAllowance };

function mapReactionError(error: unknown, kind: "like" | "ember" = "like"): QuadReactionActionResult {
  if (error instanceof ApiRequestError) {
    if (error.code === CQ_MISSING_SESSION_CODE || error.status === 401) {
      return {
        ok: false,
        message: kind === "ember" ? EMBER_COPY.signIn : "Please sign in to like posts.",
        requiresSignIn: true,
        code: error.code,
      };
    }
    if (error.code === EMBER_ERROR_CODES.dailyLimit) {
      return { ok: false, message: EMBER_COPY.exhausted, code: error.code };
    }
    if (error.code === EMBER_ERROR_CODES.self) {
      return { ok: false, message: EMBER_COPY.ownPost, code: error.code };
    }
    if (error.code === EMBER_ERROR_CODES.notEligible || error.code === EMBER_ERROR_CODES.notVerified) {
      return { ok: false, message: error.message || EMBER_COPY.notEligible, code: error.code };
    }
    if (error.code === EMBER_ERROR_CODES.blocked) {
      return { ok: false, message: EMBER_COPY.blocked, code: error.code };
    }
    if (error.code === EMBER_ERROR_CODES.duplicate) {
      return { ok: false, message: "You already gave this post an Ember.", code: error.code };
    }
    return {
      ok: false,
      message: kind === "ember" ? EMBER_COPY.saveFailed : "Could not save your reaction. Please try again.",
      code: error.code,
    };
  }
  if (error instanceof Error && error.message.startsWith("NETWORK_ERROR:")) {
    return { ok: false, message: "Unable to connect. Check your connection and try again." };
  }
  return {
    ok: false,
    message: kind === "ember" ? EMBER_COPY.saveFailed : "Could not save your reaction. Please try again.",
  };
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
      message: EMBER_COPY.demo,
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
  if (wasSparked) {
    // Already awarded — keep filled state; do not spend or animate again.
    return { ok: true, given: false, allowance: snapshotEmberAllowance() ?? undefined };
  }

  const allowanceSnapshot = snapshotEmberAllowance();
  optimisticGiveSparkOnAllCopies(noteId, userId);
  applyOptimisticEmberGive();
  onOptimistic();

  try {
    const result = await toggleQuadPostReaction(noteId, "spark");
    const sparked = Boolean(result.currentUserHasSparked ?? result.active);
    applyServerReactionStateToAllCopies(noteId, userId, {
      ...result,
      currentUserHasSparked: sparked,
    });
    if (result.emberAllowance) setEmberAllowance(result.emberAllowance);
    onOptimistic();
    const given = sparked;
    if (given) {
      onSparkSent?.();
      const unlimited = Boolean(result.emberAllowance?.unlimited);
      const remainingAfter = unlimited
        ? 0
        : (result.emberAllowance?.remaining ?? Math.max(0, (allowanceSnapshot?.remaining ?? 1) - 1));
      publishEmberCast(unlimited ? { noteId, remainingAfter, unlimited: true } : { noteId, remainingAfter });
    }
    return { ok: true, given, allowance: result.emberAllowance };
  } catch (error) {
    restoreReactionStateToAllCopies(noteId, userId, snapshot);
    if (allowanceSnapshot) setEmberAllowance(allowanceSnapshot);
    onOptimistic();
    return mapReactionError(error, "ember");
  }
}
