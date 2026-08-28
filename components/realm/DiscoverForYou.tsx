"use client";

import { ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";

export function DiscoverForYou({
  items,
  onStartGeniusMining,
  onViewAll,
  onOpenItem,
}: {
  items: MapRecommendationItem[];
  onStartGeniusMining?: () => void;
  onViewAll?: () => void;
  onOpenItem?: (item: MapRecommendationItem) => void;
}) {
  const rows = items.slice(0, 4);
  return (
    <section className="cq-discover-foryou" aria-label="Discover For You">
      <header className="cq-discover-foryou__head">
        <Sparkles className="h-3.5 w-3.5 text-cyan-200" strokeWidth={2.2} aria-hidden />
        <h2 className="cq-discover-foryou__title">Discover For You</h2>
        <button type="button" className="cq-discover-foryou__more" aria-label="View all recommendations" onClick={onViewAll}>
          <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </header>

      <div className="cq-discover-foryou__survey">
        <div className="cq-discover-foryou__survey-row">
          <ClipboardList className="h-5 w-5 shrink-0 text-cyan-100" strokeWidth={2} aria-hidden />
          <div className="cq-discover-foryou__survey-copy">
            <p className="cq-discover-foryou__survey-title">Find My Campus</p>
            <p className="cq-discover-foryou__survey-body">
              Take a quick Genius Mining check-in and we&apos;ll find events, clubs, activities, places, and experiences you might actually enjoy.
            </p>
          </div>
        </div>
        <button type="button" className="cq-discover-foryou__start" onClick={onStartGeniusMining}>
          Start →
        </button>
      </div>

      <ul className="cq-discover-foryou__list">
        {rows.map((item) => (
          <li key={item.id}>
            <button type="button" className="cq-discover-foryou__row" onClick={() => onOpenItem?.(item)}>
              <span className={`cq-discover-foryou__icon cq-discover-foryou__icon--${item.kind}`} aria-hidden />
              <span className="cq-discover-foryou__copy">
                <span className="cq-discover-foryou__reason">{item.reasonLabel ?? "Recommended for you"}</span>
                <span className="cq-discover-foryou__name">{item.title}</span>
                <span className="cq-discover-foryou__meta">
                  {[item.timeLabel, item.locationName].filter(Boolean).join(" · ")}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/35" strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="cq-discover-foryou__empty">Personalized picks will appear as campus events are published.</p>
      ) : null}
      <button type="button" className="cq-discover-foryou__cta" onClick={onViewAll}>
        View All Recommendations
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
    </section>
  );
}
