"use client";

/**
 * Shown while session token exists but profile+stats hydration is still in flight.
 * Mirrors main layout (header strip + bottom nav) so the app feels instant.
 */
export function DashboardBootstrapShellSkeleton() {
  const navPlaceholders = ["Quad", "Events", "Orgs", "Friends", "Battle", "Rank", "Character"];
  return (
    <div className="min-h-[70vh] flex flex-col" aria-busy="true" aria-label="Loading your profile">
      <header
        className="sticky top-0 z-10 -mx-4 -mt-4 mb-4 sm:mb-5"
        style={{
          background: "linear-gradient(180deg, rgba(4, 30, 66, 0.98) 0%, rgba(3, 22, 48, 0.97) 100%)",
          boxShadow: "0 1px 0 0 rgba(104, 171, 232, 0.15), 0 4px 20px -4px rgba(0,0,0,0.4)",
        }}
      >
        <div className="backdrop-blur-sm border-b border-white/[0.08] px-4 py-3 sm:py-3.5">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="cq-skeleton w-9 h-9 rounded-xl flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="cq-skeleton h-4 rounded-lg w-32" />
              <div className="cq-skeleton h-3 rounded-lg w-24" />
            </div>
          </div>
        </div>
      </header>

      <div style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="space-y-4 cq-skeleton-wrap">
          <div className="cq-skeleton h-44 rounded-2xl w-full max-w-xl mx-auto" />
          <div className="card p-5 space-y-3">
            <div className="cq-skeleton h-4 rounded w-2/5" />
            <div className="cq-skeleton h-3 rounded w-full" />
            <div className="cq-skeleton h-3 rounded w-11/12" />
          </div>
          <div className="card p-4 space-y-2">
            <div className="cq-skeleton h-4 rounded w-1/3" />
            <div className="cq-skeleton h-11 rounded-xl" />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 flex justify-center px-3 sm:px-4">
        <nav
          className="w-full max-w-2xl flex items-stretch justify-evenly gap-0.5 sm:gap-1 rounded-t-2xl border border-b-0 border-uri-keaney/25 bg-uri-navy/95 px-1.5 pt-2 sm:px-3 sm:pt-2.5 backdrop-blur-md"
          style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom, 0px))" }}
          aria-hidden
        >
          {navPlaceholders.map((label) => (
            <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 px-1">
              <div className="cq-skeleton w-7 h-7 rounded-lg" />
              <div className="cq-skeleton h-2.5 w-10 rounded" />
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
