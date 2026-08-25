"use client";

import { useState } from "react";
import { CalendarPlus, ChevronLeft, ExternalLink, MapPin, Share2, X } from "lucide-react";
import { ExternalEventLocationDetail } from "@/components/ExternalEventLocationDisplay";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { TaggedEntityPostsSection } from "@/components/quad/TaggedEntityPostsSection";
import { ScreenDataState } from "@/components/ui/ScreenDataState";
import { downloadEventIcs } from "@/lib/client/eventCalendar";
import { eventDateTimeIso, formatEventDateTimeRange } from "@/lib/client/eventDateTime";
import {
  eventDescriptionParagraphs,
  extractEventKeyFacts,
  extractWhatToExpect,
} from "@/lib/client/eventDetailContent";
import { eventCardRecommendationReason, eventHasMappedLocation, eventShareText } from "@/lib/client/eventDiscovery";
import { campusEventHostLabel, type FeedEvent } from "@/lib/client/eventFeedTypes";
import { isInterestedRsvp } from "@/lib/client/eventInterested";
import { nativeShare, openExternalUrl } from "@/lib/client/capacitorNative";
import type { RecommendationScore } from "@/lib/recommendations/types";

export function EventDetailScreen({
  item,
  recommendation,
  error,
  interestedPending = false,
  onBack,
  onRetry,
  onToggleInterested,
  onViewOnMap,
  onWalkHere,
  onOpenOrganization,
  onRsvpGoing,
}: {
  item: FeedEvent;
  recommendation?: RecommendationScore | null;
  error?: string | null;
  interestedPending?: boolean;
  onBack: () => void;
  onRetry?: () => void;
  onToggleInterested?: () => void;
  onViewOnMap?: () => void;
  onWalkHere?: () => void;
  onOpenOrganization?: (organizationId: string) => void;
  onRsvpGoing?: () => void;
}) {
  const [imageOpen, setImageOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const event = item.event;
  const when = formatEventDateTimeRange(event.startsAt, event.endsAt);
  const whenIso = eventDateTimeIso(event.startsAt);
  const hostName = item.kind === "campus" ? campusEventHostLabel(item.event) : item.event.organizationName;
  const hostOrgId = item.kind === "campus" ? item.event.hostOrganization?.id ?? null : null;
  const imageUrl = item.kind === "external" ? item.event.imageUrl : null;
  const sourceUrl = item.kind === "external" ? item.event.eventUrl : null;
  const locationLabel =
    item.kind === "campus"
      ? item.event.location
      : item.event.venueName || item.event.location || item.event.address;
  const mapped = eventHasMappedLocation(
    item.kind === "external"
      ? {
          latitude: item.event.latitude,
          longitude: item.event.longitude,
          venueName: item.event.venueName,
          location: item.event.location,
          address: item.event.address,
        }
      : { location: item.event.location },
  );
  const facts = extractEventKeyFacts({
    description: event.description,
    isPaid: item.kind === "campus" ? item.event.isPaid : null,
    ticketLink: item.kind === "campus" ? item.event.ticketLink : null,
  });
  const expect = extractWhatToExpect(event.description);
  const paragraphs = eventDescriptionParagraphs(event.description);
  const reason = eventCardRecommendationReason(recommendation?.reason);
  const interested = item.kind === "campus" && isInterestedRsvp(item.event.myRsvpStatus);
  const going = item.kind === "campus" && item.event.myRsvpStatus === "going";
  const canCalendar = Boolean(event.startsAt);

  async function handleShare() {
    const result = await nativeShare({
      title: event.title,
      text: eventShareText({ title: event.title, when, location: locationLabel }),
      url: sourceUrl ?? undefined,
    });
    if (result === "copied") setShareNote("Event details copied.");
    else if (result === "unavailable") setShareNote("Sharing is unavailable on this device.");
    else setShareNote(null);
  }

  function handleCalendar() {
    const ok = downloadEventIcs({
      id: event.id,
      title: event.title,
      description: event.description,
      location: locationLabel,
      url: sourceUrl,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
    if (!ok) setShareNote("This event does not have a start time to add.");
  }

  return (
    <MobileSwipeBackSurface
      onBack={onBack}
      className="cq-event-detail cq-external-event-detail fixed inset-x-0 z-40 overflow-y-auto bg-uri-navy"
      style={{
        top: "var(--cq-topnav-h, 56px)",
        bottom: "calc(var(--cq-bottom-nav-h, 5.75rem) + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-uri-navy/95 px-3 py-2.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-white/20 px-2.5 py-2 text-white/85 transition hover:bg-white/10 hover:text-white active:scale-[0.98] touch-manipulation"
            aria-label="Back to Events"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
            <span className="text-sm font-semibold">Events</span>
          </button>
        </header>

        {error ? (
          <div className="px-4 pt-4">
            <ScreenDataState
              variant="error"
              message="Could not load this event."
              detail={error}
              onRetry={onRetry}
              compact
            />
            {sourceUrl ? (
              <button
                type="button"
                onClick={() => void openExternalUrl(sourceUrl)}
                className="mt-2 w-full min-h-[44px] rounded-xl border border-white/20 px-3 py-2 text-sm text-white/75"
              >
                View source on URInvolved
              </button>
            ) : null}
          </div>
        ) : null}

        {imageUrl ? (
          <button
            type="button"
            className="cq-event-detail-hero"
            onClick={() => setImageOpen(true)}
            aria-label={`View full flyer for ${event.title}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={`${event.title} flyer`} className="cq-event-detail-hero-img" />
          </button>
        ) : null}

        <div className="flex-1 space-y-5 px-4 py-4 sm:px-5">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold leading-tight text-white">{event.title}</h1>
            <div className="flex flex-wrap gap-1.5">
              {reason ? (
                <span className="cq-event-badge cq-event-badge--rec">
                  <span aria-hidden>★ </span>Recommended
                </span>
              ) : null}
              {event.category ? <span className="cq-event-badge">{event.category}</span> : null}
              {item.kind === "campus" && item.event.isCancelled ? (
                <span className="cq-event-badge cq-event-badge--warn">Cancelled</span>
              ) : null}
            </div>
            <p className="text-sm font-medium text-white/85">
              <time dateTime={whenIso}>{when}</time>
            </p>
            {item.kind === "external" ? (
              <ExternalEventLocationDetail
                venueName={item.event.venueName}
                address={item.event.address}
                location={item.event.location}
              />
            ) : item.event.location ? (
              <p className="text-sm text-white/75">{item.event.location}</p>
            ) : null}
          </div>

          <div className="cq-event-detail-actions" role="group" aria-label="Event actions">
            {onToggleInterested ? (
              <button
                type="button"
                disabled={interestedPending}
                onClick={onToggleInterested}
                aria-pressed={interested}
                className={`cq-event-detail-action ${interested ? "cq-event-detail-action--on" : ""}`}
              >
                {interested ? "✓ Interested" : "Interested"}
              </button>
            ) : null}
            {canCalendar ? (
              <button type="button" onClick={handleCalendar} className="cq-event-detail-action">
                <CalendarPlus className="h-4 w-4" aria-hidden />
                Add to Calendar
              </button>
            ) : null}
            <button type="button" onClick={() => void handleShare()} className="cq-event-detail-action">
              <Share2 className="h-4 w-4" aria-hidden />
              Share
            </button>
          </div>
          {shareNote ? <p className="text-xs text-white/55">{shareNote}</p> : null}

          {mapped && (onViewOnMap || onWalkHere) ? (
            <div className="flex flex-wrap gap-2">
              {onViewOnMap ? (
                <button type="button" onClick={onViewOnMap} className="cq-event-detail-map">
                  <MapPin className="h-4 w-4" aria-hidden />
                  View on Map
                </button>
              ) : null}
              {onWalkHere ? (
                <button type="button" onClick={onWalkHere} className="cq-event-detail-map">
                  Walk Here
                </button>
              ) : null}
            </div>
          ) : null}

          {item.kind === "campus" && onRsvpGoing ? (
            <button
              type="button"
              onClick={onRsvpGoing}
              aria-pressed={going}
              className={`cq-event-detail-rsvp ${going ? "cq-event-detail-action--on" : ""}`}
            >
              {going ? "✓ Going" : "Going"}
              {item.event.rsvpCount > 0 ? ` · ${item.event.rsvpCount}` : ""}
            </button>
          ) : null}

          {paragraphs.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/55">About</h2>
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`} className="text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
                  {paragraph}
                </p>
              ))}
            </section>
          ) : null}

          {facts.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/55">What you need to know</h2>
              <dl className="cq-event-facts">
                {facts.map((fact) => (
                  <div key={fact.id} className="cq-event-fact">
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {expect.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/55">What to expect</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-white/75">
                {expect.map((itemLabel) => (
                  <li key={itemLabel}>{itemLabel}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {hostName ? (
            <section className="space-y-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/55">Hosted by</h2>
              {hostOrgId && onOpenOrganization ? (
                <button
                  type="button"
                  onClick={() => onOpenOrganization(hostOrgId)}
                  className="text-sm font-semibold text-uri-keaney"
                >
                  {hostName}
                </button>
              ) : (
                <p className="text-sm text-white/85">{hostName}</p>
              )}
            </section>
          ) : null}

          {item.kind === "external" && item.event.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {item.event.tags
                .filter((tag) => tag !== event.category)
                .map((tag) => (
                  <span key={tag} className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-white/65">
                    {tag}
                  </span>
                ))}
            </div>
          ) : null}

          <TaggedEntityPostsSection
            entityType={item.kind === "campus" ? "event" : "external_event"}
            entityId={event.id}
            title="Campus activity"
          />

          {sourceUrl ? (
            <section className="cq-event-source">
              <p className="text-xs text-white/45">Source: URInvolved</p>
              <button
                type="button"
                onClick={() => void openExternalUrl(sourceUrl)}
                className="inline-flex min-h-[44px] items-center gap-1 text-sm text-cyan-200/90"
              >
                View full listing on URInvolved
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(opens in a new browser)</span>
              </button>
            </section>
          ) : item.kind === "external" ? (
            <p className="text-xs text-white/45">Source: URInvolved</p>
          ) : null}
        </div>
      </div>

      {imageOpen && imageUrl ? (
        <div className="cq-event-image-viewer" role="dialog" aria-modal="true" aria-label={`${event.title} flyer`}>
          <button type="button" className="cq-event-image-viewer-close" onClick={() => setImageOpen(false)} aria-label="Close image">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${event.title} flyer`} className="cq-event-image-viewer-img" />
        </div>
      ) : null}
    </MobileSwipeBackSurface>
  );
}
