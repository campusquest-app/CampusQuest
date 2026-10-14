"use client";

import { CQ_BOTTOM_NAV_CLEARANCE } from "@/components/AppBottomNav";
import { dockCradlePath, DOCK_CRADLE_FILL, DOCK_CRADLE_RISE_PX } from "@/lib/client/dockCradlePath";

const SKELETON_CRADLE_H = 76 + DOCK_CRADLE_RISE_PX;
const SKELETON_CRADLE = dockCradlePath({ width: 390, height: SKELETON_CRADLE_H });

/**
 * Shown while session token exists but profile+stats hydration is still in flight.
 */
export function DashboardBootstrapShellSkeleton() {
  return (
    <div className="min-h-[70vh] flex flex-col w-full" aria-busy="true" aria-label="Loading your profile">
      <div
        className="w-full px-4"
        style={{
          paddingBottom: CQ_BOTTOM_NAV_CLEARANCE,
        }}
      >
        <div className="mx-auto w-full max-w-2xl space-y-3 pt-4 cq-skeleton-wrap">
          <div className="cq-skeleton h-10 w-full rounded-2xl" />
          <div className="cq-skeleton h-14 w-full rounded-2xl" />
          <div className="cq-skeleton h-52 w-full rounded-2xl" />
          <div className="cq-skeleton h-52 w-full rounded-2xl" />
        </div>
      </div>

      <div className="cq-dock-nav" aria-hidden>
        <div className="cq-dock-nav__slide">
        <svg className="cq-dock-nav__shape" viewBox={`0 0 390 ${SKELETON_CRADLE_H}`} preserveAspectRatio="none" aria-hidden>
          <path d={SKELETON_CRADLE} fill={DOCK_CRADLE_FILL} />
        </svg>
        <div className="cq-dock-nav__rail">
          <div className="flex w-full items-center justify-between gap-1 px-1">
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
            <div className="cq-skeleton mx-auto h-12 w-12 rounded-full" />
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
