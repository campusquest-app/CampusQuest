"use client";

import { setCommentsForNote } from "@/lib/feedStore";
import { isPersistedQuadPostId } from "@/lib/quadFieldNote";
import { fetchQuadPostComments } from "@/lib/client/quadCommentsClient";
import { logError } from "@/lib/errorLogger";

/** Load persisted comments for a post into the in-memory feed store. */
export async function hydrateQuadPostComments(postId: string): Promise<void> {
  if (!isPersistedQuadPostId(postId)) return;
  const loaded = await fetchQuadPostComments(postId);
  setCommentsForNote(postId, loaded);
}

export async function hydrateQuadPostCommentsSafe(
  postId: string,
  context: string,
): Promise<boolean> {
  try {
    await hydrateQuadPostComments(postId);
    return true;
  } catch (error) {
    logError(error, { component: `quad-comments-hydrate:${context}`, meta: { postId } });
    return false;
  }
}
