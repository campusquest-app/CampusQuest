"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Clock, ExternalLink, Gift, Globe, MapPin, Navigation, UtensilsCrossed, X } from "lucide-react";
import {
  DiscountBadge,
  FavoriteButton,
  PartnerOpenStatus,
  VerifiedPartnerBadge,
} from "@/components/partners/PartnerBadges";
import { partnerCategoryLine, type PartnerFavoriteProps } from "@/components/partners/PartnerCard";
import { PartnerLogoChip, PartnerMedia } from "@/components/partners/PartnerMedia";
import { PartnerOverlayPortal } from "@/components/partners/PartnerOverlayPortal";
import { useRegisterImmersiveScreen } from "@/lib/client/nestedImmersiveScreen";
import {
  formatHoursCheckedOn,
  getPartnerOpenStatus,
  getTodayHoursLabel,
  getUpcomingSpecialHours,
  getWeeklyHoursRows,
} from "@/lib/partners/partnerHours";
import {
  isFreeLocalBusinessListing,
  partnerDirectionsUrl,
  partnerRewardCtaLabel,
  partnerRewardOfferState,
  partnerRewardSectionLabel,
} from "@/lib/partners/partnerStatus";
import type { Partner } from "@/lib/partners/types";

type DetailProps = {
  partner: Partner;
  now: Date;
  onClose: () => void;
  onViewReward: (partner: Partner) => void;
  favorite?: PartnerFavoriteProps;
  initialHoursOpen?: boolean;
};

export function PartnerDetailSheet(props: DetailProps) {
  useRegisterImmersiveScreen(true);
  return (
    <PartnerOverlayPortal>
      <PartnerDetailView {...props} />
    </PartnerOverlayPortal>
  );
}

function formatOfferStart(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

function RewardSection({
  partner,
  now,
  onViewReward,
}: {
  partner: Partner;
  now: Date;
  onViewReward: (partner: Partner) => void;
}) {
  const state = partnerRewardOfferState(partner, now);
  if (state === "none") return null;

  const sectionLabel = partnerRewardSectionLabel(partner);

  if (state === "active") {
    return (
      <section className="cq-perk-reward cq-perk-reward--active" aria-label={sectionLabel}>
        <div className="cq-perk-reward__head">
          <span className="cq-perk-reward__eyebrow">
            <Gift className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />
            {sectionLabel}
          </span>
          <span className="cq-perk-reward__state">Active</span>
        </div>
        <div className="cq-perk-reward__value-row">
          {partner.discountValue ? <DiscountBadge value={partner.discountValue} size="lg" /> : null}
          {partner.offerTitle ? <span className="cq-perk-reward__title">{partner.offerTitle}</span> : null}
        </div>
        {partner.offerDescription ? <p className="cq-perk-reward__text">{partner.offerDescription}</p> : null}
        {partner.questTitle ? <p className="cq-perk-reward__text">{partner.questTitle}</p> : null}
        {partner.questDescription ? <p className="cq-perk-reward__text">{partner.questDescription}</p> : null}
        <button
          type="button"
          className="cq-perk-btn cq-perk-btn--primary cq-perk-btn--block cq-tap-press touch-manipulation"
          onClick={() => onViewReward(partner)}
        >
          <Gift className="h-4 w-4" aria-hidden strokeWidth={2.3} />
          {partnerRewardCtaLabel(partner)}
        </button>
        {partner.redemptionInstructions ? (
          <p className="cq-perk-reward__fine">{partner.redemptionInstructions}</p>
        ) : null}
        {partner.rewardTerms ? <p className="cq-perk-reward__fine">{partner.rewardTerms}</p> : null}
        {(() => {
          const endsMs = partner.endsAt ? Date.parse(partner.endsAt) : NaN;
          if (!Number.isFinite(endsMs)) return null;
          return (
            <p className="cq-perk-reward__fine">
              Offer ends{" "}
              {new Date(endsMs).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "America/New_York",
              })}
              .
            </p>
          );
        })()}
      </section>
    );
  }

  const start = state === "coming_soon" && partner.discountValue ? formatOfferStart(partner.startsAt) : null;
  const copy =
    state === "expired"
      ? { label: "Expired", text: "This student reward has ended." }
      : state === "unavailable"
        ? { label: "Temporarily unavailable", text: "This reward is paused right now. Check back soon." }
        : { label: "Coming soon", text: start ? `Student reward starts ${start}.` : "Student reward coming soon." };

  return (
    <section className={`cq-perk-reward cq-perk-reward--${state}`} aria-label={sectionLabel}>
      <div className="cq-perk-reward__head">
        <span className="cq-perk-reward__eyebrow">
          <Gift className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />
          {sectionLabel}
        </span>
        <span className="cq-perk-reward__state">{copy.label}</span>
      </div>
      <p className="cq-perk-reward__text">{copy.text}</p>
    </section>
  );
}

