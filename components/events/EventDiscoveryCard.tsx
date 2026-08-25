"use client";

import { ExternalEventLocationDisplay } from "@/components/ExternalEventLocationDisplay";
import { formatEventDateTimeRange, eventDateTimeIso } from "@/lib/client/eventDateTime";
import { eventCardSummary } from "@/lib/client/eventDetailContent";
import { eventCardRecommendationReason } from "@/lib/client/eventDiscovery";
import { campusEventHostLabel, type FeedEvent } from "@/lib/client/eventFeedTypes";
import { isInterestedRsvp } from "@/lib/client/eventInterested";
import type { RecommendationScore } from "@/lib/recommendations/types";

export function EventDiscoveryCard({
  item,
  recommendation,
  interestedPending = false,
  onView,
  onToggleInterested,
}: {
  item: FeedEvent;
  recommendation: RecommendationScore | null;
  interestedPending?: boolean;
  onView: () => void;
  onToggleInterested?: () => void;
}) {
  const event = item.event;
  const when = formatEventDateTimeRange(event.startsAt, event.endsAt);
  const whenIso = eventDateTimeIso(event.startsAt);
  const reason = eventCardRecommendationReason(recommendation?.reason);
  const summary = eventCardSummary(event.description);
  const category = event.category?.trim() || null;
  const host = item.kind === "campus" ? campusEventHostLabel(item.event) : item.event.organizationName;
  const imageUrl = item.kind === "external" ? item.event.imageUrl : null;
  const interested = item.kind === "campus" && isInterestedRsvp(item.event.myRsvpStatus);

  return (
    <article className="cq-event-card">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`${event.title} flyer`}
          className="cq-event-card-thumb"
          loading="lazy"
        />
      ) : null}
      <div className="cq-event-card-body">
        {reason ? (
          <p className="cq-event-card-reason">
            <span className="cq-event-card-reason-mark" aria-hidden>
              ★
            </span>
            {reason}
          </p>
        ) : null}
        <h4 className="cq-event-card-title">{event.title}</h4>
        <p className="cq-event-card-when">
          <time dateTime={whenIso}>{when}</time>
        </p>
        {item.kind === "external" ? (
          <ExternalEventLocationDisplay
            venueName={item.event.venueName}
            address={item.event.address}
            location={item.event.location}
            compact
            className="cq-event-card-location"
          />
        ) : item.event.location ? (
          <p className="cq-event-card-location">{item.event.location}</p>
        ) : null}
        <p className="cq-event-card-meta">
          {[category, host].filter(Boolean).join(" · ")}
        </p>
        {summary ? <p className="cq-event-card-summary">{summary}</p> : null}
        <div className="cq-event-card-actions">
          {onToggleInterested ? (
            <button
              type="button"
              disabled={interestedPending}
              onClick={onToggleInterested}
              aria-pressed={interested}
              aria-label={interested ? `${event.title}, Interested, selected` : `Mark ${event.title} as Interested`}
              className={`cq-event-card-action ${interested ? "cq-event-card-action--on" : ""}`}
            >
              {interested ? "✓ Interested" : "Interested"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onView}
            className="cq-event-card-action cq-event-card-action--view"
            aria-label={`View ${event.title}`}
          >
            View
          </button>
        </div>
      </div>
    </article>
  );
}
