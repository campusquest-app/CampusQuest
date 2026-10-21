"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import type { Partner } from "@/lib/partners/types";

type MediaVariant = "thumb" | "featured" | "hero";

/**
 * Daisy's and International Pocket Café: logo is the large card image, food photo is the
 * small chip beside the name. Other partners keep cover-first card media.
 */
const LOGO_AS_CARD_HERO_IDS = new Set(["daisys-chicken-ice-cream", "international-pocket-cafe"]);

export function partnerPrefersLogoAsCardHero(partner: Pick<Partner, "id">): boolean {
  return LOGO_AS_CARD_HERO_IDS.has(partner.id);
}

/** Real business photo, else the business logo on a light tile, else a neutral placeholder. */
export function PartnerMedia({ partner, variant }: { partner: Partner; variant: MediaVariant }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const base = `cq-partner-media cq-partner-media--${variant}`;
  const loading = variant === "hero" ? "eager" : "lazy";
  const cardSurface = variant === "thumb" || variant === "featured";
  const preferLogoHero = cardSurface && partnerPrefersLogoAsCardHero(partner);

  const dims =
    variant === "thumb" ? { width: 96, height: 96 } : variant === "featured" ? { width: 720, height: 405 } : { width: 960, height: 600 };

  if (preferLogoHero && partner.logoUrl && !logoFailed) {
    return (
      <span className={`${base} cq-partner-media--logo cq-partner-media--logo-hero`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={partner.logoUrl}
          alt={`${partner.name} logo`}
          className="cq-partner-media__logo-fill"
          width={dims.width}
          height={dims.height}
          loading={loading}
          decoding="async"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  if (partner.coverImageUrl && !coverFailed) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={partner.coverImageUrl}
          alt={`Photo from ${partner.name}`}
          className="cq-partner-media__photo"
          width={dims.width}
          height={dims.height}
          loading={loading}
          decoding="async"
          onError={() => setCoverFailed(true)}
        />
      </span>
    );
  }

  if (partner.logoUrl && !logoFailed) {
    return (
      <span className={`${base} cq-partner-media--logo`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={partner.logoUrl}
          alt={`${partner.name} logo`}
          className="cq-partner-media__logo-fill"
          width={dims.width}
          height={dims.height}
          loading={loading}
          decoding="async"
          onError={() => setLogoFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`${base} cq-partner-media--placeholder`} role="img" aria-label={`${partner.name} photo coming soon`}>
      <Store className="cq-partner-media__placeholder-icon" aria-hidden strokeWidth={1.8} />
    </span>
  );
}

/**
 * Small image beside the business name.
 * Default (`accent="logo"`): logo chip when a cover photo is already the main image (detail sheet).
 * `accent="photo"`: food photo chip — used on Featured/Explore cards when the logo is the large image.
 */
export function PartnerLogoChip({
  partner,
  size,
  accent = "logo",
}: {
  partner: Partner;
  size: "sm" | "lg";
  accent?: "logo" | "photo";
}) {
  const [failed, setFailed] = useState(false);
  if (!partner.coverImageUrl || !partner.logoUrl || failed) return null;

  const usePhoto = accent === "photo";
  const src = usePhoto ? partner.coverImageUrl : partner.logoUrl;
  const alt = usePhoto ? `Photo from ${partner.name}` : "";
  const chipClass = [
    "cq-partner-logo-chip",
    `cq-partner-logo-chip--${size}`,
    usePhoto ? "cq-partner-logo-chip--photo" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={chipClass}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}
