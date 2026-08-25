"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  CalendarPlus,
  ChevronLeft,
  Clock,
  ExternalLink,
  MapPin,
  Share2,
  Users,
  X,
} from "lucide-react";
import { CQ_BOTTOM_NAV_CLEARANCE } from "@/components/AppBottomNav";
import { MobileSwipeBackSurface } from "@/components/mobile/MobileSwipeBackSurface";
import { TaggedEntityPostsSection } from "@/components/quad/TaggedEntityPostsSection";
import { downloadEventIcs } from "@/lib/client/eventCalendar";
import { eventDateTimeIso, formatEventDateLine, formatEventDateTimeRange, formatEventTimeLine } from "@/lib/client/eventDateTime";
import {
  eventDescriptionParagraphs,
  extractEventKeyFacts,
  extractWhatToExpect,
  shouldCollapseEventDescription,
} from "@/lib/client/eventDetailContent";
import { eventCardRecommendationReason, eventHasMappedLocation, eventShareText } from "@/lib/client/eventDiscovery";
import { campusEventHostLabel, type FeedEvent } from "@/lib/client/eventFeedTypes";
import { isInterestedRsvp } from "@/lib/client/eventInterested";
import { nativeShare, openExternalUrl } from "@/lib/client/capacitorNative";
import { externalEventLocationLines } from "@/lib/externalEventLocation";
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
  item: FeedEvent | null;
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
  const [mounted, setMounted] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    setDescriptionExpanded(false);
    setImageOpen(false);
    setShareNote(null);
  }, [item?.event.id]);

  if (!mounted || typeof document === "undefined") return null;

  const unavailable = Boolean(error) || !item;

  return createPortal(
    <MobileSwipeBackSurface
      onBack={onBack}
      className="cq-event-detail cq-external-event-detail fixed inset-x-0 top-0 z-[110] overflow-y-auto overscroll-y-contain bg-uri-navy"
      style={{ bottom: CQ_BOTTOM_NAV_CLEARANCE }}
      role="dialog"
      aria-modal="true"
      aria-label={item?.event.title ? `${item.event.title} event details` : "Event details"}
    >
      <div className="cq-event-detail-inner">
        <header className="cq-event-detail-header">
          <button
            type="button"
            onClick={onBack}
            className="cq-event-detail-back"
            aria-label="Back to Events"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
            <span>Events</span>
          </button>
        </header>

        {unavailable ? (
          <div className="cq-event-detail-body">
            <div className="cq-event-detail-unavailable" role="status">
              <h1 className="font-display text-xl font-bold text-white">Event unavailable</h1>
              <p className="mt-2 text-sm text-white/70">
                This event may have been removed or updated.
              </p>
              {error ? <p className="mt-2 text-xs text-white/45">{error}</p> : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={onBack} className="cq-event-detail-action cq-event-detail-action--primary">
                  Back to Events
                </button>
                {onRetry ? (
                  <button type="button" onClick={onRetry} className="cq-event-detail-action">
                    Try again
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <EventDetailBody
            item={item}
            recommendation={recommendation}
            interestedPending={interestedPending}
            imageOpen={imageOpen}
            setImageOpen={setImageOpen}
            shareNote={shareNote}
            setShareNote={setShareNote}
            descriptionExpanded={descriptionExpanded}
            setDescriptionExpanded={setDescriptionExpanded}
            onToggleInterested={onToggleInterested}
            onViewOnMap={onViewOnMap}
            onWalkHere={onWalkHere}
            onOpenOrganization={onOpenOrganization}
            onRsvpGoing={onRsvpGoing}
          />
        )}
      </div>
    </MobileSwipeBackSurface>,
    document.body,
  );
}

function EventDetailBody({
  item,
  recommendation,
  interestedPending,
  imageOpen,
  setImageOpen,
  shareNote,
  setShareNote,
  descriptionExpanded,
  setDescriptionExpanded,
  onToggleInterested,
  onViewOnMap,
  onWalkHere,
  onOpenOrganization,
  onRsvpGoing,
}: {
  item: FeedEvent;
  recommendation?: RecommendationScore | null;
  interestedPending: boolean;
  imageOpen: boolean;
  setImageOpen: (open: boolean) => void;
  shareNote: string | null;
  setShareNote: (note: string | null) => void;
  descriptionExpanded: boolean;
  setDescriptionExpanded: (expanded: boolean) => void;
  onToggleInterested?: () => void;
  onViewOnMap?: () => void;
  onWalkHere?: () => void;
  onOpenOrganization?: (organizationId: string) => void;
  onRsvpGoing?: () => void;
}) {
  const event = item.event;
  const when = formatEventDateTimeRange(event.startsAt, event.endsAt);
  const dateLine = formatEventDateLine(event.startsAt);
  const timeLine = formatEventTimeLine(event.startsAt, event.endsAt);
  const whenIso = eventDateTimeIso(event.startsAt);
  const hostName = item.kind === "campus" ? campusEventHostLabel(item.event) : item.event.organizationName;
  const hostOrgId = item.kind === "campus" ? item.event.hostOrganization?.id ?? null : null;
  const imageUrl = item.kind === "external" ? item.event.imageUrl : null;
  const sourceUrl = item.kind === "external" ? item.event.eventUrl : null;
  const locationLabel =
    item.kind === "campus"
      ? item.event.location
      : item.event.venueName || item.event.location || item.event.address;
  const externalLocation =
    item.kind === "external" ? externalEventLocationLines(item.event.venueName, item.event.address) : null;
  const externalVenue =
    externalLocation?.venue ??
    (item.kind === "external" && item.event.location && item.event.location !== "Location TBA"
      ? item.event.location
      : null);
  const externalAddress = externalLocation?.address ?? null;
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
  const canCollapseDescription = shouldCollapseEventDescription(paragraphs);
  const visibleParagraphs =
    canCollapseDescription && !descriptionExpanded ? paragraphs.slice(0, 3) : paragraphs;
  const reason = eventCardRecommendationReason(recommendation?.reason);
  const interested = item.kind === "campus" && isInterestedRsvp(item.event.myRsvpStatus);
  const going = item.kind === "campus" && item.event.myRsvpStatus === "going";
  const canCalendar = Boolean(event.startsAt);
  const showNeedToKnow = facts.length > 0 || expect.length > 0;

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
    <>
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
      ) : (
        <div className="cq-event-detail-hero cq-event-detail-hero--fallback" aria-hidden>
          <Calendar className="h-10 w-10 text-white/35" strokeWidth={1.5} />
        </div>
      )}

      <div className="cq-event-detail-body">
        <div className="cq-event-detail-intro">
          <h1 className="cq-event-detail-title">{event.title}</h1>
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
        </div>

        <dl className="cq-event-detail-meta">
          <div className="cq-event-detail-meta-row">
            <dt className="sr-only">Date</dt>
            <dd>
              <Calendar className="cq-event-detail-meta-icon" aria-hidden />
              <time dateTime={whenIso}>{dateLine}</time>
            </dd>
          </div>
          {timeLine ? (
            <div className="cq-event-detail-meta-row">
              <dt className="sr-only">Time</dt>
              <dd>
                <Clock className="cq-event-detail-meta-icon" aria-hidden />
                <span>{timeLine}</span>
              </dd>
            </div>
          ) : null}
          {item.kind === "external" ? (
            <div className="cq-event-detail-meta-row cq-event-detail-meta-row--stack">
              <dt className="sr-only">Location</dt>
              <dd>
                <MapPin className="cq-event-detail-meta-icon" aria-hidden />
                <span>
                  {externalVenue || externalAddress ? (
                    <>
                      {externalVenue ? <span className="block">{externalVenue}</span> : null}
                      {externalAddress ? <span className="mt-0.5 block text-sm font-medium text-white/60">{externalAddress}</span> : null}
                    </>
                  ) : (
                    "Location TBA"
                  )}
                </span>
              </dd>
            </div>
          ) : locationLabel ? (
            <div className="cq-event-detail-meta-row">
              <dt className="sr-only">Location</dt>
              <dd>
                <MapPin className="cq-event-detail-meta-icon" aria-hidden />
                <span>{locationLabel}</span>
              </dd>
            </div>
          ) : null}
          {hostName ? (
            <div className="cq-event-detail-meta-row">
              <dt className="sr-only">Host</dt>
              <dd>
                <Users className="cq-event-detail-meta-icon" aria-hidden />
                <span>Hosted by {hostName}</span>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="cq-event-detail-actions" role="group" aria-label="Event actions">
          {onToggleInterested ? (
            <button
              type="button"
              disabled={interestedPending}
              onClick={onToggleInterested}
              aria-pressed={interested}
              className={`cq-event-detail-action cq-event-detail-action--primary ${interested ? "cq-event-detail-action--on" : ""}`}
            >
              {interested ? "✓ Interested" : "Interested"}
            </button>
          ) : null}
          {item.kind === "campus" && onRsvpGoing ? (
            <button
              type="button"
              onClick={onRsvpGoing}
              aria-pressed={going}
              className={`cq-event-detail-action ${going ? "cq-event-detail-action--on" : ""}`}
            >
              {going ? "✓ Going" : "Going"}
              {item.event.rsvpCount > 0 ? ` · ${item.event.rsvpCount}` : ""}
            </button>
          ) : null}
          {canCalendar ? (
            <button type="button" onClick={handleCalendar} className="cq-event-detail-action">
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Add to Calendar
            </button>
          ) : null}
          {mapped && onViewOnMap ? (
            <button type="button" onClick={onViewOnMap} className="cq-event-detail-action">
              <MapPin className="h-4 w-4" aria-hidden />
              View on Map
            </button>
          ) : null}
          {mapped && onWalkHere ? (
            <button type="button" onClick={onWalkHere} className="cq-event-detail-action">
              Walk Here
            </button>
          ) : null}
          <button type="button" onClick={() => void handleShare()} className="cq-event-detail-action">
            <Share2 className="h-4 w-4" aria-hidden />
            Share
          </button>
        </div>
        {shareNote ? <p className="text-xs text-white/55">{shareNote}</p> : null}

        {showNeedToKnow ? (
          <section className="cq-event-detail-section" aria-labelledby="event-need-to-know">
            <h2 id="event-need-to-know" className="cq-event-detail-section-title">
              What You Need to Know
            </h2>
            {facts.length > 0 ? (
              <dl className="cq-event-facts">
                {facts.map((fact) => (
                  <div key={fact.id} className="cq-event-fact">
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {expect.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/75">
                {expect.map((itemLabel) => (
                  <li key={itemLabel}>{itemLabel}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {paragraphs.length > 0 ? (
          <section className="cq-event-detail-section" aria-labelledby="event-about">
            <h2 id="event-about" className="cq-event-detail-section-title">
              About This Event
            </h2>
            <div className="cq-event-detail-description">
              {visibleParagraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
              ))}
            </div>
            {canCollapseDescription ? (
              <button
                type="button"
                className="cq-event-detail-read-more"
                onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                aria-expanded={descriptionExpanded}
              >
                {descriptionExpanded ? "Show Less" : "Read More"}
              </button>
            ) : null}
          </section>
        ) : null}

        {hostName ? (
          <section className="cq-event-detail-section" aria-labelledby="event-host">
            <h2 id="event-host" className="cq-event-detail-section-title">
              Hosted by
            </h2>
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
              More Info on URInvolved
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new browser)</span>
            </button>
          </section>
        ) : item.kind === "external" ? (
          <p className="text-xs text-white/45">Source: URInvolved</p>
        ) : null}
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
    </>
  );
}
