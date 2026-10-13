"use client";

import { BadgeCheck, ChevronRight, Clock, ExternalLink, MapPin, Navigation } from "lucide-react";
import { PartnerLogoChip, PartnerMedia } from "@/components/partners/PartnerMedia";
import { partnerDirectionsUrl, partnerHasLiveReward, partnerPrimaryLink } from "@/lib/partners/partnerStatus";
import type { Partner } from "@/lib/partners/types";

export function PartnerBadge() {
  return (
    <span className="cq-partner-badge">
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />
      CampusQuest Partner
    </span>
  );
}

export function PartnerCategoryChips({ categories }: { categories: string[] }) {
  if (categories.length === 0) return null;
  return (
    <ul className="cq-partner-chips" aria-label="Categories">
      {categories.map((category) => (
        <li key={category} className="cq-partner-chip">
          {category}
        </li>
      ))}
    </ul>
  );
}

/** The configured student reward, or a muted "coming soon" line. Never fabricates an offer. */
export function PartnerReward({ partner, now, size }: { partner: Partner; now?: Date; size: "card" | "detail" }) {
  if (!partnerHasLiveReward(partner, now)) {
    return (
      <div className={`cq-partner-reward cq-partner-reward--${size} cq-partner-reward--pending`}>
        <span className="cq-partner-reward__pending">Student reward coming soon</span>
      </div>
    );
  }
  return (
    <div className={`cq-partner-reward cq-partner-reward--${size}`}>
      {partner.discountValue ? <strong className="cq-partner-reward__value">{partner.discountValue}</strong> : null}
      {partner.offerTitle ? <span className="cq-partner-reward__title">{partner.offerTitle}</span> : null}
    </div>
  );
}

export function PartnerCard({
  partner,
  onSelect,
  now,
}: {
  partner: Partner;
  onSelect: (partner: Partner) => void;
  now?: Date;
}) {
  const directionsUrl = partnerDirectionsUrl(partner);
  const primaryLink = partnerPrimaryLink(partner);
  const titleId = `cq-partner-${partner.id}-name`;

  return (
    <article className="cq-partner-card" aria-labelledby={titleId}>
      <div className="cq-partner-card__media">
        <PartnerMedia partner={partner} variant="card" />
        <PartnerLogoChip partner={partner} size="sm" />
      </div>

      <div className="cq-partner-card__info">
        <h3 id={titleId} className="cq-partner-card__name">
          {partner.name}
        </h3>
        <PartnerBadge />
        <PartnerCategoryChips categories={partner.categories} />
        {partner.address ? (
          <p className="cq-partner-card__meta">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.2} />
            <span>{partner.address}</span>
          </p>
        ) : null}
        {partner.hours?.[0] ? (
          <p className="cq-partner-card__meta">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2.2} />
            <span>{partner.hours[0]}</span>
          </p>
        ) : null}
      </div>

      <PartnerReward partner={partner} now={now} size="card" />

      <div className="cq-partner-card__actions">
        <button
          type="button"
          className="cq-partner-btn cq-partner-btn--primary cq-tap-press touch-manipulation"
          onClick={() => onSelect(partner)}
        >
          View Partner
          <ChevronRight className="h-4 w-4" aria-hidden strokeWidth={2.4} />
        </button>
        {directionsUrl ? (
          <a
            className="cq-partner-btn cq-tap-press touch-manipulation"
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${partner.name}`}
          >
            <Navigation className="h-4 w-4" aria-hidden strokeWidth={2.2} />
            Directions
          </a>
        ) : null}
        {primaryLink ? (
          <a
            className="cq-partner-btn cq-tap-press touch-manipulation"
            href={primaryLink.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${partner.name} ${primaryLink.label.toLowerCase()}`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden strokeWidth={2.2} />
            {primaryLink.label}
          </a>
        ) : null}
      </div>
    </article>
  );
}
