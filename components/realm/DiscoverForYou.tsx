"use client";

import { ChevronRight, Drama, Rocket, Sparkles, Users, Volleyball } from "lucide-react";
import { BRAND_KNIGHT } from "@/lib/onboarding/taxonomy";
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
  const common = { className: "h-3.5 w-3.5", strokeWidth: 2.1 } as const;
  if (icon === "sport") return <Volleyball {...common} />;
  if (icon === "arts") return <Drama {...common} />;
  if (icon === "people") return <Users {...common} />;
  return <Rocket {...common} />;
}

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

/** Recommendation rows — rendered below Rhody Highlights in the discovery stack. */
export function DiscoverRecommendations({
  items,
  onViewAll,
  onOpenItem,
}: {
  items: MapRecommendationItem[];
  onViewAll?: () => void;
  onOpenItem?: (item: MapRecommendationItem) => void;
}) {
  const rows = items.slice(0, 4);
  if (rows.length === 0) return null;

  return (
    <section className="cq-discover-recs" aria-label="Recommended for you">
      <header className="cq-discover-recs__head">
        <h2 className="cq-discover-recs__title">Recommended For You</h2>
        <button type="button" className="cq-discover-recs__more" aria-label="View all recommendations" onClick={onViewAll}>
          <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </header>
      <ul className="cq-discover-recs__list">
        {rows.map((item, index) => {
          const slot: DiscoverSlot = {
            id: item.id,
            kind: item.kind,
            title: item.title,
            locationName: item.locationName,
            timeLabel: item.timeLabel,
            reasonLabel: item.reasonLabel,
            happeningToday: item.happeningToday,
          };
          const icon = discoverIconKey(slot);
          return (
            <li key={item.id}>
              <button type="button" className="cq-discover-recs__row" onClick={() => onOpenItem?.(item)}>
                <span className={`cq-discover-foryou__icon cq-discover-foryou__icon--${icon}`} aria-hidden>
                  <DiscoverRowIcon icon={icon} />
                </span>
                <span className="cq-discover-recs__copy">
                  <span className={`cq-discover-foryou__reason cq-discover-foryou__reason--${index % 4}`}>
                    {compactDiscoveryReason(item.reasonLabel, item.happeningToday)}
                  </span>
                  <span className="cq-discover-recs__name">{item.title}</span>
                  <span className="cq-discover-recs__meta">
                    {[item.timeLabel, item.locationName].filter(Boolean).join(" • ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="cq-discover-recs__cta" onClick={onViewAll}>
        View All Recommendations →
      </button>
    </section>
  );
}
