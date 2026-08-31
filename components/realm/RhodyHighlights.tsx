"use client";

import { Play } from "lucide-react";
import type { AthleticsHighlight } from "@/lib/realm/discoverySheet";
import { openExternalUrl } from "@/lib/client/capacitorNative";

function openHighlight(item: AthleticsHighlight, onViewAthletics?: () => void) {
  const target = item.url?.trim() || item.broadcastUrl?.trim() || "";
  if (target) {
    void openExternalUrl(target);
    return;
  }
  onViewAthletics?.();
}

export function RhodyHighlights({
  items,
  onViewAthletics,
}: {
  items: AthleticsHighlight[];
  onViewAthletics?: () => void;
}) {
  return (
    <section className="cq-rhody-highlights cq-rhody-highlights--wide" aria-label="Rhody Highlights">
      <header className="cq-rhody-highlights__head">
        <span className="cq-rhody-highlights__mark-wrap" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/rhody-r.png"
            alt=""
            width={102}
            height={114}
            decoding="async"
            className="cq-rhody-highlights__mark"
          />
        </span>
        <h2 className="cq-rhody-highlights__title">Rhody Highlights</h2>
        <button type="button" className="cq-rhody-highlights__cta-inline" onClick={onViewAthletics}>
          View Athletics →
        </button>
      </header>
      <ul className="cq-rhody-highlights__list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="cq-rhody-highlights__row"
              aria-label={item.playable ? `Play ${item.title}` : item.title}
              onClick={() => openHighlight(item, onViewAthletics)}
            >
              <span className="cq-rhody-highlights__thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl ?? "/quad-feed/gym.jpg"}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    const img = event.currentTarget;
                    const fallback = item.imageFallbackUrl?.trim();
                    if (fallback && img.src !== fallback) {
                      img.src = fallback;
                      return;
                    }
                    if (!img.src.endsWith("/quad-feed/gym.jpg")) {
                      img.src = "/quad-feed/gym.jpg";
                    }
                  }}
                />
                <span className="cq-rhody-highlights__play" aria-hidden>
                  <Play className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
                </span>
                {item.durationLabel ? (
                  <span className="cq-rhody-highlights__duration">{item.durationLabel}</span>
                ) : null}
              </span>
              <span className="cq-rhody-highlights__copy">
                <span className="cq-rhody-highlights__sport">{item.sport}</span>
                <span className="cq-rhody-highlights__name">{item.title}</span>
                {item.timeLabel ? <span className="cq-rhody-highlights__time">{item.timeLabel}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
