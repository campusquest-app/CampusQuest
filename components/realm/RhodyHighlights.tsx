"use client";

import { ChevronRight, Play } from "lucide-react";
import type { AthleticsHighlight } from "@/lib/realm/discoverySheet";

export function RhodyHighlights({
  items,
  onViewAthletics,
}: {
  items: AthleticsHighlight[];
  onViewAthletics?: () => void;
}) {
  return (
    <section className="cq-rhody-highlights" aria-label="Rhody Highlights">
      <header className="cq-rhody-highlights__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/rhody-r.png" alt="" className="cq-rhody-highlights__mark" />
        <h2 className="cq-rhody-highlights__title">Rhody Highlights</h2>
        <button
          type="button"
          className="cq-rhody-highlights__more"
          aria-label="View athletics"
          onClick={onViewAthletics}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </header>
      <ul className="cq-rhody-highlights__list">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className="cq-rhody-highlights__row" onClick={onViewAthletics}>
              <span className="cq-rhody-highlights__thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.imageUrl ?? "/quad-feed/gym.jpg"} alt="" loading="lazy" />
                <span className="cq-rhody-highlights__play" aria-hidden>
                  <Play className="h-3 w-3" fill="currentColor" strokeWidth={0} />
                </span>
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
      <button type="button" className="cq-rhody-highlights__cta" onClick={onViewAthletics}>
        View Athletics →
      </button>
    </section>
  );
}
