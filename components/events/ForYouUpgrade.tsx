"use client";

import { Sparkles } from "lucide-react";
import { CAMPUSQUEST_BASIC_BILLING_URL } from "@/lib/basic/entitlement";

export function ForYouUpgrade({ onBrowseAll }: { onBrowseAll: () => void }) {
  return (
    <div className="cq-events-upgrade" role="status">
      <span className="cq-events-upgrade__icon" aria-hidden>
        <Sparkles className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h2 className="cq-events-upgrade__title">Unlock For You</h2>
      <p className="cq-events-upgrade__detail">
        Get personalized event recommendations based on your interests and what&apos;s happening around campus
        with CampusQuest Basic.
      </p>
      <a className="cq-events-upgrade__cta cq-tap-press" href={CAMPUSQUEST_BASIC_BILLING_URL}>
        Get CampusQuest Basic
      </a>
      <button type="button" className="cq-events-upgrade__secondary cq-tap-press" onClick={onBrowseAll}>
        Browse all events
      </button>
    </div>
  );
}
