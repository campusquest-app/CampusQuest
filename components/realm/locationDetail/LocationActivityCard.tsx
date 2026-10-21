"use client";

import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { EventArtwork } from "@/components/events/EventArtwork";
import { mapEventHostPresentation } from "@/lib/client/eventHostPresentation";
import type { MapEventPin } from "@/lib/mapLocationGroups";
import { getEventCountdownState, isEventCancelled } from "@/lib/realm/eventCountdown";
import { formatCampusEventRange } from "@/lib/realm/formatCampusEventWhen";

function categoryForEvent(event: MapEventPin, stateKind: string, cancelled: boolean): { label: string; tone: string } {
  if (cancelled) return { label: "CANCELLED", tone: "red" };
  const raw = event.category?.trim().toLowerCase() ?? "";
  if (raw.includes("tabl") || raw.includes("club")) {
    return { label: "CLUB TABLING", tone: "gold" };
  }
  if (raw.includes("deal") || raw.includes("promo") || raw.includes("discount")) {
    return { label: "DEAL", tone: "green" };
  }
  if (stateKind === "live") return { label: "LIVE", tone: "blue" };
  if (stateKind === "ended") return { label: "ENDED", tone: "muted" };
  if (raw) return { label: raw.slice(0, 24).toUpperCase(), tone: "blue" };
  return { label: "EVENT", tone: "blue" };
}

export function LocationActivityCard({
  event,
  now,
  locationName,
  highlighted = false,
  onOpen,
}: {
  event: MapEventPin;
  now: Date;
  locationName?: string | null;
  highlighted?: boolean;
  onOpen?: (event: MapEventPin) => void;
}) {
  const cancelled = isEventCancelled(event);
  const state = getEventCountdownState(event.startsAt, event.endsAt, now, cancelled);
  const category = categoryForEvent(event, state.kind, cancelled);
  const place = event.locationText?.trim() || locationName || null;
  const host = mapEventHostPresentation({
    organizationName: event.organizationName,
    source: event.source,
    organizationId: event.organizationId,
  });

  const inner = (
    <>
      <span className="cq-loc-activity-thumb" aria-hidden>
        <EventArtwork imageUrl={event.imageUrl} alt="" className="h-full w-full" />
      </span>

      <span className="cq-loc-activity-body">
        <span className={`cq-loc-activity-pill cq-loc-activity-pill--${category.tone}`}>
          {category.label}
        </span>
        <span className="cq-loc-activity-title">{event.title}</span>
        {host.hostedByLabel ? (
          <span className="cq-loc-activity-org" title={host.hostName ?? undefined}>
            Hosted by {host.compactHostName}
          </span>
        ) : null}
        <span className="cq-loc-activity-meta">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
          {formatCampusEventRange(event.startsAt, event.endsAt, now)}
        </span>
        {place ? (
          <span className="cq-loc-activity-meta">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{place}</span>
          </span>
        ) : null}
        {cancelled ? <span className="cq-loc-activity-warn">Cancelled</span> : null}
      </span>

      {onOpen ? (
        <ChevronRight className="cq-loc-activity-chevron h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden />
      ) : null}
    </>
  );

  const className = [
    "cq-loc-activity-card",
    "touch-manipulation",
    cancelled ? "cq-loc-activity-card--cancelled" : "",
    highlighted ? "cq-loc-activity-card--focused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(event)} className={className} aria-current={highlighted ? "true" : undefined}>
        {inner}
      </button>
    );
  }

  if (event.eventUrl) {
    return (
      <a href={event.eventUrl} target="_blank" rel="noopener noreferrer" className={className} aria-current={highlighted ? "true" : undefined}>
        {inner}
      </a>
    );
  }

  return (
    <article className={className} aria-current={highlighted ? "true" : undefined}>
      {inner}
    </article>
  );
}
