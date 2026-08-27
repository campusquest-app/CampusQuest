import { canonicalEventCategory, eventMatchesCanonicalCategory } from "@/lib/eventSources/categories";
import type { CanonicalEventCategory } from "@/lib/eventSources/types";
import { eventHasMappedLocation } from "@/lib/client/eventDiscovery";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { feedEventHostName, feedEventLocationText } from "@/lib/client/eventFeedTypes";

export const EVENTS_CATEGORY_RAIL = [
  { id: "Athletics", label: "Athletics", match: "Athletics", accent: "athletics", icon: "trophy" },
  { id: "Clubs", label: "Clubs", match: "Clubs", accent: "clubs", icon: "users" },
  { id: "Arts", label: "Arts", match: "Fine Arts", accent: "arts", icon: "drama" },
  { id: "Career", label: "Career", match: "Career", accent: "career", icon: "briefcase" },
  { id: "Academic", label: "Academic", match: "Academic", accent: "academic", icon: "cap" },
  { id: "Recreation", label: "Recreation", match: "Recreation", accent: "recreation", icon: "dumbbell" },
  { id: "Social", label: "Social", match: "Social", accent: "social", icon: "chat" },
] as const;

export type EventsCategoryRailId = (typeof EVENTS_CATEGORY_RAIL)[number]["id"];

export function feedEventIsAthletics(item: FeedEvent): boolean {
  if (item.kind === "external") {
    return item.event.source === "athletics" || Boolean(item.event.sport?.trim());
  }
  return canonicalEventCategory({
    source: item.event.sourceType ?? item.event.source,
    category: item.event.category,
    title: item.event.title,
  }) === "Athletics";
}

export function feedEventIsSaved(item: FeedEvent): boolean {
  const status = item.event.myRsvpStatus;
  return status === "interested" || status === "going";
}

export function feedEventCanRsvp(item: FeedEvent): boolean {
  return item.kind === "campus" || Boolean(item.event.cqRsvpEnabled);
}

export function feedEventSourceKey(item: FeedEvent): string | null {
  return item.kind === "external" ? item.event.source : item.event.sourceType ?? null;
}

export function eventCardCategory(item: FeedEvent): CanonicalEventCategory {
  if (item.kind === "external") {
    return canonicalEventCategory({
      source: item.event.source,
      category: item.event.category,
      sport: item.event.sport,
      title: item.event.title,
      tags: item.event.tags,
    });
  }
  return canonicalEventCategory({
    source: item.event.sourceType ?? item.event.source,
    category: item.event.category,
    title: item.event.title,
  });
}

export function eventCardCategoryChip(item: FeedEvent): string {
  const category = eventCardCategory(item);
  return category === "Fine Arts" ? "Arts" : category;
}

export function eventMatchesCategoryRail(
  item: FeedEvent,
  railId: string | null | undefined,
): boolean {
  const needle = railId?.trim();
  if (!needle) return true;
  const rail = EVENTS_CATEGORY_RAIL.find((entry) => entry.id === needle);
  const match = rail?.match ?? needle;
  const event =
    item.kind === "external"
      ? {
          source: item.event.source,
          category: item.event.category,
          sport: item.event.sport,
          title: item.event.title,
          tags: item.event.tags,
        }
      : {
          source: item.event.sourceType ?? item.event.source,
          category: item.event.category,
          title: item.event.title,
        };
  return eventMatchesCanonicalCategory(event, match);
}

export function eventCardDisplayTitle(item: FeedEvent): string {
  if (item.kind === "external" && feedEventIsAthletics(item)) {
    const opponent = item.event.opponent?.trim();
    if (opponent) {
      const connector = item.event.homeAway === "away" ? "at" : "vs";
      return `Rhode Island ${connector} ${opponent}`;
    }
    return item.event.title
      .replace(/^\[(?:W|L|T)\]\s+/i, "")
      .replace(/^University of Rhode Island\s+/i, "")
      .replace(/^URI\s+/i, "")
      .trim() || item.event.title;
  }
  return item.event.title;
}

export function eventCardSportSubtitle(item: FeedEvent): string | null {
  if (item.kind !== "external") return null;
  const sport = item.event.sport?.trim();
  return sport || null;
}

export function eventCardVenueLabel(item: FeedEvent): string | null {
  const raw =
    item.kind === "campus"
      ? item.event.location?.trim() || null
      : item.event.venueName?.trim() ||
        (item.event.location && item.event.location !== "Location TBA" ? item.event.location.trim() : null);
  if (!raw) return null;
  const stripped = raw
    .replace(/^Kingston,?\s*R\.?I\.?,?\s*/i, "")
    .replace(/^Thomas M\.\s+/i, "")
    .trim();
  return stripped || raw;
}

export function eventCardPrimaryActionLabel(item: FeedEvent): string {
  return feedEventIsAthletics(item) ? "View Game" : "View Event";
}

export function eventShowOnRealmEligible(item: FeedEvent): boolean {
  if (item.kind === "campus") {
    return eventHasMappedLocation({ location: item.event.location });
  }
  return eventHasMappedLocation({
    latitude: item.event.latitude,
    longitude: item.event.longitude,
    venueName: item.event.venueName,
    location: item.event.location,
    address: item.event.address,
    source: item.event.source,
    homeAway: item.event.homeAway,
  });
}

export function eventCardFallbackAccent(item: FeedEvent): string {
  const category = eventCardCategory(item);
  if (category === "Athletics") return "athletics";
  if (category === "Career") return "career";
  if (category === "Fine Arts") return "arts";
  if (category === "Academic") return "academic";
  if (category === "Recreation") return "recreation";
  if (category === "Social") return "social";
  return "clubs";
}

export function eventSearchHaystack(item: FeedEvent): {
  title: string;
  description: string;
  location: string;
  organizationName: string;
  category: string;
  tags: string[];
  sport: string;
  opponent: string;
} {
  return {
    title: item.event.title,
    description: item.event.description,
    location: feedEventLocationText(item),
    organizationName: feedEventHostName(item),
    category: item.event.category ?? "",
    tags: item.kind === "external" ? item.event.tags ?? [] : [],
    sport: item.kind === "external" ? item.event.sport ?? "" : "",
    opponent: item.kind === "external" ? item.event.opponent ?? "" : "",
  };
}
