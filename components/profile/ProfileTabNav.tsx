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

/**
 * Visible profile tabs after feature-flag gating (Codex = collectibles).
 * "tagged" stays a valid ProfileTab but lives as a filter inside Posts.
 */
export function getVisibleProfileTabs(
  flags: { codex: boolean } = FEATURE_FLAGS,
): { id: ProfileTab; label: string }[] {
  return TABS.filter((tab) => tab.id !== "tagged" && (tab.id !== "collectibles" || flags.codex));
}

/** Which visible tab owns the given profile tab state ("tagged" → Posts). */
export function visibleProfileTabFor(tab: ProfileTab): ProfileTab {
  return tab === "tagged" ? "posts" : tab;
}

/** Posts tab filter: the user's own posts, or posts they're tagged in. */
export function ProfilePostsFilter({
  active,
  onChange,
}: {
  active: "posts" | "tagged";
  onChange: (tab: "posts" | "tagged") => void;
}) {
  const options = [
    { id: "posts" as const, label: "Posts" },
    { id: "tagged" as const, label: "Tagged" },
  ];
  return (
    <div className="cq-profile-posts-filter" role="group" aria-label="Filter posts">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={active === option.id}
          onClick={() => onChange(option.id)}
          className={`cq-profile-posts-filter-btn${active === option.id ? " cq-profile-posts-filter-btn--active" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
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
  const current = visibleProfileTabFor(active);
  const activeIndex = Math.max(0, visibleTabs.findIndex((t) => t.id === current));

  return (
    <nav className="cq-profile-tabs sticky top-0 z-10" aria-label="Profile sections">
      {visibleTabs.map((tab) => {
        const selected = current === tab.id;
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
