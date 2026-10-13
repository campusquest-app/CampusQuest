"use client";

import { useEffect, useRef } from "react";
import { Clock, ExternalLink, Globe, MapPin, Navigation, UtensilsCrossed, X } from "lucide-react";
import { PartnerBadge, PartnerCategoryChips, PartnerReward } from "@/components/partners/PartnerCard";
import { PartnerLogoChip, PartnerMedia } from "@/components/partners/PartnerMedia";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import { partnerDirectionsUrl, partnerHasLiveReward } from "@/lib/partners/partnerStatus";
import type { Partner } from "@/lib/partners/types";

export function PartnerDetailSheet({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  useRegisterImmersiveScreen(true);
  return <PartnerDetailView partner={partner} onClose={onClose} />;
}

export function PartnerDetailView({ partner, onClose, now }: { partner: Partner; onClose: () => void; now?: Date }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const directionsUrl = partnerDirectionsUrl(partner);
  const hasReward = partnerHasLiveReward(partner, now);
  const titleId = `cq-partner-detail-${partner.id}-title`;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="cq-composer-overlay cq-partner-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cq-partner-detail">
        <div className="cq-partner-detail__hero">
          <PartnerMedia partner={partner} variant="hero" />
          <button
            ref={closeRef}
            type="button"
            className="cq-partner-detail__close cq-tap-press touch-manipulation"
            onClick={onClose}
            aria-label="Close partner details"
          >
            <X className="h-5 w-5" aria-hidden strokeWidth={2.4} />
          </button>
        </div>

        <div className="cq-partner-detail__body">
          <div className="cq-partner-detail__heading">
            <PartnerLogoChip partner={partner} size="lg" />
            <div className="cq-partner-detail__title-wrap">
              <h2 id={titleId} className="cq-partner-detail__name">
                {partner.name}
              </h2>
              <PartnerBadge />
            </div>
          </div>

          <PartnerCategoryChips categories={partner.categories} />

          {partner.description ? <p className="cq-partner-detail__description">{partner.description}</p> : null}

          <section className="cq-partner-detail__section" aria-label="CampusQuest student reward">
            <h3 className="cq-partner-detail__section-title">CampusQuest student reward</h3>
            <PartnerReward partner={partner} now={now} size="detail" />
            {hasReward && partner.offerDescription ? (
              <p className="cq-partner-detail__text">{partner.offerDescription}</p>
            ) : null}
            {hasReward && partner.redemptionInstructions ? (
              <div className="cq-partner-detail__redeem">
                <span className="cq-partner-detail__redeem-label">How to redeem</span>
                <p className="cq-partner-detail__text">{partner.redemptionInstructions}</p>
              </div>
            ) : null}
          </section>

          {partner.questTitle ? (
            <section className="cq-partner-detail__section" aria-label="Partner quest">
              <h3 className="cq-partner-detail__section-title">Partner quest</h3>
              <p className="cq-partner-detail__quest">{partner.questTitle}</p>
              {partner.questDescription ? <p className="cq-partner-detail__text">{partner.questDescription}</p> : null}
            </section>
          ) : null}

          <ul className="cq-partner-detail__info">
            {partner.address ? (
              <li>
                <MapPin className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
                <span>{partner.address}</span>
              </li>
            ) : null}
            {partner.hours && partner.hours.length > 0 ? (
              <li>
                <Clock className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
                <span className="cq-partner-detail__hours">
                  {partner.hours.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              </li>
            ) : null}
            {partner.menuUrl ? (
              <li>
                <UtensilsCrossed className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
                <a href={partner.menuUrl} target="_blank" rel="noopener noreferrer" className="cq-partner-detail__link">
                  View menu
                </a>
              </li>
            ) : null}
            {partner.websiteUrl ? (
              <li>
                <Globe className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
                <a
                  href={partner.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cq-partner-detail__link"
                >
                  {partner.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </li>
            ) : null}
          </ul>

          <div className="cq-partner-detail__actions">
            {directionsUrl ? (
              <a
                className="cq-partner-btn cq-partner-btn--primary cq-tap-press touch-manipulation"
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation className="h-4 w-4" aria-hidden strokeWidth={2.2} />
                Directions
              </a>
            ) : null}
            {partner.menuUrl ? (
              <a
                className="cq-partner-btn cq-tap-press touch-manipulation"
                href={partner.menuUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" aria-hidden strokeWidth={2.2} />
                Menu
              </a>
            ) : null}
            {partner.websiteUrl ? (
              <a
                className="cq-partner-btn cq-tap-press touch-manipulation"
                href={partner.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" aria-hidden strokeWidth={2.2} />
                Website
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
