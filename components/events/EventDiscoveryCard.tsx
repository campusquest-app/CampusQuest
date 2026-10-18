"use client";

import { Heart, Sparkles, Users } from "lucide-react";
import { EventArtwork } from "@/components/events/EventArtwork";
import {
  eventCardAttendeeCount,
  eventCardDisplayTitle,
  eventCardPrimaryActionLabel,
  eventCardVenueLabel,
  feedEventCanRsvp,
} from "@/lib/client/eventCardPresentation";
import {
  eventCardStatusBadge,
  eventDateTimeIso,
  formatEventCardWhen,
  formatEventDateTimeRange,
} from "@/lib/client/eventDateTime";
import { useLiveNow } from "@/lib/client/useLiveNow";
import { eventInterestMatchLabel } from "@/lib/client/eventDiscovery";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { isInterestedRsvp } from "@/lib/client/eventInterested";
import type { RecommendationScore } from "@/lib/recommendations/types";

export function EventDiscoveryCard({
  item,
  recommendation,
  interestedPending = false,
  imagePriority = false,
  onView,
  onToggleInterested,
}: {
  item: FeedEvent;
  recommendation: RecommendationScore | null;
  interestedPending?: boolean;
  /** Eager-load artwork for above-the-fold cards. */
  imagePriority?: boolean;
  onView: () => void;
  onToggleInterested?: () => void;
  /** Kept for call-site compatibility; map/RSVP live on the detail screen. */
  onViewOnMap?: () => void;
  onRsvpGoing?: () => void;
}) {
  const event = item.event;
  const title = eventCardDisplayTitle(item);
  const when = formatEventCardWhen(event.startsAt);
  const whenRange = formatEventDateTimeRange(event.startsAt, event.endsAt);
  const whenIso = eventDateTimeIso(event.startsAt);
  const venue = eventCardVenueLabel(item);
  const interestMatch = eventInterestMatchLabel(recommendation);
  const attendees = eventCardAttendeeCount(item);
  const openLabel = eventCardPrimaryActionLabel(item);
  const interested =
    feedEventCanRsvp(item) &&
    ((item.kind === "campus" && isInterestedRsvp(item.event.myRsvpStatus)) ||
      (item.kind === "external" && isInterestedRsvp(item.event.myRsvpStatus ?? null)));
  const now = useLiveNow();
  const status = eventCardStatusBadge(event.startsAt, event.endsAt, now);

  return (
    <article className="cq-event-card cq-event-card--grid" data-cq-event-card="grid">
      <button
        type="button"
        className="cq-event-card-hit touch-manipulation"
        onClick={onView}
        aria-label={`${openLabel}: ${title}`}
      >
        <div className="cq-event-card-media">
          <EventArtwork
            imageUrl={item.kind === "external" ? item.event.imageUrl : null}
            bannerUrl={item.kind === "external" ? item.event.bannerUrl : null}
            alt=""
            className="cq-event-card-thumb"
            loading={imagePriority ? "eager" : "lazy"}
          />
          {status ? (
            <span
              className={`cq-event-card-badge cq-event-card-badge--${status.tone}`}
              data-cq-event-status={status.tone}
            >
              {status.label}
            </span>
          ) : null}
          {interestMatch ? (
            <span className="cq-event-card-spark" title={interestMatch} aria-label={interestMatch}>
              <Sparkles className="h-3 w-3" strokeWidth={2.4} aria-hidden />
            </span>
          ) : null}
        </div>

        <div className="cq-event-card-body">
          <h4 className="cq-event-card-title">{title}</h4>
          <p className="cq-event-card-when">
            <time dateTime={whenIso}>{when}</time>
          </p>
          <span className="sr-only">{whenRange}</span>
          {venue ? <p className="cq-event-card-location">{venue}</p> : null}
          {attendees != null ? (
            <p className="cq-event-card-attendees">
              <Users className="cq-event-card-attendees-icon" strokeWidth={2.2} aria-hidden />
              <span>{attendees} going</span>
            </p>
          ) : null}
        </div>
      </button>

      {onToggleInterested ? (
        <button
          type="button"
          disabled={interestedPending}
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onToggleInterested();
          }}
          aria-pressed={interested}
          aria-label={interested ? `${title}, Interested, selected` : `Mark ${title} as Interested`}
          className={`cq-event-card-heart touch-manipulation ${interested ? "cq-event-card-heart--on" : ""}`}
        >
          <Heart className="h-4 w-4" strokeWidth={2.2} fill={interested ? "currentColor" : "none"} />
        </button>
      ) : null}
    </article>
  );
}
