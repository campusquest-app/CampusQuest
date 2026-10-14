"use client";

import { ChevronRight, Gift } from "lucide-react";
import {
  DiscountBadge,
  FavoriteButton,
  PartnerOpenStatus,
  RewardSoonBadge,
} from "@/components/partners/PartnerBadges";
import { PartnerLogoChip, PartnerMedia } from "@/components/partners/PartnerMedia";
import { getPartnerOpenStatus } from "@/lib/partners/partnerHours";
import { partnerHasLiveReward } from "@/lib/partners/partnerStatus";
import type { Partner } from "@/lib/partners/types";

export type PartnerFavoriteProps = {
  saved: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
};

export function partnerCategoryLine(partner: Partner): string {
  return partner.categories.join(" \u00b7 ");
}

/** Compact row for "Explore Local Businesses": photo, name, category, live hours, and the reward. */
export function PartnerCard({
  partner,
  now,
  onSelect,
  favorite,
}: {
  partner: Partner;
  now: Date;
  onSelect: (partner: Partner) => void;
  favorite?: PartnerFavoriteProps;
}) {
  const status = getPartnerOpenStatus(partner.hours, now);
  const hasReward = partnerHasLiveReward(partner, now);
  const titleId = `cq-perk-${partner.id}-name`;

  return (
    <article className="cq-perk-card" aria-labelledby={titleId}>
      <button type="button" className="cq-perk-card__main cq-tap-press touch-manipulation" onClick={() => onSelect(partner)}>
        <span className="cq-perk-card__thumb">
          <PartnerMedia partner={partner} variant="thumb" />
        </span>
        <span className="cq-perk-card__body">
          <span id={titleId} className="cq-perk-card__name">
            {partner.name}
          </span>
          {partner.categories.length > 0 ? (
            <span className="cq-perk-card__category">{partnerCategoryLine(partner)}</span>
          ) : null}
          <PartnerOpenStatus status={status} className="cq-perk-card__status" />
          <span className="cq-perk-card__reward">
            {hasReward && partner.discountValue ? <DiscountBadge value={partner.discountValue} size="sm" /> : null}
            {hasReward && !partner.discountValue && partner.offerTitle ? (
              <span className="cq-perk-card__offer">{partner.offerTitle}</span>
            ) : null}
            {!hasReward ? <RewardSoonBadge /> : null}
          </span>
        </span>
        {favorite ? null : <ChevronRight className="cq-perk-card__chevron" aria-hidden strokeWidth={2.2} />}
      </button>
      {favorite ? (
        <span className="cq-perk-card__fav">
          <FavoriteButton
            saved={favorite.saved}
            busy={favorite.busy}
            disabled={favorite.disabled}
            partnerName={partner.name}
            onToggle={favorite.onToggle}
          />
        </span>
      ) : null}
    </article>
  );
}

/** Large card for "Featured Community Quests". Only rendered for partners with a live, configured reward. */
export function FeaturedDealCard({
  partner,
  now,
  onSelect,
  onViewReward,
  favorite,
}: {
  partner: Partner;
  now: Date;
  onSelect: (partner: Partner) => void;
  onViewReward: (partner: Partner) => void;
  favorite?: PartnerFavoriteProps;
}) {
  const status = getPartnerOpenStatus(partner.hours, now);
  const titleId = `cq-perk-featured-${partner.id}-name`;

  return (
    <article className="cq-perk-featured" aria-labelledby={titleId}>
      <button
        type="button"
        className="cq-perk-featured__media touch-manipulation"
        onClick={() => onSelect(partner)}
        aria-label={`View ${partner.name}`}
      >
        <PartnerMedia partner={partner} variant="featured" />
        <span className="cq-perk-featured__shade" aria-hidden />
        {partner.discountValue ? (
          <span className="cq-perk-featured__badge">
            <DiscountBadge value={partner.discountValue} size="lg" />
          </span>
        ) : null}
      </button>
      {favorite ? (
        <span className="cq-perk-featured__fav">
          <FavoriteButton
            saved={favorite.saved}
            busy={favorite.busy}
            disabled={favorite.disabled}
            partnerName={partner.name}
            onToggle={favorite.onToggle}
            variant="glass"
          />
        </span>
      ) : null}
      <div className="cq-perk-featured__body">
        <div className="cq-perk-featured__heading">
          <PartnerLogoChip partner={partner} size="sm" />
          <div className="cq-perk-featured__titles">
            <h3 id={titleId} className="cq-perk-featured__name">
              {partner.name}
            </h3>
            {partner.offerTitle ? <p className="cq-perk-featured__offer">{partner.offerTitle}</p> : null}
          </div>
        </div>
        <PartnerOpenStatus status={status} />
        <button
          type="button"
          className="cq-perk-btn cq-perk-btn--primary cq-perk-btn--block cq-tap-press touch-manipulation"
          onClick={() => onViewReward(partner)}
        >
          <Gift className="h-4 w-4" aria-hidden strokeWidth={2.3} />
          View Quest Deal
        </button>
      </div>
    </article>
  );
}
