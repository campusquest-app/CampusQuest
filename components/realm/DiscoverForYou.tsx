"use client";

import { ChevronRight, ClipboardList, Drama, Rocket, Sparkles, Users, Volleyball } from "lucide-react";
import { compactDiscoveryReason } from "@/lib/realm/discoverySheet";
import type { MapRecommendationItem } from "@/lib/realm/mapRecommendations";

type DiscoverSlot = {
  id: string;
  kind: MapRecommendationItem["kind"];
  title: string;
  locationName: string;
  timeLabel: string | null;
  reasonLabel: string | null;
  happeningToday: boolean;
};

function discoverIconKey(item: DiscoverSlot): "quest" | "sport" | "arts" | "people" {
  const hay = `${item.title} ${item.kind} ${item.reasonLabel ?? ""}`.toLowerCase();
  if (
    hay.includes("volley") ||
    hay.includes("soccer") ||
    hay.includes("basket") ||
    hay.includes("football") ||
    hay.includes("athlet")
  ) {
    return "sport";
  }
  if (
    hay.includes("art") ||
    hay.includes("theatre") ||
    hay.includes("theater") ||
    hay.includes("performance") ||
    hay.includes("music") ||
    hay.includes("drama")
  ) {
    return "arts";
  }
  if (hay.includes("club") || hay.includes("meet") || hay.includes("people") || hay.includes("community")) {
    return "people";
  }
  if (item.kind === "quest" || hay.includes("startup") || hay.includes("workshop") || hay.includes("entrepreneur")) {
    return "quest";
  }
  return item.kind === "place" ? "people" : "quest";
}

function DiscoverRowIcon({ icon }: { icon: ReturnType<typeof discoverIconKey> }) {
  const common = { className: "h-3 w-3", strokeWidth: 2.1 } as const;
  if (icon === "sport") return <Volleyball {...common} />;
  if (icon === "arts") return <Drama {...common} />;
  if (icon === "people") return <Users {...common} />;
  return <Rocket {...common} />;
}

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
  const slots: DiscoverSlot[] =
    rows.length > 0
      ? rows
      : Array.from({ length: 4 }, (_, index) => ({
          id: `discover-slot-${index}`,
          kind: index === 0 ? "quest" : index === 1 ? "event" : index === 2 ? "event" : "place",
          title: "Recommendations will appear here",
          locationName: "Campus",
          timeLabel: null,
          reasonLabel: "Recommended for you",
          happeningToday: false,
        }));
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
          <ClipboardList className="cq-discover-foryou__survey-icon" strokeWidth={2} aria-hidden />
          <div className="cq-discover-foryou__survey-copy">
            <p className="cq-discover-foryou__survey-title">Genius Mining Survey</p>
            <p className="cq-discover-foryou__survey-body">
              Take a quick survey and we&apos;ll find events, clubs, activities, places, and experiences you might actually enjoy.
            </p>
          </div>
        </div>
        <button type="button" className="cq-discover-foryou__start" onClick={onStartGeniusMining}>
          Start Survey →
        </button>
      </div>

      <ul className="cq-discover-foryou__list">
        {slots.map((item, index) => {
          const liveItem = rows.find((row) => row.id === item.id) ?? null;
          const icon = discoverIconKey(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                className="cq-discover-foryou__row"
                onClick={() => {
                  if (liveItem) onOpenItem?.(liveItem);
                  else onViewAll?.();
                }}
              >
                <span className={`cq-discover-foryou__icon cq-discover-foryou__icon--${icon}`} aria-hidden>
                  <DiscoverRowIcon icon={icon} />
                </span>
                <span className="cq-discover-foryou__copy">
                  <span className={`cq-discover-foryou__reason cq-discover-foryou__reason--${index % 4}`}>
                    {compactDiscoveryReason(item.reasonLabel, item.happeningToday)}
                  </span>
                  <span className="cq-discover-foryou__name">{item.title}</span>
                  <span className="cq-discover-foryou__meta">
                    {[item.timeLabel, item.locationName].filter(Boolean).join(" • ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="cq-discover-foryou__cta" onClick={onViewAll}>
        View All Recommendations →
      </button>
    </section>
  );
}
