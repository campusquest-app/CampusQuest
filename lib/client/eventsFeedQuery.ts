import { extractEventKeyFacts } from "@/lib/client/eventDetailContent";
import {
  EVENTS_FILTER_CATEGORY_LABELS,
  eventMatchesAnyCategoryRail,
  eventSearchHaystack,
  feedEventIsSaved,
} from "@/lib/client/eventCardPresentation";
import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { feedEventLocationText } from "@/lib/client/eventFeedTypes";
import {
  eventIsCancelled,
  eventIsCurrentOrUpcoming,
  eventOverlapsCampusDate,
  matchesAnyEventsWhen,
  matchesEventsSearch,
  type EventsFeedTimeframe,
  type EventsWhenFilter,
} from "@/lib/client/eventsFeedFilters";
import { formatCampusDateLabel } from "@/lib/realm/campusTime";

export type { EventsWhenFilter };

export type EventsFeedFilterState = {
  search: string;
  categories: string[];
  when: EventsWhenFilter[];
  timeframe: EventsFeedTimeframe;
  organizationKey: string;
  isPaid: "all" | "free" | "paid";
  foodOnly: boolean;
  location: string;
  sport: string;
  /** Campus calendar day, YYYY-MM-DD. Empty means no custom date. */
  date?: string;
};

export type ActiveEventFilterChip = {
  id: string;
  label: string;
};

const WHEN_LABELS: Record<EventsWhenFilter, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  this_weekend: "This Weekend",
  this_week: "This Week",
};

export function eventExplicitlyHasFood(item: FeedEvent): boolean {
  return extractEventKeyFacts({ description: item.event.description }).some((fact) => fact.id === "food");
}

function organizationMatches(item: FeedEvent, organizationKey: string): boolean {
  if (!organizationKey) return true;
  if (organizationKey.startsWith("campus:")) {
    const orgId = organizationKey.slice("campus:".length);
    return item.kind === "campus" && item.event.hostOrganization?.id === orgId;
  }
  if (organizationKey.startsWith("ext:")) {
    const orgName = decodeURIComponent(organizationKey.slice("ext:".length)).toLowerCase();
    return item.kind === "external" && (item.event.organizationName ?? "").toLowerCase() === orgName;
  }
  return true;
}

/** Explicit "Cost:" lines written by the URI Events importer. Unknown cost stays unclassified. */
export function explicitEventCost(description: string | null | undefined): "free" | "paid" | null {
  const match = (description ?? "").match(/(?:^|\n)\s*Cost:\s*(.+)/i);
  if (!match?.[1]) return null;
  const value = match[1].trim().toLowerCase();
  if (!value) return null;
  if (value === "free" || value === "$0" || value === "$0.00" || value === "0") return "free";
  return "paid";
}

export function eventPassesListFilters(
  item: FeedEvent,
  filters: EventsFeedFilterState,
  savedOnly = false,
  now: Date = new Date(),
): boolean {
  const cancelled = eventIsCancelled({
    isCancelled: item.event.isCancelled,
    title: item.event.title,
  });
  // Saved RSVPs can still open a cancelled event. The default feed never lists one as active.
  if (cancelled) {
    if (!(savedOnly && feedEventIsSaved(item))) return false;
  } else if (
    !eventIsCurrentOrUpcoming(
      {
        startsAt: item.event.startsAt,
        endsAt: item.event.endsAt,
        isCancelled: item.event.isCancelled,
        title: item.event.title,
      },
      now,
    )
  ) {
    return false;
  }
  const chosenDate = filters.date?.trim() ?? "";
  if (chosenDate) {
    if (!eventOverlapsCampusDate(item.event.startsAt, item.event.endsAt, chosenDate)) return false;
  } else if (!matchesAnyEventsWhen(item.event.startsAt, filters.when, now)) {
    return false;
  }
  if (savedOnly && !feedEventIsSaved(item)) return false;
  if (!matchesEventsSearch(eventSearchHaystack(item), filters.search)) {
    return false;
  }
  if (!eventMatchesAnyCategoryRail(item, filters.categories)) return false;
  if (filters.sport.trim()) {
    if (item.kind !== "external" || !(item.event.sport ?? "").toLowerCase().includes(filters.sport.trim().toLowerCase())) {
      return false;
    }
  }
  const locationNeedle = filters.location.trim().toLowerCase();
  if (locationNeedle && !feedEventLocationText(item).toLowerCase().includes(locationNeedle)) return false;

  const campusPaid = item.kind === "campus" && item.event.isPaid;
  const externalPaid = item.kind === "external" && explicitEventCost(item.event.description) === "paid";
  if (filters.isPaid === "paid" && !(campusPaid || externalPaid)) return false;
  if (filters.isPaid === "free" && (campusPaid || externalPaid)) return false;
  if (filters.foodOnly && !eventExplicitlyHasFood(item)) return false;
  if (!organizationMatches(item, filters.organizationKey)) return false;
  return true;
}

