"use client";

import { useState } from "react";
import {
  eventArtworkAfterError,
  resolveEventArtwork,
  resolveEventFallbackSrc,
  type EventArtworkFallbackBrand,
  type EventArtworkKind,
} from "@/lib/client/eventArtwork";
import type { EventArtworkFit } from "@/lib/client/eventArtworkFit";

/**
 * Event artwork. Discovery cards choose contain vs cover via `fit`.
 * Missing or broken artwork shows the Rams or CampusQuest mark, contained on navy.
 */
export function EventArtwork({
  imageUrl,
  bannerUrl,
  alt,
  className,
  loading = "lazy",
  fallbackBrand = "uri",
  fit = "contain",
  showBlurFill = false,
  onFallback,
  onNaturalAspect,
}: {
  imageUrl?: string | null;
  bannerUrl?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallbackBrand?: EventArtworkFallbackBrand;
  /** contain = full flyer/logo; cover = fill-frame photography */
  fit?: EventArtworkFit;
  /** Soft blurred duplicate behind contained photos (not brand marks). */
  showBlurFill?: boolean;
  onFallback?: () => void;
  onNaturalAspect?: (aspect: number) => void;
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
  const blurEnabled = showBlurFill && !fallback && fit === "contain";

  return (
    <span
      className={`cq-event-artwork cq-event-artwork--fit-${fit}${
        fallback ? " cq-event-artwork--fallback" : ""
      }${fallback ? ` cq-event-artwork--fallback-${fallbackBrand}` : ""}${
        blurEnabled ? " cq-event-artwork--blur-fill" : ""
      }${className ? ` ${className}` : ""}`}
      data-cq-event-artwork={displayed.kind}
      data-cq-event-fallback={fallback ? fallbackBrand : undefined}
      data-cq-event-fit={fit}
    >
      {blurEnabled ? (
        // eslint-disable-next-line @next/next/no-img-element -- decorative blur fill of the same asset
        <img
          src={displayed.src}
          alt=""
          aria-hidden
          className="cq-event-artwork__blur"
          loading={loading}
          decoding="async"
          draggable={false}
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- event photos and brand marks are remote or static files */}
      <img
        src={displayed.src}
        alt={fallback ? "" : alt}
        className="cq-event-artwork__img"
        loading={loading}
        decoding="async"
        data-cq-event-artwork-src={fallback ? fallbackSrc : displayed.src}
        onLoad={(event) => {
          const img = event.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            onNaturalAspect?.(img.naturalWidth / img.naturalHeight);
          }
        }}
        onError={() => {
          if (displayed.kind !== "fallback") fail(displayed.kind);
        }}
      />
    </span>
  );
}
