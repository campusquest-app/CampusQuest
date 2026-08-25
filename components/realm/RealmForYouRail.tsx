"use client";

import { useEffect, useRef } from "react";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";
import { compactRecommendationSecondaryLine } from "@/lib/realm/forYouRailCopy";

export function RealmForYouRail({
  items,
  selectedId,
  happeningTodayCount,
  onSelect,
  onView,
  onWalkHere,
  onInterested,
}: {
  items: MapRecommendationItem[];
  selectedId: string | null;
  happeningTodayCount: number;
  onSelect: (item: MapRecommendationItem) => void;
  onView: (item: MapRecommendationItem) => void;
  onWalkHere?: (item: MapRecommendationItem) => void;
  onInterested?: (item: MapRecommendationItem) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (!selectedId) return;
    const node = cardRefs.current[selectedId];
    if (!node) return;
    node.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedId]);

  if (items.length === 0) return null;

  return (
    <section className="cq-realm-foryou-rail" aria-label="Recommended around campus">
      <header className="cq-realm-foryou-rail__head">
        <p className="cq-realm-foryou-rail__title">Recommended around campus</p>
        {happeningTodayCount > 0 ? (
          <p className="cq-realm-foryou-rail__meta">{happeningTodayCount} happening today</p>
        ) : null}
      </header>
      <div
        ref={scrollerRef}
        className="cq-realm-foryou-rail__scroller"
        role="list"
        data-no-drawer-swipe="true"
        data-cq-gesture-block="all"
        data-cq-horizontal-scroll="true"
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          const secondary = compactRecommendationSecondaryLine(item);
          const kindLabel = item.kind === "event" ? "Event" : item.kind === "quest" ? "Quest" : "Place";
          return (
            <article
              key={item.id}
              ref={(node) => {
                cardRefs.current[item.id] = node;
              }}
              role="listitem"
              tabIndex={0}
              aria-current={selected ? "true" : undefined}
              aria-label={`${item.title}. ${item.locationName}${item.timeLabel ? `. ${item.timeLabel}` : ""}`}
              className={`cq-realm-foryou-card${selected ? " cq-realm-foryou-card--selected" : ""}`}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item);
                }
              }}
            >
              <p className="cq-realm-foryou-card__kicker">{kindLabel}</p>
              <h3 className="cq-realm-foryou-card__title">{item.title}</h3>
              {secondary ? <p className="cq-realm-foryou-card__meta">{secondary}</p> : null}
              <p className="cq-realm-foryou-card__reason">{item.reasonLabel ?? "Recommended for you"}</p>
              <div className="cq-realm-foryou-card__actions">
                <button
                  type="button"
                  className="cq-realm-foryou-card__btn cq-realm-foryou-card__btn--primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    onView(item);
                  }}
                >
                  View
                </button>
                {item.campusRsvp && onInterested ? (
                  <button
                    type="button"
                    className="cq-realm-foryou-card__btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onInterested(item);
                    }}
                  >
                    Interested
                  </button>
                ) : null}
                {onWalkHere ? (
                  <button
                    type="button"
                    className="cq-realm-foryou-card__btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onWalkHere(item);
                    }}
                  >
                    Walk Here
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
