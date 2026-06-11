"use client";

import {
  REALM_BUILDING_FOOTPRINTS,
  REALM_MAP_VIEW_HEIGHT,
  REALM_MAP_VIEW_WIDTH,
} from "@/lib/realm/mapGeometry";

/** Layer 2 — building footprints aligned to the URI campus map. */
export function RealmFootprintsLayer() {
  return (
    <svg
      className="realm-footprints-layer absolute inset-0 z-[1] h-full w-full pointer-events-none"
      viewBox={`0 0 ${REALM_MAP_VIEW_WIDTH} ${REALM_MAP_VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {REALM_BUILDING_FOOTPRINTS.map((b) => (
        <g
          key={b.id}
          transform={`translate(${b.cx} ${b.cy}) rotate(${b.rotate ?? 0})`}
          className="realm-building-footprint"
          data-footprint={b.id}
        >
          {b.id === "the-quad" ? (
            /* Open lawn — soft magical green, no building outline */
            <ellipse
              cx={0}
              cy={0}
              rx={b.w / 2 + 1.2}
              ry={b.h / 2 + 0.8}
              fill="rgba(134, 188, 110, 0.14)"
              stroke="rgba(134, 188, 110, 0.3)"
              strokeWidth="0.16"
              strokeDasharray="0.45 0.7"
            />
          ) : (
            <rect
              x={-b.w / 2}
              y={-b.h / 2}
              width={b.w}
              height={b.h}
              rx={0.35}
              fill="rgba(197, 160, 40, 0.1)"
              stroke="rgba(120, 84, 32, 0.55)"
              strokeWidth="0.22"
              strokeDasharray="0.9 0.45"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
