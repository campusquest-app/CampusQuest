"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { EventArtwork } from "@/components/events/EventArtwork";
import { BRAND_KNIGHT } from "@/lib/onboarding/taxonomy";
import type { HighlightEventRecommendation, HighlightRecommendationMode } from "@/lib/realm/highlightEventRecommendations";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";

/** Flip to true to restore the Genius Mining survey card in Realm discovery. */
export const SHOW_GENIUS_MINING_SURVEY = false;

/** Full-width Genius Mining survey feature card. */
export function DiscoverForYou({
  onStartGeniusMining,
}: {
  onStartGeniusMining?: () => void;
  /** @deprecated Recommendations moved below Rhody Highlights; kept for call-site compatibility. */
  items?: MapRecommendationItem[];
  onViewAll?: () => void;
  onOpenItem?: (item: MapRecommendationItem) => void;
}) {
  if (!SHOW_GENIUS_MINING_SURVEY) return null;

  return (
    <section className="cq-discover-foryou cq-discover-foryou--hero" aria-label="Discover For You">
      <header className="cq-discover-foryou__head">
        <Sparkles className="cq-discover-foryou__sparkle" strokeWidth={2.2} aria-hidden />
        <h2 className="cq-discover-foryou__title">Discover For You</h2>
      </header>

      <div className="cq-discover-foryou__survey">
        <div className="cq-discover-foryou__survey-main">
          <div className="cq-discover-foryou__survey-copy">
            <p className="cq-discover-foryou__survey-title">
              <span className="cq-discover-foryou__survey-title-line">Genius Mining</span>
              <span className="cq-discover-foryou__survey-title-line">Survey</span>
            </p>
            <p className="cq-discover-foryou__survey-body">
              Take a quick survey and we&apos;ll find events, clubs, activities, places, and experiences
              tailored just for you.
            </p>
          </div>
          <div className="cq-discover-foryou__knight" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND_KNIGHT.welcoming}
              alt=""
              width={240}
              height={240}
              decoding="async"
              className="cq-discover-foryou__knight-img"
            />
          </div>
        </div>
        <button type="button" className="cq-discover-foryou__start" onClick={onStartGeniusMining}>
          Start Survey →
        </button>
      </div>
    </section>
  );
}

/** Event recommendations rendered below Rhody Highlights. */
export function DiscoverRecommendations({
  items,
  mode,
  onViewAll,
  onOpenItem,
}: {
  items: HighlightEventRecommendation[];
  mode: HighlightRecommendationMode;
  onViewAll?: () => void;
  onOpenItem?: (item: HighlightEventRecommendation) => void;
}) {
  const rows = items.slice(0, 4);

  return (
    <section className="cq-discover-recs" aria-label="Recommended for you">
      <header className="cq-discover-recs__head">
        <h2 className="cq-discover-recs__title">Recommended For You</h2>
        {rows.length > 0 ? (
          <button type="button" className="cq-discover-recs__more" aria-label="View all recommendations" onClick={onViewAll}>
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </button>
        ) : null}
      </header>
      {mode === "empty" ? (
        <div className="cq-discover-recs__empty">
          <p>No matching events are available right now.</p>
          <button type="button" className="cq-discover-recs__cta" onClick={onViewAll}>
            Explore All Events
          </button>
        </div>
      ) : (
        <>
          <ul className="cq-discover-recs__list">
            {rows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="cq-discover-recs__row"
                  aria-label={`${item.title}, ${item.timeLabel}, ${item.locationName}`}
                  onClick={() => onOpenItem?.(item)}
                >
                  <span className="cq-discover-recs__thumb">
                    <EventArtwork imageUrl={item.imageUrl} alt="" className="h-full w-full" />
                  </span>
                  <span className="cq-discover-recs__copy">
                    <span className="cq-discover-recs__name">{item.title}</span>
                    <span className="cq-discover-recs__meta">{item.timeLabel}</span>
                    {item.locationName ? <span className="cq-discover-recs__meta">{item.locationName}</span> : null}
                    {item.interestLabel ? <span className="cq-discover-recs__interest">{item.interestLabel}</span> : null}
                    <span className="cq-discover-recs__why">{item.explanation}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="cq-discover-recs__cta" onClick={onViewAll}>
            View All Recommendations →
          </button>
        </>
      )}
    </section>
  );
}
