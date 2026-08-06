"use client";

import { FEATURE_FLAGS } from "@/lib/featureFlags";

export type ProfileTab = "posts" | "tagged" | "memories" | "collectibles" | "activity";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "posts", label: "Posts" },
  { id: "tagged", label: "Tagged" },
  { id: "memories", label: "Memories" },
  { id: "collectibles", label: "Codex" },
  { id: "activity", label: "Activity" },
];

/** Visible profile tabs after feature-flag gating (Codex = collectibles). */
export function getVisibleProfileTabs(
  flags: { codex: boolean } = FEATURE_FLAGS,
): { id: ProfileTab; label: string }[] {
  return TABS.filter((tab) => tab.id !== "collectibles" || flags.codex);
}

export function ProfileTabNav({
  active,
  onChange,
  locked = false,
}: {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  locked?: boolean;
}) {
  const visibleTabs = getVisibleProfileTabs();
  const activeIndex = Math.max(0, visibleTabs.findIndex((t) => t.id === active));

  return (
    <nav className="cq-profile-tabs sticky top-0 z-10" aria-label="Profile sections">
      {visibleTabs.map((tab) => {
        const selected = active === tab.id;
        const isLockedTab = locked && tab.id !== "posts";
        return (
          <button
            key={tab.id}
            type="button"
            disabled={locked}
            onClick={() => onChange(tab.id)}
            className={`cq-profile-tab ${selected ? "cq-profile-tab--active" : ""} ${
              locked ? "cq-profile-tab--locked" : ""
            }`}
            aria-current={selected ? "page" : undefined}
            aria-disabled={isLockedTab || locked ? true : undefined}
          >
            <span className={`cq-profile-tab-label${selected ? " cq-profile-tab-label--active" : ""}`}>
              {tab.label}
            </span>
            {isLockedTab ? <span aria-hidden>🔒</span> : null}
          </button>
        );
      })}
      {/* Sliding underline indicator — animates between tabs. */}
      <span
        className="cq-profile-tab-indicator"
        aria-hidden
        style={{
          width: `${100 / Math.max(visibleTabs.length, 1)}%`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
    </nav>
  );
}
