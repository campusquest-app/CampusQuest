"use client";

import { ChevronRight, Megaphone } from "lucide-react";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import { getEventCountdownState, isEventCancelled } from "@/lib/realm/eventCountdown";
import { formatCampusEventWhen } from "@/lib/realm/formatCampusEventWhen";

export function pickFeaturedEvent(events: MapEventPin[], now: Date): MapEventPin | null {
  if (events.length === 0) return null;

  const scored = events
    .filter((event) => !isEventCancelled(event))
    .map((event) => {
      const state = getEventCountdownState(event.startsAt, event.endsAt, now, false);
      let score = 4;
      if (state.kind === "live") score = 0;
      else if (state.kind === "imminent" || state.kind === "hurry") score = 1;
      else if (state.kind === "closing" || state.kind === "soon") score = 2;
      else if (state.kind === "upcoming") score = 3;
      else if (state.kind === "ended") score = 9;
      return { event, score, start: Date.parse(event.startsAt) || Number.POSITIVE_INFINITY };
    })
    .filter((row) => row.score < 9)
    .sort((a, b) => a.score - b.score || a.start - b.start);

  return scored[0]?.event ?? null;
}

export function LocationUpcomingHighlight({
  event,
  now,
}: {
  event: MapEventPin;
  now: Date;
}) {
  const state = getEventCountdownState(event.startsAt, event.endsAt, now, isEventCancelled(event));
  const eyebrow =
    state.kind === "live"
      ? "Happening right now"
      : state.kind === "imminent" || state.kind === "hurry" || state.kind === "closing"
        ? "Starting soon"
        : "Something cool coming up!";

  const body = (
    <>
      <span className="cq-loc-highlight-icon" aria-hidden>
        <Megaphone className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <span className="cq-loc-highlight-copy">
        <span className="cq-loc-highlight-eyebrow">{eyebrow}</span>
        <span className="cq-loc-highlight-title">{event.title}</span>
        {event.organizationName ? (
          <span className="cq-loc-highlight-org">{event.organizationName}</span>
        ) : null}
        <span className="cq-loc-highlight-when">{formatCampusEventWhen(event.startsAt, now)}</span>
      </span>
      {event.eventUrl ? (
        <span className="cq-loc-highlight-cta">
          View Event
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
        </span>
      ) : null}
    </>
  );

  if (event.eventUrl) {
    return (
      <a
        href={event.eventUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="cq-loc-highlight touch-manipulation"
      >
        {body}
      </a>
    );
  }

  return <div className="cq-loc-highlight">{body}</div>;
}
