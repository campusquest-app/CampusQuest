"use client";

import { CQ_BOTTOM_NAV_CLEARANCE } from "@/components/AppBottomNav";

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
        <div className="cq-dock-nav__rail">
          <div className="flex w-full items-end justify-between gap-1 px-1">
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
            <div className="cq-skeleton -mt-5 mx-auto h-14 w-14 rounded-full" />
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
            <div className="cq-skeleton mx-auto h-10 w-10 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
