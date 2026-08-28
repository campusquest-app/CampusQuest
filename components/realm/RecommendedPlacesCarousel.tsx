"use client";

import { Bookmark, Footprints } from "lucide-react";
import type { NearbyPlaceCard } from "@/lib/realm/discoverySheet";

export function RecommendedPlacesCarousel({
  items,
  savedIds,
  onOpen,
  onToggleSave,
}: {
  items: NearbyPlaceCard[];
  savedIds: Set<string>;
  onOpen: (item: NearbyPlaceCard) => void;
  onToggleSave: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="cq-nearby-places" aria-label="Recommended around campus">
      <h2 className="cq-nearby-places__title">Recommended Around Campus</h2>
      <div
        className="cq-nearby-places__scroller"
        role="list"
        data-cq-horizontal-scroll="true"
        data-no-drawer-swipe="true"
      >
        {items.map((item) => {
          const saved = savedIds.has(item.id);
          return (
            <article key={item.id} role="listitem" className="cq-nearby-place-card">
              <button type="button" className="cq-nearby-place-card__hit" onClick={() => onOpen(item)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.imageAlt}
                  className="cq-nearby-place-card__image"
                  style={{ objectPosition: item.imageObjectPosition }}
                  loading="lazy"
                />
                <span className="cq-nearby-place-card__copy">
                  <span className="cq-nearby-place-card__name">{item.name}</span>
                  <span className="cq-nearby-place-card__cat">{item.categoryLabel}</span>
                  <span className="cq-nearby-place-card__walk">
                    <Footprints className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                    {item.walkMinutes} min walk
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`cq-nearby-place-card__save${saved ? " cq-nearby-place-card__save--on" : ""}`}
                aria-label={saved ? `Remove ${item.name} from saved places` : `Save ${item.name}`}
                aria-pressed={saved}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSave(item.id);
                }}
              >
                <Bookmark className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
