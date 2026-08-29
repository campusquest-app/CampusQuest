"use client";

import { Bookmark } from "lucide-react";
import { walkTimeLabel, type NearbyPlaceCard, type WalkTimeStatus } from "@/lib/realm/discoverySheet";

function WalkingPersonIcon() {
  return (
    <svg className="cq-nearby-place-card__walk-icon" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8.2" cy="2.35" r="1.35" fill="currentColor" />
      <path
        d="M7.1 4.4c.85-.18 1.7.28 2.05 1.05l.7 1.55 1.85.35c.28.05.46.32.4.6-.06.28-.32.46-.6.4l-2.15-.4a.7.7 0 0 1-.52-.42L8.4 6.4l-.55 1.7 1.7 1.35 1.55 3.15a.55.55 0 0 1-.98.5L8.7 10.3 6.7 8.7l-.85 2.55-1.85 1.55a.55.55 0 0 1-.7-.85l2.05-1.7.95-2.85L5.3 6.15a.55.55 0 1 1 .7-.85L7.1 6.4V4.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function RecommendedPlacesCarousel({
  items,
  savedIds,
  walkStatus = "unavailable",
  onOpen,
  onToggleSave,
}: {
  items: NearbyPlaceCard[];
  savedIds: Set<string>;
  walkStatus?: WalkTimeStatus;
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
          const pending = item.walkMinutes == null;
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
                  <span className={`cq-nearby-place-card__walk${pending ? " cq-nearby-place-card__walk--pending" : ""}`}>
                    <WalkingPersonIcon />
                    {walkTimeLabel(item.walkMinutes, walkStatus)}
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
