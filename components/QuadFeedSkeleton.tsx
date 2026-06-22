"use client";

const SKELETON_POST_COUNT = 4;

function QuadFeedPostSkeleton({ showMedia = true }: { showMedia?: boolean }) {
  return (
    <article className="cq-feed-post border-b border-white/[0.08]">
      <div className="cq-feed-post-header flex items-center gap-3 px-4 py-3">
        <div className="cq-skeleton h-11 w-11 shrink-0 rounded-full" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="cq-skeleton h-3.5 w-36 max-w-[70%] rounded" aria-hidden />
          <div className="cq-skeleton h-3 w-24 max-w-[50%] rounded" aria-hidden />
        </div>
      </div>

      {showMedia ? (
        <div className="quad-feed-media-wrap" aria-hidden>
          <div className="cq-skeleton aspect-[4/5] max-h-[min(72vh,520px)] w-full rounded-none" />
        </div>
      ) : null}

      <div className="space-y-2 px-4 py-3">
        <div className="cq-skeleton h-3.5 w-full rounded" aria-hidden />
        <div className="cq-skeleton h-3.5 w-[92%] max-w-full rounded" aria-hidden />
        <div className="mt-3 flex gap-3">
          <div className="cq-skeleton h-8 w-14 rounded-lg" aria-hidden />
          <div className="cq-skeleton h-8 w-14 rounded-lg" aria-hidden />
          <div className="cq-skeleton h-8 w-14 rounded-lg" aria-hidden />
        </div>
      </div>
    </article>
  );
}

export function QuadFeedSkeleton({ label = "Loading The Quad…" }: { label?: string }) {
  return (
    <div className="cq-quad-feed-stream cq-skeleton-wrap" aria-busy="true" aria-live="polite">
      <p className="px-4 py-3 text-center text-sm font-medium text-white/55">{label}</p>
      <span className="sr-only">{label}</span>
      {Array.from({ length: SKELETON_POST_COUNT }, (_, index) => (
        <QuadFeedPostSkeleton key={index} showMedia={index % 3 !== 2} />
      ))}
    </div>
  );
}
