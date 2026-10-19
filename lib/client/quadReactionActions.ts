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
import { setEmberAllowance, snapshotEmberAllowance } from "@/lib/client/emberAllowance";
import { dismissEmberCast, publishEmberCast } from "@/lib/client/emberCastEvents";
import { showAppToast } from "@/lib/client/appToast";
import { EMBER_COPY, EMBER_ERROR_CODES, type EmberAllowance } from "@/lib/embers";

export type QuadReactionActionResult =
  | { ok: true; given?: boolean; allowance?: EmberAllowance }
  | { ok: false; message: string; code?: string; requiresSignIn?: boolean; demoPost?: boolean; allowance?: EmberAllowance };

/** Prevents duplicate network awards while a tap is still in flight. */
const sparkInFlight = new Set<string>();

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
      return { ok: false, message: EMBER_COPY.alreadyGiven, code: error.code };
    }
    if (kind === "ember" && error.message?.trim()) {
      const serverMsg = error.message.trim();
      // Surface readable API copy; hide raw SQL/permission noise behind saveFailed.
      if (
        /permission denied|hype_count|violates row-level|PGRST/i.test(serverMsg) ||
        serverMsg.startsWith("Backend request failed")
      ) {
        return { ok: false, message: EMBER_COPY.saveFailed, code: error.code };
      }
      if (serverMsg !== "Invalid API response." && serverMsg.length < 140) {
        return { ok: false, message: serverMsg, code: error.code };
      }
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

function fireEmberHaptic(): void {
  void import("@/lib/client/capacitorNative").then(({ nativeImpact }) => {
    void nativeImpact("light");
  });
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

  if (sparkInFlight.has(noteId)) {
    return { ok: true, given: false, allowance: snapshotEmberAllowance() ?? undefined };
  }
  sparkInFlight.add(noteId);

  const allowanceSnapshot = snapshotEmberAllowance();
  // Visual fill only — daily allowance stays unchanged until the server confirms.
  optimisticGiveSparkOnAllCopies(noteId, userId);
  onOptimistic();

  const unlimitedPreview = Boolean(allowanceSnapshot?.unlimited);
  const remainingAfterPreview = unlimitedPreview
    ? 0
    : Math.max(0, (allowanceSnapshot?.remaining ?? 1) - 1);
  // Start cast / haptic on the same tap; do not wait for the network.
  publishEmberCast(
    unlimitedPreview
      ? { noteId, remainingAfter: remainingAfterPreview, unlimited: true }
      : { noteId, remainingAfter: remainingAfterPreview },
  );
  fireEmberHaptic();
  onSparkSent?.();

  try {
    const result = await toggleQuadPostReaction(noteId, "spark");
    const sparked = Boolean(result.currentUserHasSparked ?? result.active);
    applyServerReactionStateToAllCopies(noteId, userId, {
      ...result,
      currentUserHasSparked: sparked,
    });
    if (result.emberAllowance) setEmberAllowance(result.emberAllowance);
    onOptimistic();
    if (!sparked) {
      dismissEmberCast(noteId);
      restoreReactionStateToAllCopies(noteId, userId, snapshot);
      if (allowanceSnapshot) setEmberAllowance(allowanceSnapshot);
      onOptimistic();
      return { ok: false, message: EMBER_COPY.saveFailed };
    }
    // Single success toast — cast overlay never shows "Ember given".
    showAppToast(EMBER_COPY.emberSent, { tone: "success", durationMs: 2200 });
    return { ok: true, given: true, allowance: result.emberAllowance };
  } catch (error) {
    dismissEmberCast(noteId);
    restoreReactionStateToAllCopies(noteId, userId, snapshot);
    if (allowanceSnapshot) setEmberAllowance(allowanceSnapshot);
    onOptimistic();
    return mapReactionError(error, "ember");
  } finally {
    sparkInFlight.delete(noteId);
  }
}
