"use client";

import { useMemo, useState } from "react";
import type { GroupedMapLocation, MapEventPin } from "@/lib/mapLocationGroups";
import { buildRhodyHighlights, type AthleticsHighlight } from "@/lib/realm/discoverySheet";
import type { HighlightEventRecommendation, HighlightRecommendationMode } from "@/lib/realm/highlightEventRecommendations";
import { DiscoverForYou, DiscoverRecommendations } from "./DiscoverForYou";
import { RhodyHighlights } from "./RhodyHighlights";

function youtubeEmbedUrl(videoId: string, autoplay: boolean): string | null {
  if (!/^[\w-]{6,16}$/.test(videoId)) return null;
  const params = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    autoplay: autoplay ? "1" : "0",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function RealmHighlightsSheet({
  recommendations,
  recommendationMode,
  groups,
  loading,
  onOpenEvent,
  onViewAthletics,
  onFindMyCampus,
  onViewAllRecommendations,
}: {
  recommendations: HighlightEventRecommendation[];
  recommendationMode: HighlightRecommendationMode;
  groups: GroupedMapLocation[];
  loading: boolean;
  onOpenEvent: (event: MapEventPin) => void;
  onViewAthletics?: () => void;
  onFindMyCampus?: () => void;
  onViewAllRecommendations?: () => void;
}) {
  const [playing, setPlaying] = useState<AthleticsHighlight | null>(null);
  const highlights = useMemo(
    () => buildRhodyHighlights(groups, new Date(), 8, undefined, { padPlaceholders: false }),
    [groups],
  );
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const embedUrl = playing?.youtubeVideoId ? youtubeEmbedUrl(playing.youtubeVideoId, !reducedMotion) : null;
  const empty = !loading && highlights.length === 0 && recommendationMode === "empty";

  return (
    <div className="cq-realm-highlights">
      {embedUrl ? (
        <div className="cq-realm-highlights__player">
          <iframe
            src={embedUrl}
            title={playing?.title ?? "Rhody highlight"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : null}
      {loading ? <p className="cq-realm-highlights__status">Loading recommendations…</p> : null}
      {empty ? (
        <p className="cq-realm-highlights__status">No highlights around campus right now.</p>
      ) : null}
      <DiscoverForYou onStartGeniusMining={onFindMyCampus} />
      <RhodyHighlights
        items={highlights}
        onViewAthletics={onViewAthletics}
        onPlayItem={(item) => {
          if (!item.youtubeVideoId) return false;
          setPlaying(item);
          return true;
        }}
      />
      {loading ? null : (
        <DiscoverRecommendations
          items={recommendations}
          mode={recommendationMode}
          onViewAll={onViewAllRecommendations}
          onOpenItem={(item) => onOpenEvent(item.event)}
        />
      )}
    </div>
  );
}
