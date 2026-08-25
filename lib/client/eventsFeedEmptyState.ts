import type { EventsFeedTimeframe } from "@/lib/client/eventsFeedFilters";

export const EVENTS_STALE_NOTICE = "Some event information may be out of date.";

export function eventsEmptyStateCopy(input: {
  hasLoadedEvents: boolean;
  isAdmin: boolean;
  timeframe?: EventsFeedTimeframe;
  hasSearch?: boolean;
  hasExtraFilters?: boolean;
}): { title: string; detail: string; action?: "all" | "this_week" | "clear_search" | "clear_filters" } {
  if (input.hasSearch) {
    return {
      title: "No events match your search.",
      detail: "Try a different name, organization, or location.",
      action: "clear_search",
    };
  }

  if (input.hasLoadedEvents && input.hasExtraFilters) {
    return {
      title: "No events match your filters.",
      detail: "Try clearing search or date filters to see more CampusQuest and URInvolved events.",
      action: "clear_filters",
    };
  }

  if (input.hasLoadedEvents && input.timeframe === "today") {
    return {
      title: "Nothing scheduled for today.",
      detail: "See what's coming this week.",
      action: "this_week",
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
      title: "No personalized events yet.",
      detail: "Explore all upcoming events.",
      action: "all",
    };
  }

  if (input.hasLoadedEvents) {
    return {
      title: "No events match your filters.",
      detail: "Try clearing search or date filters to see more CampusQuest and URInvolved events.",
      action: "clear_filters",
    };
  }

  return {
    title: "No upcoming events right now.",
    detail: input.isAdmin
      ? "If this looks wrong, check URInvolved sync diagnostics in admin."
      : "When campus events are published, they will show up here.",
  };
}
