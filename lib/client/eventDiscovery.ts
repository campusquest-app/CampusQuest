import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";
import type { EventsFeedTimeframe } from "@/lib/client/eventsFeedFilters";
import type { RecommendationReason } from "@/lib/recommendations/types";

export const EVENTS_SEARCH_PLACEHOLDER = "Search events, organizations, or locations";

export type EventSyncBanner = {
  kind: "warning" | "fresh";
  text: string;
};

export function formatEventsSyncFreshness(lastSuccessfulSync: string, now: Date = new Date()): string {
  const then = new Date(lastSuccessfulSync);
  if (Number.isNaN(then.getTime())) return "Updated recently from URInvolved";
  const minutes = Math.round((now.getTime() - then.getTime()) / 60000);
  if (minutes < 2) return "Updated recently from URInvolved";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  return "Updated recently from URInvolved";
}

export function eventsSyncBanner(input: {
  stale: boolean;
  fetchFailed?: boolean;
  lastSuccessfulSync?: string | null;
  warningText: string;
  now?: Date;
}): EventSyncBanner | null {
  if (input.fetchFailed || input.stale) {
    return { kind: "warning", text: input.warningText };
  }
  if (input.lastSuccessfulSync) {
    return { kind: "fresh", text: formatEventsSyncFreshness(input.lastSuccessfulSync, input.now) };
  }
  return null;
}

export function countActiveEventFilters(input: {
  category: string;
  organizationKey: string;
  isPaid: "all" | "free" | "paid";
  location: string;
  timeframe: EventsFeedTimeframe;
}): number {
  let count = 0;
  if (input.category.trim()) count += 1;
  if (input.organizationKey.trim()) count += 1;
  if (input.isPaid !== "all") count += 1;
  if (input.location.trim()) count += 1;
  if (input.timeframe === "tomorrow" || input.timeframe === "this_month") count += 1;
  return count;
}

export function scoreEventsSearch(
  fields: {
    title: string;
    organizationName: string;
    location: string;
    category: string;
    tags: string[];
    description: string;
  },
  query: string,
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = fields.title.toLowerCase();
  const org = fields.organizationName.toLowerCase();
  const location = fields.location.toLowerCase();
  const category = fields.category.toLowerCase();
  const description = fields.description.toLowerCase();
  const tags = fields.tags.map((tag) => tag.toLowerCase());

  if (title === q) return 100;
  if (title.startsWith(q)) return 86;
  if (title.includes(q)) return 72;
  if (org === q) return 64;
  if (org.includes(q)) return 52;
  if (location.includes(q)) return 44;
  if (category.includes(q)) return 36;
  if (tags.some((tag) => tag === q || tag.includes(q))) return 28;
  if (description.includes(q)) return 12;
  return 0;
}

export function eventHasMappedLocation(input: {
  latitude?: number | null;
  longitude?: number | null;
  venueName?: string | null;
  location?: string | null;
  address?: string | null;
}): boolean {
  if (hasValidCoordinates({ latitude: input.latitude, longitude: input.longitude })) return true;
  const venue = input.venueName?.trim();
  const location = input.location?.trim();
  if (venue) return true;
  return Boolean(location && location !== "Location TBA");
}

const CARD_REASON_CODES = new Set([
  "interest",
  "community",
  "organization",
  "campus_wide",
  "popular",
  "happening_now",
  "recommended",
]);

export function eventCardRecommendationReason(reason: RecommendationReason | null | undefined): string | null {
  if (!reason?.label?.trim()) return null;
  if (!CARD_REASON_CODES.has(reason.code)) return null;
  return reason.label;
}

export function eventShareText(input: {
  title: string;
  when: string;
  location?: string | null;
}): string {
  return [input.title, input.when, input.location?.trim() || null].filter(Boolean).join("\n");
}
