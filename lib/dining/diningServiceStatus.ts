import type { DiningMealPeriodId } from "./types";

export const URI_TIME_ZONE = "America/New_York";

/** Weekday names as returned by NetNutrition hours tables. */
export const DINING_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type DiningWeekday = (typeof DINING_WEEKDAYS)[number];

export type DiningDayHours = {
  weekday: DiningWeekday;
  closed: boolean;
  openLabel?: string;
  closeLabel?: string;
  /** Minutes from local midnight */
  openMinutes?: number;
  closeMinutes?: number;
};

export type DiningHallHoursParsed = {
  summary: string;
  days: DiningDayHours[];
};

/**
 * CampusQuest meal service windows (America/New_York).
 * NetNutrition hours markup only exposes day open/close — not Breakfast/Lunch/Dinner.
 * These windows are the standard URI dining meal periods used for “Now Serving”
 * and are always clipped to that day's NetNutrition open hours when available.
 */
export const CQ_MEAL_SERVICE_WINDOWS: Record<
  DiningMealPeriodId,
  { startMinutes: number; endMinutes: number; label: string }
> = {
  breakfast: { startMinutes: 7 * 60, endMinutes: 10 * 60 + 30, label: "Breakfast" },
  lunch: { startMinutes: 11 * 60, endMinutes: 15 * 60, label: "Lunch" },
  dinner: { startMinutes: 16 * 60 + 30, endMinutes: 20 * 60, label: "Dinner" },
};

export type EffectiveMealWindow = {
  mealId: DiningMealPeriodId;
  label: string;
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
};

export type DiningServiceStatus =
  | {
      kind: "serving";
      mealId: DiningMealPeriodId;
      title: string;
      subtitle: string;
      /** True only when viewing Today */
      isLive: true;
    }
  | {
      kind: "upcoming";
      mealId: DiningMealPeriodId;
      title: string;
      subtitle: string;
      isLive: true;
    }
  | {
      kind: "closed";
      mealId: null;
      title: string;
      subtitle: string;
      isLive: true;
    }
  | {
      kind: "scheduled";
      mealId: DiningMealPeriodId | null;
      title: string;
      subtitle: string;
      isLive: false;
    };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse "7:00 AM" / "6:30 PM" → minutes from midnight. */
export function parseClockToMinutes(label: string): number | null {
  const match = label
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]!.toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  if (hour > 23) return null;
  return hour * 60 + minute;
}

