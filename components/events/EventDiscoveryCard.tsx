"use client";

import { useState } from "react";
import { Heart, Sparkles } from "lucide-react";
import { EventArtwork } from "@/components/events/EventArtwork";
import {
  eventCardDisplayTitle,
  eventCardVenueLabel,
  feedEventCanRsvp,
  feedEventIsAthletics,
  isEventLive,
} from "@/lib/client/eventCardPresentation";
import { eventArtworkFallbackBrand, resolveEventArtwork } from "@/lib/client/eventArtwork";
import { resolveEventArtworkFit, type EventArtworkFit } from "@/lib/client/eventArtworkFit";
import {
  eventDateTimeIso,
  formatEventCardStatusBadge,
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
  priority = false,
  onView,
  onToggleInterested,
}: {
  item: FeedEvent;
  recommendation: RecommendationScore | null;
  interestedPending?: boolean;
  /** Eager-load artwork for above-the-fold grid cells. */
  priority?: boolean;
  onView: () => void;
  onToggleInterested?: () => void;
  /** Kept for call-site compatibility; detail screen owns map / RSVP actions. */
  onViewOnMap?: () => void;
  onRsvpGoing?: () => void;
}) {
  const event = item.event;
  const title = eventCardDisplayTitle(item);
  const whenRange = formatEventDateTimeRange(event.startsAt, event.endsAt);
  const whenIso = eventDateTimeIso(event.startsAt);
  const reason = eventInterestMatchLabel(recommendation);
  const venue = eventCardVenueLabel(item);
  const interested =
    feedEventCanRsvp(item) &&
    ((item.kind === "campus" && isInterestedRsvp(item.event.myRsvpStatus)) ||
      (item.kind === "external" && isInterestedRsvp(item.event.myRsvpStatus ?? null)));
  const now = useLiveNow();
  const live = isEventLive(item, now);
  const statusBadge = formatEventCardStatusBadge(event.startsAt, event.endsAt, now, { live });
  const athletics = feedEventIsAthletics(item);
  const viewLabel = athletics ? "View Game" : "View Event";
  const source =
    item.kind === "external" ? item.event.source : item.event.sourceType ?? item.event.source;
  const sport = item.kind === "external" ? item.event.sport : null;
  const fallbackBrand = eventArtworkFallbackBrand({
    kind: item.kind,
    source,
    sport,
  });
  const artworkKind = resolveEventArtwork({
    imageUrl: item.kind === "external" ? item.event.imageUrl : null,
    bannerUrl: item.kind === "external" ? item.event.bannerUrl : null,
    fallbackBrand,
  }).kind;
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const fit: EventArtworkFit = resolveEventArtworkFit({
    artworkKind,
    source,
    sport,
    naturalAspect,
  });

  return (
    <article
      className="cq-event-card cq-event-card--grid cq-event-card--immersive"
      role="link"
      tabIndex={0}
      aria-label={`${viewLabel}: ${title}. ${whenRange}${venue ? `. ${venue}` : ""}`}
      data-cq-event-fit={fit}
      onClick={onView}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView();
        }
      }}
    >
      <div className="cq-event-card-media" data-cq-event-fit={fit}>
        <EventArtwork
          imageUrl={item.kind === "external" ? item.event.imageUrl : null}
          bannerUrl={item.kind === "external" ? item.event.bannerUrl : null}
          alt=""
          className="cq-event-card-thumb"
          loading={priority ? "eager" : "lazy"}
          fallbackBrand={fallbackBrand}
          fit={fit}
          showBlurFill={fit === "contain"}
          onNaturalAspect={setNaturalAspect}
        />

        {statusBadge ? (
          <span
            className={`cq-event-card-badge${live ? " cq-event-card-badge--live" : ""}`}
            data-cq-event-status={live ? "live" : "upcoming"}
          >
            {statusBadge}
          </span>
        ) : null}

        {reason ? (
          <span className="cq-event-card-match" title={reason} aria-label={reason}>
            <Sparkles className="cq-event-card-match-mark" aria-hidden />
          </span>
        ) : null}

        {onToggleInterested ? (
          <button
            type="button"
            disabled={interestedPending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleInterested();
            }}
            aria-pressed={interested}
            aria-label={interested ? `${title}, Interested, selected` : `Mark ${title} as Interested`}
            className={`cq-event-card-heart ${interested ? "cq-event-card-heart--on" : ""}`}
          >
            <Heart className="h-4 w-4" strokeWidth={2.2} fill={interested ? "currentColor" : "none"} />
          </button>
        ) : null}
      </div>

      <div className="cq-event-card-copy">
        <h4 className="cq-event-card-title">{title}</h4>
        {venue ? <p className="cq-event-card-location">{venue}</p> : null}
      </div>

      <time className="sr-only" dateTime={whenIso}>
        {whenRange}
      </time>
    </article>
  );
}
