"use client";

import { useState } from "react";
import {
  eventArtworkAfterError,
  resolveEventArtwork,
  resolveEventFallbackSrc,
  type EventArtworkFallbackBrand,
  type EventArtworkKind,
} from "@/lib/client/eventArtwork";

/**
 * Event artwork. Real photos keep cover fit inside the existing frame.
 * Missing or broken artwork shows the Rams or CampusQuest mark, contained on navy.
 */
export function EventArtwork({
  imageUrl,
  bannerUrl,
  alt,
  className,
  loading = "lazy",
  fallbackBrand = "uri",
  onFallback,
}: {
  imageUrl?: string | null;
  bannerUrl?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallbackBrand?: EventArtworkFallbackBrand;
  onFallback?: () => void;
}) {
  const sourcesKey = `${imageUrl ?? ""}\n${bannerUrl ?? ""}\n${fallbackBrand}`;
  const initial = resolveEventArtwork({ imageUrl, bannerUrl, fallbackBrand });
  const [choice, setChoice] = useState(initial);
  const [seenKey, setSeenKey] = useState(sourcesKey);
  let displayed = choice;
  if (seenKey !== sourcesKey) {
    displayed = initial;
    setSeenKey(sourcesKey);
    setChoice(initial);
  }

  function fail(kind: EventArtworkKind) {
    const next = eventArtworkAfterError({ failedKind: kind, imageUrl, bannerUrl, fallbackBrand });
    setChoice(next);
    if (next.kind === "fallback") onFallback?.();
  }

  const fallback = displayed.kind === "fallback";
  const fallbackSrc = resolveEventFallbackSrc(fallbackBrand);

  return (
    <span
      className={`cq-event-artwork${fallback ? " cq-event-artwork--fallback" : ""}${
        fallback ? ` cq-event-artwork--fallback-${fallbackBrand}` : ""
      }${className ? ` ${className}` : ""}`}
      data-cq-event-artwork={displayed.kind}
      data-cq-event-fallback={fallback ? fallbackBrand : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- event photos and brand marks are remote or static files */}
      <img
        src={displayed.src}
        alt={fallback ? "" : alt}
        className="cq-event-artwork__img"
        loading={loading}
        decoding="async"
        data-cq-event-artwork-src={fallback ? fallbackSrc : displayed.src}
        onError={() => {
          if (displayed.kind !== "fallback") fail(displayed.kind);
        }}
      />
    </span>
  );
}