export function formatMinutesAsClock(totalMinutes: number): string {
  const mins = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  let hour = Math.floor(mins / 60);
  const minute = mins % 60;
  const meridiem = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${pad2(minute)} ${meridiem}`;
}

export function uriLocalParts(now: Date = new Date()): {
  isoDate: string;
  weekday: DiningWeekday;
  minutes: number;
} {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: URI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: URI_TIME_ZONE,
    weekday: "long",
  }).format(now) as DiningWeekday;

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: URI_TIME_ZONE,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  const minute = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: URI_TIME_ZONE,
      minute: "2-digit",
    }).format(now),
  );

  return { isoDate, weekday, minutes: hour * 60 + minute };
}

export function weekdayForIsoDate(isoDate: string): DiningWeekday {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(dt) as DiningWeekday;
  return weekday;
}

export function dayHoursForDate(
  days: DiningDayHours[] | undefined,
  isoDate: string,
): DiningDayHours | null {
  if (!days?.length) return null;
  const weekday = weekdayForIsoDate(isoDate);
  return days.find((day) => day.weekday === weekday) ?? null;
}

/**
 * Clip CQ meal windows to NetNutrition day open/close.
 * Meals with empty intersection are omitted (not served that day).
 */
export function effectiveMealWindowsForDay(args: {
  day: DiningDayHours | null;
  availableMealIds?: DiningMealPeriodId[];
}): EffectiveMealWindow[] {
  const available = args.availableMealIds;
  const order: DiningMealPeriodId[] = ["breakfast", "lunch", "dinner"];
  const out: EffectiveMealWindow[] = [];

  for (const mealId of order) {
    if (available && !available.includes(mealId)) continue;
    const window = CQ_MEAL_SERVICE_WINDOWS[mealId];
    let start = window.startMinutes;
    let end = window.endMinutes;

    if (args.day) {
      if (args.day.closed) continue;
      if (args.day.openMinutes != null) start = Math.max(start, args.day.openMinutes);
      if (args.day.closeMinutes != null) end = Math.min(end, args.day.closeMinutes);
    }

    if (start >= end) continue;
    out.push({
      mealId,
      label: window.label,
      startMinutes: start,
      endMinutes: end,
      startLabel: formatMinutesAsClock(start),
      endLabel: formatMinutesAsClock(end),
    });
  }

  return out;
}

function rangeLabel(window: EffectiveMealWindow): string {
  return `${window.startLabel} – ${window.endLabel}`;
}

/**
 * Live “Now Serving” / next / closed for Today, or scheduled meal label for future dates.
 * `currentMealId` is derived only from the clock + hours — never from the user's selected tab.
 */
export function resolveDiningServiceStatus(args: {
  now: Date;
  selectedIsoDate: string;
  todayIsoDate: string;
  hoursDays?: DiningDayHours[];
  availableMealIds: DiningMealPeriodId[];
  /** Which meal the user is browsing (future-date scheduled subtitle). */
  browsingMealId?: DiningMealPeriodId | null;
}): DiningServiceStatus & { currentMealId: DiningMealPeriodId | null } {
  const isToday = args.selectedIsoDate === args.todayIsoDate;
  const day = dayHoursForDate(args.hoursDays, args.selectedIsoDate);
  const windows = effectiveMealWindowsForDay({
    day,
    availableMealIds: args.availableMealIds,
  });

  if (!isToday) {
    const browsing =
      (args.browsingMealId && windows.find((w) => w.mealId === args.browsingMealId)) ||
      windows[0] ||
      null;
    if (!browsing) {
      return {
        kind: "scheduled",
        mealId: null,
        title: "Dining Closed",
        subtitle: day?.closed ? "Closed this day" : "No meal periods posted",
        isLive: false,
        currentMealId: null,
      };
    }
    return {
      kind: "scheduled",
      mealId: browsing.mealId,
      title: browsing.label,
      subtitle: rangeLabel(browsing),
      isLive: false,
      currentMealId: null,
    };
  }

  const { minutes } = uriLocalParts(args.now);

  if (day?.closed || windows.length === 0) {
    const next = findNextService(args.hoursDays, args.selectedIsoDate, args.availableMealIds);
    return {
      kind: "closed",
      mealId: null,
      title: "Dining Closed",
      subtitle: next
        ? `${next.mealLabel} begins ${next.whenLabel} at ${next.startLabel}`
        : "Check back for the next service",
      isLive: true,
      currentMealId: null,
    };
  }

  const serving = windows.find((w) => minutes >= w.startMinutes && minutes < w.endMinutes);
  if (serving) {
    return {
      kind: "serving",
      mealId: serving.mealId,
      title: `Now Serving ${serving.label}`,
      subtitle: rangeLabel(serving),
      isLive: true,
      currentMealId: serving.mealId,
    };
  }

  const upcoming = windows.find((w) => minutes < w.startMinutes);
  if (upcoming) {
    return {
      kind: "upcoming",
      mealId: upcoming.mealId,
      title: `${upcoming.label} starts at ${upcoming.startLabel}`,
      subtitle: `Next service · ${rangeLabel(upcoming)}`,
      isLive: true,
      currentMealId: null,
    };
  }

  const next = findNextService(args.hoursDays, args.selectedIsoDate, args.availableMealIds);
  return {
    kind: "closed",
    mealId: null,
    title: "Dining Closed",
    subtitle: next
      ? `${next.mealLabel} begins ${next.whenLabel} at ${next.startLabel}`
      : "Check back for the next service",
    isLive: true,
    currentMealId: null,
  };
}

function findNextService(
  days: DiningDayHours[] | undefined,
  fromIsoDate: string,
  availableMealIds: DiningMealPeriodId[],
): { mealLabel: string; startLabel: string; whenLabel: string } | null {
  const [y, m, d] = fromIsoDate.split("-").map(Number);
  for (let offset = 1; offset <= 7; offset++) {
    const dt = new Date(Date.UTC(y!, m! - 1, d! + offset));
    const iso = `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
    const day = dayHoursForDate(days, iso);
    const windows = effectiveMealWindowsForDay({ day, availableMealIds });
    const first = windows[0];
    if (!first) continue;
    const whenLabel = offset === 1 ? "tomorrow" : weekdayForIsoDate(iso);
    return {
      mealLabel: first.label,
      startLabel: first.startLabel,
      whenLabel,
    };
  }
  return null;
}

/** Initial selected meal for Today: live current meal when available, else soft fallback. */
export function pickInitialSelectedMeal(args: {
  availableMealIds: DiningMealPeriodId[];
  currentMealId: DiningMealPeriodId | null;
  now: Date;
}): DiningMealPeriodId | null {
  if (args.availableMealIds.length === 0) return null;
  if (args.currentMealId && args.availableMealIds.includes(args.currentMealId)) {
    return args.currentMealId;
  }
  const { minutes } = uriLocalParts(args.now);
  const preferred: DiningMealPeriodId =
    minutes < 11 * 60 ? "breakfast" : minutes < 16 * 60 ? "lunch" : "dinner";
  if (args.availableMealIds.includes(preferred)) return preferred;
  return args.availableMealIds[0] ?? null;
}
