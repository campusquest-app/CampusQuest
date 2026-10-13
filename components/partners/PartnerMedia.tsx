"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import type { Partner } from "@/lib/partners/types";

type MediaVariant = "thumb" | "featured" | "hero";

/** Real business photo, else the business logo on a light tile, else a neutral placeholder. */
export function PartnerMedia({ partner, variant }: { partner: Partner; variant: MediaVariant }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const base = `cq-partner-media cq-partner-media--${variant}`;
  const loading = variant === "hero" ? "eager" : "lazy";

  if (partner.coverImageUrl && !coverFailed) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={partner.coverImageUrl}
          alt={`Photo from ${partner.name}`}
          className="cq-partner-media__photo"
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

/** Small logo chip shown on top of a real photo; hidden when the logo is already the main image. */
export function PartnerLogoChip({ partner, size }: { partner: Partner; size: "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  if (!partner.coverImageUrl || !partner.logoUrl || failed) return null;
  return (
    <span className={`cq-partner-logo-chip cq-partner-logo-chip--${size}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={partner.logoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}
