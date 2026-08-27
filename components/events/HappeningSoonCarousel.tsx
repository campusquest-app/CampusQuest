"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Clock, MapPin } from "lucide-react";
import { eventSourceChipLabel } from "@/lib/eventSources/catalog";
import {
  eventCardCategoryChip,
  eventCardDisplayTitle,
  eventCardFallbackAccent,
  eventCardPrimaryActionLabel,
  eventCardSportSubtitle,
  eventCardVenueLabel,
  eventShowOnRealmEligible,
  feedEventCanRsvp,
  feedEventSourceKey,
} from "@/lib/client/eventCardPresentation";
import { formatEventCardWhen, eventDateTimeIso } from "@/lib/client/eventDateTime";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { isInterestedRsvp } from "@/lib/client/eventInterested";
import type { RankedFeedEvent } from "@/lib/client/happeningSoon";

function EventImageFallback({
  accent,
  title,
}: {
  accent: string;
  title: string;
}) {
  return (
    <div className={`cq-event-fallback cq-event-fallback--${accent}`} aria-hidden>
      <span className="cq-event-fallback-mark">{title.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

function HappeningSoonCard({
  item,
  eager,
  onView,
  onViewOnMap,
  onToggleInterested,
  interestedPending,
}: {
  item: FeedEvent;
  eager?: boolean;
  onView: () => void;
  onViewOnMap?: () => void;
  onToggleInterested?: () => void;
  interestedPending?: boolean;
}) {
  const event = item.event;
  const title = eventCardDisplayTitle(item);
  const sport = eventCardSportSubtitle(item);
  const venue = eventCardVenueLabel(item);
  const when = formatEventCardWhen(event.startsAt);
  const whenIso = eventDateTimeIso(event.startsAt);
  const category = eventCardCategoryChip(item);
  const imageUrl = item.kind === "external" ? item.event.imageUrl : null;
  const mapped = eventShowOnRealmEligible(item) && Boolean(onViewOnMap);
  const interested =
    feedEventCanRsvp(item) &&
    ((item.kind === "campus" && isInterestedRsvp(item.event.myRsvpStatus)) ||
      (item.kind === "external" && isInterestedRsvp(item.event.myRsvpStatus ?? null)));
  const source = feedEventSourceKey(item);
  const sourceLabel = eventSourceChipLabel(source);
  const accent = eventCardFallbackAccent(item);

  return (
    <article className="cq-happening-card">
      <div className="cq-happening-card-media">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${title} event image`}
            className="cq-happening-card-image"
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <EventImageFallback accent={accent} title={title} />
        )}
        <div className="cq-happening-card-scrim" />
        <span className={`cq-happening-card-chip cq-happening-card-chip--${accent}`}>{category}</span>
        {onToggleInterested ? (
          <button
            type="button"
            className={`cq-happening-card-save ${interested ? "cq-happening-card-save--on" : ""}`}
            onClick={onToggleInterested}
            disabled={interestedPending}
            aria-pressed={interested}
            aria-label={interested ? `${title}, Interested, selected` : `Mark ${title} as Interested`}
          >
            <Bookmark className="h-4 w-4" strokeWidth={2.2} fill={interested ? "currentColor" : "none"} />
          </button>
        ) : null}
        <div className="cq-happening-card-copy">
          <h3 className="cq-happening-card-title">{title}</h3>
          {sport ? <p className="cq-happening-card-sport">{sport}</p> : null}
          <p className="cq-happening-card-meta">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <time dateTime={whenIso}>{when}</time>
          </p>
          {venue ? (
            <p className="cq-happening-card-meta">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              <span>{venue}</span>
            </p>
          ) : null}
          {sourceLabel && sourceLabel !== category ? (
            <span className="cq-happening-card-source">{sourceLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="cq-happening-card-actions">
        {mapped ? (
          <button type="button" className="cq-happening-card-action" onClick={onViewOnMap}>
            Show on Realm
          </button>
        ) : null}
        <button
          type="button"
          className="cq-happening-card-action cq-happening-card-action--primary"
          onClick={onView}
          aria-label={`${eventCardPrimaryActionLabel(item)} ${title}`}
        >
          {eventCardPrimaryActionLabel(item)}
        </button>
      </div>
    </article>
  );
}

export function HappeningSoonCarousel({
  rows,
  rsvpingId,
  onView,
  onViewOnMap,
  onToggleInterested,
}: {
  rows: RankedFeedEvent[];
  rsvpingId: string | null;
  onView: (item: FeedEvent) => void;
  onViewOnMap?: (eventId: string) => void;
  onToggleInterested?: (item: FeedEvent) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const syncIndex = useCallback(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const cards = Array.from(root.children) as HTMLElement[];
    if (cards.length === 0) return;
    const left = root.scrollLeft + root.clientWidth * 0.2;
    let closest = 0;
    let closestDist = Number.POSITIVE_INFINITY;
    cards.forEach((card, cardIndex) => {
      const dist = Math.abs(card.offsetLeft - left);
      if (dist < closestDist) {
        closest = cardIndex;
        closestDist = dist;
      }
    });
    setIndex(closest);
  }, []);

  const rowIds = rows.map((row) => row.item.event.id).join("|");
  useEffect(() => {
    setIndex(0);
    scrollerRef.current?.scrollTo({ left: 0 });
  }, [rowIds]);

  if (rows.length === 0) return null;

  return (
    <section className="cq-happening-soon" aria-labelledby="cq-happening-soon-title">
      <div className="cq-events-section-head">
        <div>
          <h2 id="cq-happening-soon-title" className="cq-events-section-title">
            ⚡ Happening Soon
          </h2>
          <p className="cq-events-section-sub">Can’t-miss events coming up.</p>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="cq-happening-soon-scroller"
        data-cq-horizontal-scroll="true"
        data-cq-gesture-block="swipe-tab"
        onScroll={syncIndex}
      >
        {rows.map((row, rowIndex) => (
          <div key={`${row.item.kind}-${row.item.event.id}`} className="cq-happening-soon-slide">
            <HappeningSoonCard
              item={row.item}
              eager={rowIndex === 0}
              onView={() => onView(row.item)}
              onViewOnMap={
                onViewOnMap && eventShowOnRealmEligible(row.item)
                  ? () => onViewOnMap(row.item.event.id)
                  : undefined
              }
              onToggleInterested={
                onToggleInterested && feedEventCanRsvp(row.item)
                  ? () => onToggleInterested(row.item)
                  : undefined
              }
              interestedPending={rsvpingId === row.item.event.id}
            />
          </div>
        ))}
      </div>
      {rows.length > 1 ? (
        <div className="cq-happening-soon-dots" role="tablist" aria-label="Happening Soon slides">
          {rows.map((row, rowIndex) => (
            <button
              key={`${row.item.event.id}-dot`}
              type="button"
              role="tab"
              aria-selected={index === rowIndex}
              aria-label={`Show event ${rowIndex + 1} of ${rows.length}`}
              className={`cq-happening-soon-dot ${index === rowIndex ? "cq-happening-soon-dot--on" : ""}`}
              onClick={() => {
                const root = scrollerRef.current;
                const card = root?.children[rowIndex] as HTMLElement | undefined;
                card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
