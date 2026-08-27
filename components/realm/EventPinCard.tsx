"use client";

import { memo } from "react";
import { eventSourceLabel } from "@/lib/eventSources/catalog";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import {
  formatCampusTime,
  getEventCountdownState,
  isEventCancelled,
  type EventCountdownState,
} from "@/lib/realm/eventCountdown";

function badgeText(state: EventCountdownState): string {
  switch (state.kind) {
    case "cancelled":
      return "CANCELLED";
    case "live":
      return "LIVE NOW";
    case "imminent":
      return "STARTING NOW";
    case "hurry":
    case "closing":
    case "soon":
      return state.label;
    case "ended":
      return "Ended";
    default:
      return "Today";
  }
}

/**
 * Event card for the Realm location sheet. Handles cancelled (muted + red
 * warning), live/starting-soon badges, URInvolved source metadata, and the
 * View Event link. `compact` renders the mini carousel tile.
 */
export const EventPinCard = memo(function EventPinCard({
  event,
  now,
  locationName,
  compact = false,
}: {
  event: MapEventPin;
  now: Date;
  locationName?: string | null;
  compact?: boolean;
}) {
  const cancelled = isEventCancelled(event);
  const state = getEventCountdownState(event.startsAt, event.endsAt, now, cancelled);
  const sourceLabel = eventSourceLabel(event.source);
  const time = formatCampusTime(event.startsAt);
  const location = event.locationText ?? locationName ?? null;

  const rootClass = [
    compact ? "cq-event-pin-card cq-event-pin-card--compact" : "cq-event-pin-card",
    cancelled ? "cq-event-pin-card--cancelled" : "",
    state.kind === "live" ? "cq-event-pin-card--live" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={rootClass}>
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt=""
          loading="lazy"
          className="cq-event-pin-card-image"
          aria-hidden
        />
      ) : null}
      <div className="cq-event-pin-card-body">
        <div className="cq-event-pin-card-toprow">
          <span className={`cq-event-pin-badge cq-event-pin-badge--${state.kind}`}>
            {badgeText(state)}
          </span>
          {event.category && !compact ? (
            <span className="cq-event-pin-category">{event.category}</span>
          ) : null}
        </div>
        <h4 className="cq-event-pin-card-title">{event.title}</h4>
        <p className="cq-event-pin-card-meta">
          <span>{time}</span>
          {location ? <span> · {location}</span> : null}
        </p>
        {!compact && event.organizationName ? (
          <p className="cq-event-pin-card-org">{event.organizationName}</p>
        ) : null}
        {!compact && sourceLabel && event.source && event.source !== "campusquest" ? (
          <p className="cq-event-pin-card-source">{sourceLabel}</p>
        ) : null}
        {cancelled ? (
          <p className="cq-event-pin-card-warning">This event has been cancelled.</p>
        ) : null}
        {event.eventUrl ? (
          <a
            href={event.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cq-event-pin-card-cta"
          >
            View Event
          </a>
        ) : null}
      </div>
    </article>
  );
});
