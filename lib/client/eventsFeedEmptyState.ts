import type { EventsFeedTimeframe } from "@/lib/client/eventsFeedFilters";

export const EVENTS_STALE_NOTICE = "Some event information may be out of date.";
export const EVENTS_FOR_YOU_EMPTY_TITLE = "We're still learning what you like.";
export const EVENTS_FOR_YOU_EMPTY_DETAIL = "Explore events below or update your interests.";

const FILTER_DETAIL = "Try another category or clear your filters to see what else is happening on campus.";

function dateFilterIsNarrow(timeframe?: EventsFeedTimeframe): boolean {
  return Boolean(timeframe && timeframe !== "for_you" && timeframe !== "all");
}

export function eventsEmptyStateCopy(input: {
  hasLoadedEvents: boolean;
  /** Kept so older callers compile. Empty copy never mentions admin tools. */
  isAdmin?: boolean;
  timeframe?: EventsFeedTimeframe;
  hasSearch?: boolean;
  category?: string;
  savedOnly?: boolean;
  /** Organization, price, location, or sport filters from the filter sheet. */
  sheetFilterCount?: number;
}): { title: string; detail: string; action?: "clear_filters" } {
  const category = input.category?.trim() ?? "";
  const sheetFilters = Math.max(0, input.sheetFilterCount ?? 0);
  let active = sheetFilters;
  if (category) active += 1;
  if (dateFilterIsNarrow(input.timeframe)) active += 1;
  if (input.hasSearch) active += 1;
  if (input.savedOnly) active += 1;

  if (active >= 2) {
    return {
      title: "No events match these filters",
      detail: FILTER_DETAIL,
      action: "clear_filters",
    };
  }

  if (input.savedOnly) {
    return {
      title: "No saved events yet",
      detail: "Mark events as Interested or Going and they will show up here.",
      action: "clear_filters",
    };
  }

  if (input.hasSearch) {
    return {
      title: "No events match your search",
      detail: "Try a different name, organization, or location.",
      action: "clear_filters",
    };
  }

  if (category) {
    return {
      title: `No ${category} events`,
      detail: FILTER_DETAIL,
      action: "clear_filters",
    };
  }

  if (input.timeframe === "today") {
    return {
      title: "Nothing scheduled for today",
      detail: FILTER_DETAIL,
      action: "clear_filters",
    };
  }

  if (input.timeframe === "this_weekend") {
    return {
      title: "Nothing scheduled this weekend",
      detail: FILTER_DETAIL,
      action: "clear_filters",
    };
  }

  if (input.timeframe === "this_week") {
    return {
      title: "Nothing scheduled this week",
      detail: FILTER_DETAIL,
      action: "clear_filters",
    };
  }

  if (dateFilterIsNarrow(input.timeframe) || sheetFilters > 0) {
    return {
      title: "No events match these filters",
      detail: FILTER_DETAIL,
      action: "clear_filters",
    };
  }

  return {
    title: "No upcoming events right now",
    detail: "When campus events are published, they will show up here.",
  };
}
