import type { EventsFeedTimeframe } from "@/lib/client/eventsFeedFilters";

export const EVENTS_STALE_NOTICE = "Some event information may be out of date.";
export const EVENTS_FOR_YOU_EMPTY_TITLE = "We're still learning what you like.";
export const EVENTS_FOR_YOU_EMPTY_DETAIL = "Explore events below or update your interests.";

export function eventsEmptyStateCopy(input: {
  hasLoadedEvents: boolean;
  isAdmin: boolean;
  timeframe?: EventsFeedTimeframe;
  hasSearch?: boolean;
  hasExtraFilters?: boolean;
  category?: string;
  savedOnly?: boolean;
}): { title: string; detail: string; action?: "all" | "this_week" | "this_weekend" | "clear_search" | "clear_filters" } {
  if (input.hasSearch) {
    return {
      title: "No events match your search.",
      detail: "Try a different name, organization, or location.",
      action: "clear_search",
    };
  }

  if (input.savedOnly) {
    return {
      title: "No saved events yet.",
      detail: "Mark events as Interested or Going and they will show up here.",
      action: "all",
    };
  }

  if (input.hasLoadedEvents && input.category === "Athletics") {
    return {
      title: "No Athletics events coming up right now.",
      detail: "Check back later or browse other campus events.",
      action: "clear_filters",
    };
  }

  if (input.hasLoadedEvents && input.hasExtraFilters) {
    return {
      title: "No events match your filters.",
      detail: "Try clearing search or date filters to see more campus events.",
      action: "clear_filters",
    };
  }

  if (input.hasLoadedEvents && input.timeframe === "today") {
    return {
      title: "Nothing listed for today yet. Check this weekend.",
      detail: "See what's happening Friday through Sunday.",
      action: "this_weekend",
    };
  }

  if (input.hasLoadedEvents && input.timeframe === "this_weekend") {
    return {
      title: "Nothing listed this weekend yet.",
      detail: "Browse all upcoming campus events.",
      action: "all",
    };
  }

  if (input.hasLoadedEvents && input.timeframe === "this_week") {
    return {
      title: "Nothing scheduled this week.",
      detail: "Browse all upcoming campus events.",
      action: "all",
    };
  }

  if (input.hasLoadedEvents && input.timeframe === "for_you") {
    return {
      title: "We're still learning what you like.",
      detail: "Explore events below or update your interests.",
      action: "all",
    };
  }

  if (input.hasLoadedEvents) {
    return {
      title: "No events match your filters.",
      detail: "Try clearing search or date filters to see more campus events.",
      action: "clear_filters",
    };
  }

  return {
    title: "No upcoming events right now.",
    detail: input.isAdmin
      ? "If this looks wrong, check event source sync in admin."
      : "When campus events are published, they will show up here.",
  };
}
