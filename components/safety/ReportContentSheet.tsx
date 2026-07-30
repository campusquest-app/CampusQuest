"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  CONTENT_REPORT_REASONS,
  USER_REPORT_REASONS,
  INFRINGEMENT_REPORT_REASONS,
  type ContentReportReason,
} from "@/lib/contentReportReasons";
import {
  reportCommentRequest,
  reportInfringementRequest,
  reportUserRequest,
} from "@/lib/client/safetyActionsClient";
import { ApiRequestError } from "@/lib/client/dashboardApi";

type ReportMode = "user" | "comment" | "infringement";

const REASONS_BY_MODE: Record<ReportMode, readonly { value: ContentReportReason; label: string }[]> = {
  user: USER_REPORT_REASONS,
  comment: CONTENT_REPORT_REASONS.filter((r) =>
    ["harassment", "hate_speech", "nudity", "violence", "spam", "restricted_content", "other"].includes(
      r.value,
    ),
  ),
  infringement: INFRINGEMENT_REPORT_REASONS,
};

const TITLES: Record<ReportMode, string> = {
  user: "Report user",
  comment: "Report comment",
  infringement: "Report copyright infringement",
};

export function ReportContentSheet({
  mode,
  targetLabel,
  userId,
  commentId,
  reportedUserId,
  onClose,
  onSubmitted,
  onError,
}: {
  mode: ReportMode;
  targetLabel?: string;
  userId?: string;
  commentId?: string;
  reportedUserId?: string;
  onClose: () => void;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const reasons = REASONS_BY_MODE[mode];
  const [reason, setReason] = useState<ContentReportReason | null>(
    mode === "infringement" ? "copyright_infringement" : null,
  );
  const [details, setDetails] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const detailsRequired = mode === "infringement";
  const canSubmit =
    Boolean(reason) &&
    !submitting &&
    (!detailsRequired || details.trim().length >= 20);

  async function handleSubmit() {
    if (!reason || !canSubmit) return;
    setSubmitting(true);
    try {
      if (mode === "user") {
        if (!userId) throw new Error("Missing user.");
        await reportUserRequest(userId, { reason, details: details.trim() || undefined });
      } else if (mode === "comment") {
        if (!commentId) throw new Error("Missing comment.");
        await reportCommentRequest(commentId, {
          reason,
          details: details.trim() || undefined,
          reportedUserId,
        });
      } else {
        await reportInfringementRequest({
          reason: reason === "other" ? "other" : "copyright_infringement",
          details: details.trim(),
          contentUrl: contentUrl.trim() || undefined,
          targetId: commentId ?? userId,
        });
      }
      onSubmitted();
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CONTENT_ALREADY_REPORTED") {
        onError("You already reported this.");
      } else {
        const message = err instanceof Error ? err.message : "Report could not be submitted.";
        onError(message.replace(/^Backend request failed:[^.]*\.\s*/i, "") || "Report could not be submitted.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[mode]}
    >
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/10 bg-[#121212] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <h2 className="text-[15px] font-semibold text-white">{TITLES[mode]}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(70dvh,28rem)] overflow-y-auto px-4 py-4">
          {targetLabel ? <p className="mb-2 text-sm text-white/45">{targetLabel}</p> : null}
          <p className="text-sm text-white/55">Why are you reporting this?</p>
          <ul className="mt-3 space-y-1">
            {reasons.map((option) => {
              const selected = reason === option.value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => setReason(option.value)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      selected
                        ? "bg-[#0095f6]/15 font-semibold text-[#0095f6]"
                        : "text-white/85 hover:bg-white/[0.05]"
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>

          {mode === "infringement" ? (
            <div className="mt-4">
              <label htmlFor="report-content-url" className="text-xs font-medium text-white/45">
                Link to the content <span className="text-white/30">(optional)</span>
              </label>
              <input
                id="report-content-url"
                type="url"
                value={contentUrl}
                onChange={(e) => setContentUrl(e.target.value)}
                placeholder="https://…"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#0095f6]/45 focus:outline-none"
              />
            </div>
          ) : null}

          {reason ? (
            <div className="mt-4">
              <label htmlFor="report-content-details" className="text-xs font-medium text-white/45">
                Add details{" "}
                {detailsRequired ? (
                  <span className="text-rose-300/80">(required, 20+ characters)</span>
                ) : (
                  <span className="text-white/30">(optional)</span>
                )}
              </label>
              <textarea
                id="report-content-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={
                  mode === "infringement"
                    ? "Describe the copyrighted work and where it appears…"
                    : "Tell us more if helpful…"
                }
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-[#0095f6]/45 focus:outline-none"
              />
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-white/[0.08] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-[#0095f6] py-2.5 text-sm font-semibold text-white disabled:opacity-45"
          >
            {submitting ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
