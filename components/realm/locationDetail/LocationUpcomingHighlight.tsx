"use client";

import { ChevronRight, Megaphone } from "lucide-react";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import { getEventCountdownState, isEventCancelled } from "@/lib/realm/eventCountdown";
import { formatCampusEventWhen } from "@/lib/realm/formatCampusEventWhen";

function eventPinMatchesFocusId(event: MapEventPin, focusedEventId: string | null | undefined): boolean {
  const needle = focusedEventId?.trim().toLowerCase();
  if (!needle) return false;
  return [event.id, event.externalEventId, event.sourceExternalId].some(
    (id) => typeof id === "string" && id.toLowerCase() === needle,
  );
}

export function pickFeaturedEvent(
  events: MapEventPin[],
  now: Date,
  focusedEventId?: string | null,
): MapEventPin | null {
  if (events.length === 0) return null;

  const preferred = events.find(
    (event) => eventPinMatchesFocusId(event, focusedEventId) && !isEventCancelled(event),
  );
  if (preferred) return preferred;

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

/** Prefer the student-selected event at the top of a venue's upcoming list. */
export function orderEventsForFocusedSelection(
  events: MapEventPin[],
  focusedEventId?: string | null,
): MapEventPin[] {
  if (!focusedEventId || events.length < 2) return events;
  const index = events.findIndex((event) => eventPinMatchesFocusId(event, focusedEventId));
  if (index <= 0) return events;
  const next = events.slice();
  const [selected] = next.splice(index, 1);
  return [selected, ...next];
}

export function isFocusedMapEvent(event: MapEventPin, focusedEventId?: string | null): boolean {
  return eventPinMatchesFocusId(event, focusedEventId);
}

export function LocationUpcomingHighlight({
  event,
  now,
  onOpen,
}: {
  event: MapEventPin;
  now: Date;
  onOpen?: (event: MapEventPin) => void;
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

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(event)} className="cq-loc-highlight touch-manipulation">
        {body}
      </button>
    );
  }

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
