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
      {(Object.entries(REALM_TRACE_PATHS) as [string, string][]).map(([key, d]) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke="rgba(255, 255, 255, 0.28)"
          strokeWidth={key === "mainSpine" || key === "recToUnion" ? 0.5 : 0.36}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="realm-map-path"
          data-path={key}
        />
      ))}
    </svg>
  );
}
