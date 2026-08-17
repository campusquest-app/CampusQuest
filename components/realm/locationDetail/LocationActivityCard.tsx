"use client";

import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import { getEventCountdownState, isEventCancelled } from "@/lib/realm/eventCountdown";
import { formatCampusEventWhen } from "@/lib/realm/formatCampusEventWhen";

function categoryForEvent(event: MapEventPin, stateKind: string): { label: string; tone: string } {
  const raw = event.category?.trim().toLowerCase() ?? "";
  if (raw.includes("tabl") || raw.includes("club")) {
    return { label: "CLUB TABLING", tone: "gold" };
  }
  if (raw.includes("deal") || raw.includes("promo") || raw.includes("discount")) {
    return { label: "DEAL", tone: "green" };
  }
  if (stateKind === "live") return { label: "LIVE", tone: "blue" };
  return { label: "EVENT", tone: "blue" };
}

export function LocationActivityCard({
  event,
  now,
  locationName,
}: {
  event: MapEventPin;
  now: Date;
  locationName?: string | null;
}) {
  const cancelled = isEventCancelled(event);
  const state = getEventCountdownState(event.startsAt, event.endsAt, now, cancelled);
  const category = categoryForEvent(event, state.kind);
  const place = event.locationText?.trim() || locationName || null;

  const inner = (
    <>
      <span className="cq-loc-activity-thumb" aria-hidden>
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="cq-loc-activity-thumb-fallback">{event.title.slice(0, 1).toUpperCase()}</span>
        )}
      </span>

      <span className="cq-loc-activity-body">
        <span className={`cq-loc-activity-pill cq-loc-activity-pill--${category.tone}`}>
          {category.label}
        </span>
        <span className="cq-loc-activity-title">{event.title}</span>
        <span className="cq-loc-activity-meta">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
          {formatCampusEventWhen(event.startsAt, now)}
        </span>
        {place ? (
          <span className="cq-loc-activity-meta">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{place}</span>
          </span>
        ) : null}
        {cancelled ? <span className="cq-loc-activity-warn">Cancelled</span> : null}
      </span>

      <ChevronRight className="cq-loc-activity-chevron h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden />
    </>
  );

  if (event.eventUrl) {
    return (
      <a
        href={event.eventUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`cq-loc-activity-card touch-manipulation${cancelled ? " cq-loc-activity-card--cancelled" : ""}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <article
      className={`cq-loc-activity-card${cancelled ? " cq-loc-activity-card--cancelled" : ""}`}
    >
      {inner}
    </article>
  );
}
