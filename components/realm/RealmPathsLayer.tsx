"use client";

import { REALM_MAP_VIEW_HEIGHT, REALM_MAP_VIEW_WIDTH, REALM_TRACE_PATHS } from "@/lib/realm/mapGeometry";

/** Layer 3 — walkways and paths between buildings. */
export function RealmPathsLayer() {
  return (
    <svg
      className="realm-paths-layer absolute inset-0 z-[2] h-full w-full pointer-events-none"
      viewBox={`0 0 ${REALM_MAP_VIEW_WIDTH} ${REALM_MAP_VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {(Object.entries(REALM_TRACE_PATHS) as [string, string][]).map(([key, d]) => {
        const major = key === "mainSpine" || key === "recToUnion";
        return (
          <g key={key} className="realm-map-path" data-path={key}>
            {/* Worn road underlay */}
            <path
              d={d}
              fill="none"
              stroke="rgba(110, 78, 36, 0.4)"
              strokeWidth={major ? 0.78 : 0.56}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Stone trail dashes */}
            <path
              d={d}
              fill="none"
              stroke="rgba(244, 222, 168, 0.75)"
              strokeWidth={major ? 0.3 : 0.22}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0.7 0.85"
            />
          </g>
        );
      })}
    </svg>
  );
}
