"use client";

import { BadgeCheck, ChevronRight, Handshake, Sparkles } from "lucide-react";
import type { Partner } from "@/lib/partners/types";
import type { PartnerDisplayState } from "@/lib/partners/partnerStatus";

export function partnerCtaLabel(partner: Partner): string {
  return partner.questTitle ? "View Quest" : "View Partner";
}

export function PartnerCard({
  partner,
  state = "active",
  onSelect,
}: {
  partner: Partner;
  state?: PartnerDisplayState;
  onSelect?: (partner: Partner) => void;
}) {
  const expired = state === "expired";
  const imageUrl = partner.logoUrl ?? partner.coverImageUrl;
  const offerLine = partner.offerTitle ?? partner.offerDescription;

  return (
    <article
      className={`cq-partner-card${partner.isFeatured && !expired ? " cq-partner-card--featured" : ""}${
        expired ? " cq-partner-card--expired" : ""
      }`}
      aria-label={partner.name}
    >
      <div className="cq-partner-card__media">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="cq-partner-card__img" loading="lazy" decoding="async" />
        ) : (
          <Handshake className="cq-partner-card__img-fallback" aria-hidden strokeWidth={1.8} />
        )}
      </div>

      <div className="cq-partner-card__body">
        <div className="cq-partner-card__badges">
          <span className="cq-partner-badge">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />
            CampusQuest Partner
          </span>
          {partner.isCampusQuestDay ? (
            <span className="cq-partner-badge cq-partner-badge--day">
              <Sparkles className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />
              CampusQuest Day
            </span>
          ) : null}
          {expired ? <span className="cq-partner-badge cq-partner-badge--expired">Offer ended</span> : null}
        </div>

        <h3 className="cq-partner-card__name">{partner.name}</h3>
        {partner.category ? <p className="cq-partner-card__category">{partner.category}</p> : null}

        {partner.discountValue || offerLine ? (
          <p className="cq-partner-card__offer">
            {partner.discountValue ? <strong className="cq-partner-card__discount">{partner.discountValue}</strong> : null}
            {partner.discountValue && offerLine ? " · " : null}
            {offerLine}
          </p>
        ) : null}

        {partner.questTitle ? <p className="cq-partner-card__quest">Quest: {partner.questTitle}</p> : null}

        {onSelect && !expired ? (
          <button
            type="button"
            className="cq-partner-card__cta cq-tap-press touch-manipulation"
            onClick={() => onSelect(partner)}
          >
            {partnerCtaLabel(partner)}
            <ChevronRight className="h-4 w-4" aria-hidden strokeWidth={2.4} />
          </button>
        ) : null}
      </div>
    </article>
  );
}
