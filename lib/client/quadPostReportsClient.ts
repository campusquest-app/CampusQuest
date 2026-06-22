"use client";

import { postAuthed } from "@/lib/client/dashboardApi";
import type { QuadPostReportReason } from "@/lib/quadPostReportReasons";

export async function reportQuadPostRequest(
  postId: string,
  payload: { reason: QuadPostReportReason; details?: string },
): Promise<void> {
  await postAuthed(`/api/quad/posts/${postId}/report`, payload);
}
