import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RealmMapMarker } from "@/components/realm/RealmMapMarker";
import { markerRevealOpacity } from "@/components/realm/useMapZoom";
import {
  canonicalMarkerRevealOpacity,
  isForYouMarkerVisible,
  type MapMarkerFilter,
} from "@/lib/realm/mapMarkerFilters";

/**
 * "For You" decides which markers are shown. It must never change how a
 * permanent campus marker looks — only an explicit user tap does that.
 */

const PUBLIC_FILTERS: MapMarkerFilter[] = ["for_you", "live", "events", "places"];

/** Mirrors how GoogleRealmMap derives marker style props for a landmark. */
function markerStyleProps(args: {
  filter: MapMarkerFilter;
  markerId: string;
  major: boolean;
  recommended: boolean;
  selected: boolean;
  mapZoom: number;
  zoomTier: "far" | "mid" | "near";
  activityState: "idle" | "active" | "hot" | "selected";
}) {
  return {
    revealOpacity: canonicalMarkerRevealOpacity(
      markerRevealOpacity(args.mapZoom, args.major),
      args.selected,
    ),
    hideLabel: args.zoomTier === "far" && args.activityState === "idle" && !args.selected,
    zIndexBoost: args.selected ? 120 : 60,
  };
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(RealmMapMarker, props as never));
}

describe("recommendation state does not change canonical marker styling", () => {
  it("renders a recommended and an unrecommended marker identically", () => {
    const base = {
      filter: "for_you" as const,
      major: true,
      selected: false,
      mapZoom: 16,
      zoomTier: "near" as const,
      activityState: "idle" as const,
    };
    const recommended = markerStyleProps({ ...base, markerId: "the-quad", recommended: true });
    const notRecommended = markerStyleProps({ ...base, markerId: "library", recommended: false });
    expect(recommended).toEqual(notRecommended);
  });

  it("produces identical markup for recommended and unrecommended pins", () => {
    const style = markerStyleProps({
      filter: "for_you",
      markerId: "library",
      major: true,
      recommended: false,
      selected: false,
      mapZoom: 16,
      zoomTier: "near",
      activityState: "idle",
    });
    const html = render({
      variant: "default",
      label: "Library",
      color: "electric-blue",
      activityState: "idle",
      ...style,
    });

    // No deemphasis, dimming, or extra emphasis from personalization.
    expect(html).not.toContain("cq-realm-marker--deemphasized");
    expect(html).not.toContain("cq-realm-marker--faded");
    expect(html).toContain("opacity:1");
    expect(html).toContain("marker-label");
  });

  it("keeps marker style identical when switching For You / Live Now / Events / Places", () => {
    const styles = PUBLIC_FILTERS.map((filter) =>
      markerStyleProps({
        filter,
        markerId: "library",
        major: true,
        // Recommendation membership flips with the filter; style must not.
        recommended: filter === "for_you",
        selected: false,
        mapZoom: 15,
        zoomTier: "mid",
        activityState: "idle",
      }),
    );
    for (const style of styles) {
      expect(style).toEqual(styles[0]);
    }
  });

  it("still lets an explicit user tap change the marker", () => {
    const idle = markerStyleProps({
      filter: "for_you",
      markerId: "library",
      major: true,
      recommended: true,
      selected: false,
      mapZoom: 14,
      zoomTier: "far",
      activityState: "idle",
    });
    const tapped = markerStyleProps({
      filter: "for_you",
      markerId: "library",
      major: true,
      recommended: true,
      selected: true,
      mapZoom: 14,
      zoomTier: "far",
      activityState: "selected",
    });

    expect(tapped.revealOpacity).toBe(1);
    expect(tapped.hideLabel).toBe(false);
    expect(idle.hideLabel).toBe(true);
    expect(tapped.zIndexBoost).toBeGreaterThan(idle.zIndexBoost);
    expect(render({ variant: "default", label: "Library", activityState: "selected", ...tapped })).toContain(
      "cq-realm-marker--state-selected",
    );
  });

  it("never dims an optional pin below the canonical floor because of recommendations", () => {
    for (const zoom of [13, 14.5, 15.5, 17]) {
      const style = markerStyleProps({
        filter: "for_you",
        markerId: "side-pin",
        major: false,
        recommended: false,
        selected: false,
        mapZoom: zoom,
        zoomTier: "mid",
        activityState: "idle",
      });
      expect(style.revealOpacity).toBeGreaterThanOrEqual(0.92);
    }
  });
});

describe("For You still controls marker visibility", () => {
  it("shows majors and recommended pins, hides unrelated optional pins", () => {
    const recommendedMarkerIds = new Set(["side-pin"]);
    const visible = (markerId: string, major: boolean) =>
      isForYouMarkerVisible({ markerId, major, selected: false, recommendedMarkerIds });

    expect(visible("library", true)).toBe(true);
    expect(visible("side-pin", false)).toBe(true);
    expect(visible("other-pin", false)).toBe(false);
  });
});
