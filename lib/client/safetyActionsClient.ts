"use client";

import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, CQ_MISSING_SESSION_CODE } from "@/lib/client/dashboardApi";
import { postAuthed } from "@/lib/client/dashboardApi";
import type { ContentReportReason } from "@/lib/contentReportReasons";

export async function reportUserRequest(
  userId: string,
  payload: { reason: ContentReportReason; details?: string },
): Promise<void> {
  await postAuthed(`/api/users/${userId}/report`, payload);
}

export async function reportCommentRequest(
  commentId: string,
  payload: { reason: ContentReportReason; details?: string; reportedUserId?: string },
): Promise<void> {
  await postAuthed(`/api/comments/${commentId}/report`, payload);
}

export async function reportInfringementRequest(payload: {
  reason?: "copyright_infringement" | "other";
  details: string;
  contentUrl?: string;
  targetId?: string;
}): Promise<void> {
  await postAuthed("/api/moderation/infringement", payload);
}

/** Self-serve account deletion with typed confirmation. */
export async function deleteOwnAccountRequest(): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new ApiRequestError("Session required. Sign in again.", 401, CQ_MISSING_SESSION_CODE);
  }
  const response = await fetch("/api/me/account", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmation: "DELETE" }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new ApiRequestError(
      payload.error?.message ?? "Could not delete your account.",
      response.status,
      payload.error?.code,
    );
  }
}