function HoursSection({ partner, now, initialOpen }: { partner: Partner; now: Date; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const panelId = useId();
  const rows = getWeeklyHoursRows(partner.hours, now);
  const special = getUpcomingSpecialHours(partner.hours, now);
  const today = getTodayHoursLabel(partner.hours, now);
  const checked = formatHoursCheckedOn(partner.hours?.checkedOn);

  if (!partner.hours || rows.length === 0) {
    return (
      <section className="cq-perk-hours" aria-label="Hours">
        <div className="cq-perk-hours__toggle cq-perk-hours__toggle--static">
          <Clock className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
          <span className="cq-perk-hours__summary">
            <span className="cq-perk-hours__title">Hours</span>
            <span className="cq-perk-hours__today">Hours Unavailable</span>
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="cq-perk-hours" aria-label="Hours">
      <button
        type="button"
        className="cq-perk-hours__toggle touch-manipulation"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Clock className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
        <span className="cq-perk-hours__summary">
          <span className="cq-perk-hours__title">Hours</span>
          {today ? <span className="cq-perk-hours__today">Today: {today}</span> : null}
        </span>
        <ChevronDown className={`cq-perk-hours__chevron${open ? " is-open" : ""}`} aria-hidden strokeWidth={2.3} />
      </button>
      <div id={panelId} className="cq-perk-hours__panel" hidden={!open}>
        <dl className="cq-perk-hours__table">
          {rows.map((row) => (
            <div key={row.weekday} className={`cq-perk-hours__row${row.isToday ? " is-today" : ""}`}>
              <dt>{row.day}</dt>
              <dd>{row.hours}</dd>
            </div>
          ))}
        </dl>
        {special.length > 0 ? (
          <div className="cq-perk-hours__special">
            <p className="cq-perk-hours__special-title">Holiday &amp; special hours</p>
            <dl className="cq-perk-hours__table">
              {special.map((row) => (
                <div key={row.date} className="cq-perk-hours__row">
                  <dt>
                    {row.dateLabel}
                    {row.note ? <span className="cq-perk-hours__note"> {"\u00b7"} {row.note}</span> : null}
                  </dt>
                  <dd>{row.hours}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {partner.hours.source ? (
          <p className="cq-perk-hours__source">
            Hours from {partner.hours.source}
            {checked ? ` \u00b7 checked ${checked}` : ""}. Times may change on holidays.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function PartnerDetailView({ partner, now, onClose, onViewReward, favorite, initialHoursOpen = false }: DetailProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const directionsUrl = partnerDirectionsUrl(partner);
  const status = getPartnerOpenStatus(partner.hours, now);
  const freeListing = isFreeLocalBusinessListing(partner);
  const titleId = `cq-perk-detail-${partner.id}-title`;

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="cq-perk-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="cq-perk-sheet__backdrop" aria-label="Close business details" onClick={onClose} />
      <div className="cq-perk-sheet__scroll">
        <div className="cq-perk-detail__hero">
          <PartnerMedia partner={partner} variant="hero" />
          <span className="cq-perk-detail__hero-shade" aria-hidden />
          <div className="cq-perk-detail__topbar">
            <button
              ref={closeRef}
              type="button"
              className="cq-perk-iconbtn cq-tap-press touch-manipulation"
              onClick={onClose}
              aria-label="Close business details"
            >
              <X className="h-5 w-5" aria-hidden strokeWidth={2.4} />
            </button>
            {favorite ? (
              <FavoriteButton
                saved={favorite.saved}
                busy={favorite.busy}
                disabled={favorite.disabled}
                partnerName={partner.name}
                onToggle={favorite.onToggle}
                variant="glass"
              />
            ) : null}
          </div>
        </div>

        <div className="cq-perk-detail__body">
          <div className="cq-perk-detail__heading">
            <PartnerLogoChip partner={partner} size="lg" />
            <div className="cq-perk-detail__titles">
              <h2 id={titleId} className="cq-perk-detail__name">
                {partner.name}
              </h2>
              {partner.categories.length > 0 ? (
                <p className="cq-perk-detail__category">{partnerCategoryLine(partner)}</p>
              ) : null}
            </div>
          </div>
          {freeListing ? null : <VerifiedPartnerBadge />}

          {freeListing ? null : (
            <div className="cq-perk-detail__status">
              <PartnerOpenStatus status={status} />
              {status.note ? <span className="cq-perk-detail__status-note">{status.note}</span> : null}
            </div>
          )}

          <RewardSection partner={partner} now={now} onViewReward={onViewReward} />

          {partner.description ? (
            <section className="cq-perk-detail__section" aria-label="About">
              <h3 className="cq-perk-detail__section-title">About</h3>
              <p className="cq-perk-detail__text">{partner.description}</p>
            </section>
          ) : null}

          {freeListing && !partner.hours ? null : (
            <HoursSection partner={partner} now={now} initialOpen={initialHoursOpen} />
          )}

          {partner.address ? (
            <p className="cq-perk-detail__address">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
              <span>{partner.address}</span>
            </p>
          ) : null}

          {directionsUrl || partner.websiteUrl || partner.menuUrl ? (
            <div className="cq-perk-detail__actions">
              {directionsUrl ? (
                <a
                  className="cq-perk-btn cq-perk-btn--secondary cq-tap-press touch-manipulation"
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation className="h-4 w-4" aria-hidden strokeWidth={2.2} />
                  {freeListing ? "Get Directions" : "Directions"}
                </a>
              ) : null}
              {partner.websiteUrl ? (
                <a
                  className="cq-perk-btn cq-perk-btn--secondary cq-tap-press touch-manipulation"
                  href={partner.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="h-4 w-4" aria-hidden strokeWidth={2.2} />
                  {freeListing ? "Visit Website" : "Website"}
                </a>
              ) : null}
              {partner.menuUrl ? (
                <a
                  className="cq-perk-btn cq-perk-btn--secondary cq-tap-press touch-manipulation"
                  href={partner.menuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <UtensilsCrossed className="h-4 w-4" aria-hidden strokeWidth={2.2} />
                  Menu
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden strokeWidth={2.2} />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
