"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { QUAD_POST_REPORT_REASONS, type QuadPostReportReason } from "@/lib/quadPostReportReasons";
import { reportQuadPostRequest } from "@/lib/client/quadPostReportsClient";
import { ApiRequestError } from "@/lib/client/dashboardApi";

export function ReportPostSheet({
  postId,
  onClose,
  onSubmitted,
  onError,
}: {
  postId: string;
  onClose: () => void;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState<QuadPostReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await reportQuadPostRequest(postId, {
        reason,
        details: details.trim() || undefined,
      });
      onSubmitted();
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "QUAD_POST_ALREADY_REPORTED") {
        onError("You already reported this post.");
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
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Report post">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-white/10 bg-[#121212] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <h2 className="text-[15px] font-semibold text-white">Report post</h2>
          <button type="button" onClick={onClose} className="cq-inbox-icon-btn" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(70dvh,28rem)] overflow-y-auto px-4 py-4">
          <p className="text-sm text-white/55">Why are you reporting this post?</p>
          <ul className="mt-3 space-y-1">
            {QUAD_POST_REPORT_REASONS.map((option) => {
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

          {reason ? (
            <div className="mt-4">
              <label htmlFor="report-post-details" className="text-xs font-medium text-white/45">
                Add details <span className="text-white/30">(optional)</span>
              </label>
              <textarea
                id="report-post-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Tell us more if helpful…"
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
            disabled={!reason || submitting}
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
