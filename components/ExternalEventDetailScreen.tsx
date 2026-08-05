"use client";

import { ChevronLeft } from "lucide-react";
import { ExternalEventLocationDetail } from "@/components/ExternalEventLocationDisplay";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { TaggedEntityPostsSection } from "@/components/quad/TaggedEntityPostsSection";

export type ExternalEventDetailData = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string | null;
  venueName: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  organizationName: string | null;
  imageUrl: string | null;
  eventUrl: string | null;
  tags: string[];
};

function formatExternalEventDateTime(startsAt: string | null): { date: string; time: string } {
  if (!startsAt) return { date: "Date TBA", time: "" };
  const start = new Date(startsAt);
  return {
    date: start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
    time: start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

export function ExternalEventDetailScreen({
  event,
  onBack,
  backLabel = "Events",
}: {
  event: ExternalEventDetailData;
  onBack: () => void;
  backLabel?: string;
}) {
  const { date, time } = formatExternalEventDateTime(event.startsAt);

  return (
    <MobileSwipeBackSurface
      onBack={onBack}
      className="cq-external-event-detail fixed inset-x-0 z-40 overflow-y-auto bg-uri-navy"
      style={{
        top: "var(--cq-topnav-h, 56px)",
        bottom: "calc(var(--cq-bottom-nav-h, 5.75rem) + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-uri-navy/95 px-3 py-2.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-xl border border-white/20 px-2.5 py-2 text-white/85 transition hover:bg-white/10 hover:text-white active:scale-[0.98] touch-manipulation"
            aria-label={`Back to ${backLabel}`}
          >
            <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
            <span className="text-sm font-semibold">{backLabel}</span>
          </button>
        </header>

        {event.imageUrl ? (
          <div className="cq-external-event-detail__banner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.imageUrl} alt="" className="h-52 w-full object-cover sm:h-60" />
          </div>
        ) : null}

        <div className="flex-1 space-y-5 px-4 py-5 sm:px-5">
          <div className="space-y-3">
            <h1 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl">{event.title}</h1>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-white/80">{date}</p>
              {time ? <p className="text-sm text-white/60">{time}</p> : null}
            </div>
          </div>

          <ExternalEventLocationDetail
            venueName={event.venueName}
            address={event.address}
            location={event.location}
          />

          {event.organizationName ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Organization</p>
              <p className="text-sm text-white/85">{event.organizationName}</p>
            </div>
          ) : null}

          {event.description ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Description</p>
              <p className="text-sm leading-relaxed text-white/75 whitespace-pre-wrap">{event.description}</p>
            </div>
          ) : null}

          {event.category || event.tags.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/55">Tags</p>
              <div className="flex flex-wrap gap-2">
                {event.category ? (
                  <span className="rounded-full border border-uri-keaney/35 px-2.5 py-0.5 text-[11px] font-semibold text-uri-keaney">
                    {event.category}
                  </span>
                ) : null}
                {event.tags
                  .filter((tag) => tag !== event.category)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/65"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            </div>
          ) : null}

          <TaggedEntityPostsSection
            entityType="external_event"
            entityId={event.id}
            title="Campus activity"
          />

          <p className="text-xs text-cyan-200/80">Source: URInvolved</p>
        </div>

        {event.eventUrl ? (
          <footer className="sticky bottom-0 border-t border-white/10 bg-uri-navy/95 px-4 py-3 backdrop-blur-sm">
            <a
              href={event.eventUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-full rounded-xl border border-cyan-400/35 px-4 py-3 text-center text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/10"
            >
              View on URInvolved
            </a>
          </footer>
        ) : null}
      </div>
    </MobileSwipeBackSurface>
  );
}
