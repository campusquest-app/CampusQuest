"use client";

import { useState } from "react";
import {
  eventArtworkAfterError,
  resolveEventArtwork,
  URI_RAMS_EVENT_FALLBACK_SRC,
  type EventArtworkKind,
} from "@/lib/client/eventArtwork";

/**
 * Event artwork. Real photos keep cover fit inside the existing frame.
 * Missing or broken artwork shows the Rams logo, contained on navy.
 */
export function EventArtwork({
  imageUrl,
  bannerUrl,
  alt,
  className,
  loading = "lazy",
  onFallback,
}: {
  imageUrl?: string | null;
  bannerUrl?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  onFallback?: () => void;
}) {
  const sourcesKey = `${imageUrl ?? ""}\n${bannerUrl ?? ""}`;
  const initial = resolveEventArtwork({ imageUrl, bannerUrl });
  const [choice, setChoice] = useState(initial);
  const [seenKey, setSeenKey] = useState(sourcesKey);
  let displayed = choice;
  if (seenKey !== sourcesKey) {
    displayed = initial;
    setSeenKey(sourcesKey);
    setChoice(initial);
  }

  function fail(kind: EventArtworkKind) {
    const next = eventArtworkAfterError({ failedKind: kind, imageUrl, bannerUrl });
    setChoice(next);
    if (next.kind === "fallback") onFallback?.();
  }

  const fallback = displayed.kind === "fallback";

  return (
    <span
      className={`cq-event-artwork${fallback ? " cq-event-artwork--fallback" : ""}${className ? ` ${className}` : ""}`}
      data-cq-event-artwork={displayed.kind}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- event photos and the Rams mark are remote or static files */}
      <img
        src={displayed.src}
        alt={fallback ? "" : alt}
        className="cq-event-artwork__img"
        loading={loading}
        decoding="async"
        data-cq-event-artwork-src={displayed.kind === "fallback" ? URI_RAMS_EVENT_FALLBACK_SRC : displayed.src}
        onError={() => {
          if (displayed.kind !== "fallback") fail(displayed.kind);
        }}
      />
    </span>
  );
}