/**
 * Chips for applied refinements.
 * For You is never a chip. Today and This Weekend are omitted when that
 * quick pill is already the only date selection.
 */
export function activeEventFilterChips(
  filters: EventsFeedFilterState,
  organizationLabel?: string | null,
): ActiveEventFilterChip[] {
  const chips: ActiveEventFilterChip[] = [];
  for (const category of filters.categories) {
    const label = EVENTS_FILTER_CATEGORY_LABELS[category as keyof typeof EVENTS_FILTER_CATEGORY_LABELS] ?? category;
    chips.push({ id: `category:${category}`, label });
  }

  const exclusiveQuick =
    filters.when.length === 1 &&
    (filters.when[0] === "today" || filters.when[0] === "tomorrow" || filters.when[0] === "this_weekend");
  if (!exclusiveQuick) {
    for (const when of filters.when) {
      chips.push({ id: `when:${when}`, label: WHEN_LABELS[when] });
    }
  }
  if (filters.date?.trim()) {
    chips.push({ id: "date", label: formatCampusDateLabel(filters.date.trim()) });
  }

  if (filters.isPaid === "free") chips.push({ id: "free", label: "Free" });
  if (filters.foodOnly) chips.push({ id: "food", label: "Food" });
  if (filters.sport.trim()) chips.push({ id: "sport", label: filters.sport.trim() });
  if (organizationLabel?.trim()) chips.push({ id: "organization", label: organizationLabel.trim() });
  if (filters.location.trim()) chips.push({ id: "location", label: filters.location.trim() });
  return chips;
}

export function removeActiveEventFilter(
  filters: EventsFeedFilterState,
  chipId: string,
): EventsFeedFilterState {
  if (chipId.startsWith("category:")) {
    const category = chipId.slice("category:".length);
    const categories = filters.categories.filter((entry) => entry !== category);
    return {
      ...filters,
      categories,
      sport: category === "Athletics" ? "" : filters.sport,
    };
  }
  if (chipId.startsWith("when:")) {
    const when = filters.when.filter((entry) => entry !== chipId.slice("when:".length));
    return {
      ...filters,
      when,
      timeframe: when.length === 1 ? when[0] : when.length > 1 ? "all" : filters.timeframe === "all" ? "all" : "for_you",
    };
  }
  if (chipId === "date") {
    const when = filters.when;
    return {
      ...filters,
      date: "",
      timeframe: when.length === 1 ? when[0] : when.length > 1 ? "all" : "for_you",
    };
  }
  if (chipId === "free") return { ...filters, isPaid: "all" };
  if (chipId === "food") return { ...filters, foodOnly: false };
  if (chipId === "sport") return { ...filters, sport: "" };
  if (chipId === "organization") return { ...filters, organizationKey: "" };
  if (chipId === "location") return { ...filters, location: "" };
  return filters;
}

/** A chosen date replaces every When preset so the two cannot apply together. */
export function selectEventsCalendarDate(filters: EventsFeedFilterState, date: string): EventsFeedFilterState {
  return { ...filters, date, when: [] };
}

export function clearEventsCalendarDate(filters: EventsFeedFilterState): EventsFeedFilterState {
  return { ...filters, date: "" };
}

/** Choosing a preset clears a custom date. */
export function toggleEventsWhenFilter(filters: EventsFeedFilterState, value: EventsWhenFilter): EventsFeedFilterState {
  const selected = filters.when.includes(value);
  return {
    ...filters,
    date: "",
    when: selected ? filters.when.filter((entry) => entry !== value) : [...filters.when, value],
  };
}
