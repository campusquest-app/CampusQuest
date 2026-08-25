"use client";

import { MAP_FILTER_PILLS, type MapMarkerFilter } from "@/lib/realm/mapMarkerFilters";

export function RealmMapFilterPills({
  value,
  onChange,
  immersive = false,
  entered = true,
}: {
  value: MapMarkerFilter;
  onChange: (next: MapMarkerFilter) => void;
  immersive?: boolean;
  entered?: boolean;
}) {
  return (
    <div
      className={`cq-realm-map-filter${immersive ? " cq-realm-map-filter--immersive" : ""}${
        entered ? " cq-realm-map-filter--entered" : ""
      }`}
      role="tablist"
      aria-label="Map filters"
      data-no-drawer-swipe="true"
      data-cq-gesture-block="swipe-tab"
    >
      {MAP_FILTER_PILLS.map((filter) => {
        const active = value === filter.id;
        return (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`cq-realm-map-filter-chip touch-manipulation${
              active ? " cq-realm-map-filter-chip--active" : ""
            }${filter.liveDot ? " cq-realm-map-filter-chip--live" : ""}`}
            aria-label={`${filter.label} map filter`}
            onClick={() => onChange(filter.id)}
          >
            {filter.liveDot ? (
              <span className="cq-realm-map-filter-live-dot" aria-hidden />
            ) : null}
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
