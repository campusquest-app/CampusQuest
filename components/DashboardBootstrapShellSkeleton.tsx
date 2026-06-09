"use client";

import { CQ_BOTTOM_NAV_CLEARANCE } from "@/components/AppBottomNav";

/**
 * Shown while session token exists but profile+stats hydration is still in flight.
 * Mirrors premium shell (edge-to-edge header + bottom nav).
 */
export function DashboardBootstrapShellSkeleton() {
  return (
    <div className="min-h-[70vh] flex flex-col w-full" aria-busy="true" aria-label="Loading your profile">
      <header
        className="cq-nav-shell-top cq-top-nav fixed inset-x-0 top-0 z-50 w-full"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div
          className="cq-top-nav-inner w-full px-3"
          style={{
            paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
          }}
        >
          <div className="cq-top-nav-primary">
            <div className="cq-skeleton h-9 w-9 rounded-xl" />
            <div className="cq-skeleton h-5 w-36 rounded" />
            <div className="cq-skeleton h-9 w-9 rounded-xl" />
          </div>
          <div className="cq-top-nav-meta">
            <div className="cq-skeleton mt-1 h-2 w-28 rounded-full" />
            <div className="cq-skeleton mt-1 h-px w-24 rounded" />
          </div>
        </div>
      </header>

      <div
        className="w-full px-4"
        style={{
          paddingTop: "var(--cq-topnav-h, 56px)",
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
