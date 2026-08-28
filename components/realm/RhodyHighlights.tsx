"use client";

import { ChevronRight } from "lucide-react";
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
        <img src="/assets/uri-ram-mascot.png" alt="" className="cq-rhody-highlights__mark" />
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
      {items.length === 0 ? (
        <p className="cq-rhody-highlights__empty">Upcoming Rhody games will show up here.</p>
      ) : (
        <ul className="cq-rhody-highlights__list">
          {items.map((item) => (
            <li key={item.id}>
              <button type="button" className="cq-rhody-highlights__row" onClick={onViewAthletics}>
                <span className="cq-rhody-highlights__thumb">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="cq-rhody-highlights__thumb-fallback" aria-hidden />
                  )}
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
      )}
      <button type="button" className="cq-rhody-highlights__cta" onClick={onViewAthletics}>
        View Athletics
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
    </section>
  );
}
