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

      <div
        className="cq-nav-shell-bottom fixed inset-x-0 bottom-0 z-50 w-full"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
        aria-hidden
      >
        <div className="grid w-full grid-cols-3 gap-0 px-2 pt-2">
          <div className="cq-skeleton mx-auto mt-2 h-10 w-10 rounded-2xl" />
          <div className="cq-skeleton mx-auto -mt-4 h-16 w-16 rounded-full" />
          <div className="cq-skeleton mx-auto mt-2 h-10 w-10 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
