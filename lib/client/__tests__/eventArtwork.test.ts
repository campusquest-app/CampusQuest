import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAMPUSQUEST_EVENT_FALLBACK_SRC,
  eventArtworkAfterError,
  eventArtworkFallbackBrand,
  resolveEventArtwork,
  URI_RAMS_EVENT_FALLBACK_SRC,
  usableEventImageUrl,
} from "@/lib/client/eventArtwork";
import { eventCardImageUrl } from "@/lib/client/eventCardPresentation";
import type { CampusEventItem, FeedEvent } from "@/lib/client/eventFeedTypes";

function event(partial: {
  source?: string;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  category?: string;
}): FeedEvent {
  return {
    kind: "external",
    event: {
      id: "evt-1",
      source: partial.source ?? "urinvolved",
      title: "Club meeting",
      description: "",
      category: partial.category ?? "Clubs",
      location: "Memorial Union",
      venueName: "Memorial Union",
      address: null,
      startsAt: "2026-10-17T22:00:00.000Z",
      endsAt: null,
      organizationName: "Student Senate",
      imageUrl: partial.imageUrl ?? null,
      bannerUrl: partial.bannerUrl ?? null,
      eventUrl: null,
      tags: [],
      myRsvpStatus: null,
      imported: true,
    },
  };
}

const SURFACES = [
  "components/events/HappeningSoonCarousel.tsx",
  "components/events/EventDiscoveryCard.tsx",
  "components/events/EventDetailScreen.tsx",
  "components/realm/EventPinCard.tsx",
  "components/realm/locationDetail/LocationActivityCard.tsx",
  "components/realm/RhodyHighlights.tsx",
  "components/OrganizationsHub.tsx",
];

describe("event artwork fallback", () => {
  it("keeps a valid event image unchanged", () => {
    expect(usableEventImageUrl("  https://cdn.example/poster.jpg  ")).toBe("https://cdn.example/poster.jpg");
    expect(resolveEventArtwork({ imageUrl: "https://cdn.example/poster.jpg", bannerUrl: "https://cdn.example/banner.jpg" })).toEqual({
      src: "https://cdn.example/poster.jpg",
      kind: "event",
    });
    expect(eventCardImageUrl(event({ imageUrl: "https://cdn.example/game.jpg", source: "athletics", category: "Athletics" }))).toBe(
      "https://cdn.example/game.jpg",
    );
    expect(eventCardImageUrl(event({ imageUrl: "https://cdn.example/manual.jpg", source: "manual" }))).toBe(
      "https://cdn.example/manual.jpg",
    );
  });

  it("uses the provider banner when the event image is missing", () => {
    for (const imageUrl of [null, "", "   ", "null"]) {
      expect(resolveEventArtwork({ imageUrl, bannerUrl: "https://cdn.example/banner.jpg" })).toEqual({
        src: "https://cdn.example/banner.jpg",
        kind: "banner",
      });
    }
    expect(eventCardImageUrl(event({ imageUrl: null, bannerUrl: "https://cdn.example/urinvolved-banner.jpg", source: "urinvolved" }))).toBe(
      "https://cdn.example/urinvolved-banner.jpg",
    );
  });

  it("uses brand-aware fallbacks when image and banner are missing", () => {
    expect(resolveEventArtwork({ imageUrl: null, bannerUrl: null })).toEqual({
      src: URI_RAMS_EVENT_FALLBACK_SRC,
      kind: "fallback",
    });
    expect(URI_RAMS_EVENT_FALLBACK_SRC).toBe("/brand/uri-rams-ri.png");
    expect(CAMPUSQUEST_EVENT_FALLBACK_SRC).toBe("/campusquest-logo.png");
    expect(eventArtworkFallbackBrand({ kind: "campus" })).toBe("uri");
    expect(eventArtworkFallbackBrand({ kind: "external", source: "urinvolved" })).toBe("uri");
    expect(eventArtworkFallbackBrand({ kind: "external", source: "manual" })).toBe("campusquest");
    expect(eventCardImageUrl(event({ imageUrl: null, source: "athletics", category: "Athletics" }))).toBe(
      URI_RAMS_EVENT_FALLBACK_SRC,
    );
    expect(eventCardImageUrl(event({ imageUrl: "   ", source: "manual" }))).toBe(CAMPUSQUEST_EVENT_FALLBACK_SRC);
    expect(eventCardImageUrl({ kind: "campus", event: campus() })).toBe(URI_RAMS_EVENT_FALLBACK_SRC);
  });

  it("swaps a broken image to the banner, then the RI logo", () => {
    expect(
      eventArtworkAfterError({
        failedKind: "event",
        imageUrl: "https://cdn.example/missing.jpg",
        bannerUrl: "https://cdn.example/banner.jpg",
      }),
    ).toEqual({ src: "https://cdn.example/banner.jpg", kind: "banner" });
    expect(
      eventArtworkAfterError({
        failedKind: "banner",
        imageUrl: "https://cdn.example/missing.jpg",
        bannerUrl: "https://cdn.example/banner.jpg",
      }),
    ).toEqual({ src: URI_RAMS_EVENT_FALLBACK_SRC, kind: "fallback" });
    expect(
      eventArtworkAfterError({
        failedKind: "event",
        imageUrl: "https://cdn.example/missing.jpg",
        bannerUrl: null,
      }),
    ).toEqual({ src: URI_RAMS_EVENT_FALLBACK_SRC, kind: "fallback" });
    expect(eventArtworkAfterError({ failedKind: "fallback" })).toEqual({
      src: URI_RAMS_EVENT_FALLBACK_SRC,
      kind: "fallback",
    });
  });

  it("uses one artwork component across event card layouts", () => {
    const artwork = readFileSync("components/events/EventArtwork.tsx", "utf8");
    expect(artwork).toContain("eventArtworkAfterError");
    expect(artwork).toContain("cq-event-artwork--fallback");
    expect(artwork).toContain("resolveEventFallbackSrc");
    expect(artwork).toContain("fallbackBrand");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".cq-event-artwork--fallback > .cq-event-artwork__img");
    expect(css).toContain("object-fit: contain");
    for (const path of SURFACES) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("<EventArtwork");
      expect(source).not.toContain("cq-event-fallback-mark");
      expect(source).not.toContain("title.slice(0, 1)");
      expect(source).not.toContain("event.title.slice(0, 1)");
    }
  });
});

function campus(): CampusEventItem {
  return {
    id: "campus-1",
    title: "Study night",
    description: "",
    category: "Social",
    location: "Library",
    startsAt: "2026-10-17T22:00:00.000Z",
    endsAt: null,
    isPaid: false,
    hostOrganization: null,
    rsvpCount: 0,
    myRsvpStatus: null,
    isCancelled: false,
  };
}
