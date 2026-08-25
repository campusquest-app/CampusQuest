"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MARKETPLACE_REPORT_REASONS, type MarketplaceReportReason } from "@/lib/marketplace/policy";
import { reportMarketplaceListingRequest } from "@/lib/client/marketplaceClient";
import { ApiRequestError } from "@/lib/client/dashboardApi";

export function MarketReportSheet({
  listingId,
  onClose,
  onSubmitted,
  onError,
}: {
  listingId: string;
  onClose: () => void;
  onSubmitted: () => void;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState<MarketplaceReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await reportMarketplaceListingRequest(listingId, { reason, details: details.trim() || undefined });
      onSubmitted();
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CONTENT_ALREADY_REPORTED") {
        onError("You already reported this listing.");
      } else {
        onError(err instanceof Error ? err.message : "Report could not be submitted.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cq-create-sheet-overlay" role="dialog" aria-modal="true" aria-label="Report listing" onClick={onClose}>
      <div className="cq-create-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="cq-create-sheet-grip" aria-hidden />
        <div className="cq-create-sheet-head">
          <h2 className="cq-create-sheet-title">Report listing</h2>
          <button type="button" className="cq-create-sheet-close" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="cq-market-sheet-copy">Why are you reporting this listing?</p>
        <ul className="cq-market-reason-list">
          {MARKETPLACE_REPORT_REASONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className={`cq-market-reason${reason === option.value ? " cq-market-reason--active" : ""}`}
                onClick={() => setReason(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
        <textarea
          className="cq-market-input cq-market-textarea"
          placeholder="Optional details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={2000}
        />
        <button type="button" className="cq-market-btn cq-market-btn--primary cq-market-btn--block" disabled={!reason || submitting} onClick={() => void handleSubmit()}>
          {submitting ? "Sending…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}
