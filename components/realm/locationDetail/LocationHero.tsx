"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import type { RealmLocation } from "@/lib/realm/locations";
import { getRealmLocationHeroImage } from "@/lib/realm/locationHeroImages";
import { placeCardImageObjectPosition } from "@/lib/realm/placeImages";
import type { LocationMetaPill } from "@/lib/realm/locationDetailCopy";

export function LocationHero({
  location,
  displayName,
  description,
  pills,
  fallbackImageUrl,
  onBack,
  showBack = true,
}: {
  location: RealmLocation | null;
  displayName: string;
  description: string;
  pills: LocationMetaPill[];
  fallbackImageUrl?: string | null;
  onBack: () => void;
  showBack?: boolean;
}) {
  const heroImage = (location ? getRealmLocationHeroImage(location.id) : null) ?? fallbackImageUrl ?? null;
  const heroObjectPosition = location ? placeCardImageObjectPosition(location.id) : "center 35%";
  const imageKey = `${location?.id ?? "event"}:${heroImage ?? ""}`;
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const showImage = Boolean(heroImage) && failedKey !== imageKey;

  return (
    <header className="cq-loc-hero cq-realm-hero-enter">
      <div className="cq-loc-hero-media" aria-hidden>
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage ?? undefined}
            alt=""
            className="cq-loc-hero-image"
            style={{ objectPosition: heroObjectPosition }}
            onError={() => setFailedKey(imageKey)}
          />
        ) : (
          <div className="cq-loc-hero-fallback">
            <span className="text-4xl">{location?.markerEmoji ?? "📍"}</span>
          </div>
        )}
        <div className="cq-loc-hero-gradient" />
      </div>

      {showBack ? (
        <div className="cq-loc-hero-top">
          <button
            type="button"
            onClick={onBack}
            className="cq-loc-hero-back touch-manipulation"
            aria-label="Close location details"
          >
            <X className="h-4 w-4 shrink-0" strokeWidth={2.4} />
            Close
          </button>
        </div>
      ) : null}

      <div className="cq-loc-hero-content">
        <p className="cq-loc-hero-badge">
          <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.4} aria-hidden />
          LOCATION
        </p>
        <h2 id="realm-sheet-title" className="cq-loc-hero-title">
          {displayName}
        </h2>
        <p className="cq-loc-hero-desc">{description}</p>

        {pills.length > 0 ? (
          <div className="cq-loc-hero-pills" role="list" aria-label="Location tags">
            {pills.map((pill) => (
              <span
                key={pill.id}
                role="listitem"
                className={`cq-loc-hero-pill cq-loc-hero-pill--${pill.tone}`}
              >
                {pill.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
