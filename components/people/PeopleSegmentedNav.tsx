"use client";

import { formatIncomingRequestBadge, type PeopleTab } from "@/lib/client/peopleDiscoveryUi";

const TABS: Array<{ id: PeopleTab; label: string }> = [
  { id: "discover", label: "Discover" },
  { id: "requests", label: "Requests" },
  { id: "following", label: "Following" },
];

export function PeopleSegmentedNav({
  active,
  incomingCount,
  onChange,
}: {
  active: PeopleTab;
  incomingCount: number;
  onChange: (tab: PeopleTab) => void;
}) {
  const badge = formatIncomingRequestBadge(incomingCount);

  return (
    <div className="cq-people-tabs" role="tablist" aria-label="Find People sections">
      {TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            id={`cq-people-tab-${tab.id}`}
            aria-controls={`cq-people-panel-${tab.id}`}
            className={`cq-people-tab${selected ? " cq-people-tab--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.id === "requests" && badge ? (
              <span className="cq-people-tab-badge" aria-label={`${badge} incoming requests`}>
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
