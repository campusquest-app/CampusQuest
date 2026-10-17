"use client";

import { Heart } from "lucide-react";
import { EventArtwork } from "@/components/events/EventArtwork";
import { eventSourceChipLabel } from "@/lib/eventSources/catalog";
import {
  eventCardCategoryChip,
  eventCardDisplayTitle,
  eventCardFallbackAccent,
  eventCardSportSubtitle,
  eventCardVenueLabel,
  eventShowOnRealmEligible,
  feedEventCanRsvp,
  feedEventIsAthletics,
  feedEventSourceKey,
  isEventLive,
} from "@/lib/client/eventCardPresentation";
import { formatEventCardWhen, formatEventDateTimeRange, eventDateTimeIso } from "@/lib/client/eventDateTime";
import { useLiveNow } from "@/lib/client/useLiveNow";
import { eventCardRecommendationReason } from "@/lib/client/eventDiscovery";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { isInterestedRsvp } from "@/lib/client/eventInterested";
import type { RecommendationScore } from "@/lib/recommendations/types";

export function EventDiscoveryCard({
  item,
  recommendation,
  interestedPending = false,
  onView,
  onToggleInterested,
  onViewOnMap,
  onRsvpGoing,
}: {
  item: FeedEvent;
  recommendation: RecommendationScore | null;
  interestedPending?: boolean;
  onView: () => void;
  onToggleInterested?: () => void;
  onViewOnMap?: () => void;
  onRsvpGoing?: () => void;
}) {
  const event = item.event;
  const title = eventCardDisplayTitle(item);
  const when = formatEventCardWhen(event.startsAt);
  const whenRange = formatEventDateTimeRange(event.startsAt, event.endsAt);
  const whenIso = eventDateTimeIso(event.startsAt);
  const reason = eventCardRecommendationReason(recommendation?.reason);
  const category = eventCardCategoryChip(item);
  const sport = eventCardSportSubtitle(item);
  const venue = eventCardVenueLabel(item);
  const interested =
    feedEventCanRsvp(item) &&
    ((item.kind === "campus" && isInterestedRsvp(item.event.myRsvpStatus)) ||
      (item.kind === "external" && isInterestedRsvp(item.event.myRsvpStatus ?? null)));
  const going =
    (item.kind === "campus" && item.event.myRsvpStatus === "going") ||
    (item.kind === "external" && item.event.myRsvpStatus === "going");
  const source = feedEventSourceKey(item);
  const sourceLabel = eventSourceChipLabel(source);
  const accent = eventCardFallbackAccent(item);
  const now = useLiveNow();
  const showOnRealm = Boolean(onViewOnMap) && eventShowOnRealmEligible(item) && isEventLive(item, now);
  const athletics = feedEventIsAthletics(item);
  const canRsvp = feedEventCanRsvp(item);

  return (
    <article className="cq-event-card cq-event-card--row">
      <div className="cq-event-card-thumb-wrap cq-event-card-thumb-wrap--photo">
        <EventArtwork
          imageUrl={item.kind === "external" ? item.event.imageUrl : null}
          bannerUrl={item.kind === "external" ? item.event.bannerUrl : null}
          alt={`${title} event image`}
          className="cq-event-card-thumb"
        />
      </div>
      <div className="cq-event-card-body">
        <p className={`cq-event-card-chip cq-event-card-chip--${accent}`}>{category}</p>
        <h4 className="cq-event-card-title">{title}</h4>
        {sport ? <p className="cq-event-card-sport">{sport}</p> : null}
        <p className="cq-event-card-when">
          <time dateTime={whenIso}>{when}</time>
        </p>
        <span className="sr-only">{whenRange}</span>
        {venue ? <p className="cq-event-card-location">{venue}</p> : null}
        {sourceLabel && sourceLabel !== category ? (
          <span className="cq-event-card-source">{sourceLabel}</span>
        ) : null}
        <div className="cq-event-card-actions">
          {showOnRealm ? (
            <button type="button" onClick={onViewOnMap} className="cq-event-card-action">
              Show on Realm
            </button>
          ) : null}
          <button
            type="button"
            onClick={onView}
            className="cq-event-card-action cq-event-card-action--view"
            aria-label={`${athletics ? "View Game" : "View Event"} ${title}`}
          >
            {athletics ? "View Game" : "View Event"}
          </button>
          {canRsvp && onRsvpGoing && !athletics ? (
            <button
              type="button"
              onClick={onRsvpGoing}
              aria-pressed={going}
              className={`cq-event-card-action cq-event-card-action--rsvp cq-event-card-action--rsvp-${accent} ${going ? "cq-event-card-action--on" : ""}`}
            >
              {going ? "Going" : "RSVP"}
            </button>
          ) : null}
        </div>
        <div className="cq-event-card-footer">
          {reason ? (
            <p className="cq-event-card-reason">
              <span className="cq-event-card-reason-mark" aria-hidden>
                ☆
              </span>
              {reason}
            </p>
          ) : (
            <span />
          )}
          {onToggleInterested ? (
            <button
              type="button"
              disabled={interestedPending}
              onClick={onToggleInterested}
              aria-pressed={interested}
              aria-label={interested ? `${title}, Interested, selected` : `Mark ${title} as Interested`}
              className={`cq-event-card-heart ${interested ? "cq-event-card-heart--on" : ""}`}
            >
              <Heart className="h-4 w-4" strokeWidth={2.2} fill={interested ? "currentColor" : "none"} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
