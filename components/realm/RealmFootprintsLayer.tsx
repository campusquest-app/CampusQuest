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
          <rect
            x={-b.w / 2}
            y={-b.h / 2}
            width={b.w}
            height={b.h}
            rx={0.35}
            fill="rgba(255, 255, 255, 0.08)"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="0.24"
          />
        </g>
      ))}
    </svg>
  );
}
