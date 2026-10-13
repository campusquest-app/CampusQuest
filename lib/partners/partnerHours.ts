import type {
  PartnerHours,
  PartnerHoursInterval,
  PartnerSpecialHours,
  PartnerTemporaryClosure,
} from "@/lib/partners/types";

export const DEFAULT_PARTNER_TIME_ZONE = "America/New_York";

/** A business closing within this many minutes shows the amber "Closing Soon" state. */
export const CLOSING_SOON_MINUTES = 60;

const DAY_MINUTES = 24 * 60;
const LOOKAHEAD_DAYS = 8;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type PartnerOpenState = "open" | "closing_soon" | "closed" | "unavailable";

export type PartnerOpenStatus = {
  state: PartnerOpenState;
  /** "Open Now", "Closing Soon", "Closed", or "Hours Unavailable". */
  label: string;
  /** "Closes at 10 PM", "Opens tomorrow at 12 PM", … — null when there is nothing honest to say. */
  detail: string | null;
  /** Holiday label or temporary-closure reason affecting today. */
  note: string | null;
};

export type PartnerWeeklyRow = { weekday: number; day: string; hours: string; isToday: boolean };

export type PartnerSpecialRow = { date: string; dateLabel: string; hours: string; note: string | null };

type ZonedNow = { dateKey: string; weekday: number; minutes: number };
type Segment = { start: number; end: number };
type ResolvedDay = { intervals: PartnerHoursInterval[]; note: string | null; closedAllDay: boolean };

export function parseClockTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  const total = hours * 60 + minutes;
  if (total > DAY_MINUTES) return null;
  return total;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function parseInterval(value: unknown): PartnerHoursInterval | null {
  if (!value || typeof value !== "object") return null;
  const { open, close } = value as Record<string, unknown>;
  const openMin = parseClockTime(open);
  const closeMin = parseClockTime(close);
  if (openMin === null || closeMin === null || openMin === DAY_MINUTES) return null;
  return { open: String(open).trim(), close: String(close).trim() };
}

function parseIntervals(value: unknown): PartnerHoursInterval[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map(parseInterval);
  return parsed.every((interval): interval is PartnerHoursInterval => interval !== null) ? parsed : null;
}

/**
 * Validates hours from an untrusted source (database JSON). Anything malformed returns null so the UI
 * shows "Hours Unavailable" instead of guessing.
 */
export function parsePartnerHours(value: unknown): PartnerHours | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const timeZone = raw.timeZone === undefined ? DEFAULT_PARTNER_TIME_ZONE : raw.timeZone;
  if (!isValidTimeZone(timeZone)) return null;
  if (!Array.isArray(raw.weekly) || raw.weekly.length !== 7) return null;
  const weekly = raw.weekly.map(parseIntervals);
  if (!weekly.every((day): day is PartnerHoursInterval[] => day !== null)) return null;

  const special: PartnerSpecialHours[] = [];
  if (raw.special !== undefined) {
    if (!Array.isArray(raw.special)) return null;
    for (const entry of raw.special) {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      if (!isDateKey(item.date)) return null;
      const intervals = item.intervals === undefined ? [] : parseIntervals(item.intervals);
      if (intervals === null) return null;
      special.push({
        date: item.date,
        label: typeof item.label === "string" ? item.label : null,
        closed: item.closed === true,
        intervals,
      });
    }
  }

  const closures: PartnerTemporaryClosure[] = [];
  if (raw.closures !== undefined) {
    if (!Array.isArray(raw.closures)) return null;
    for (const entry of raw.closures) {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      if (!isDateKey(item.from) || !isDateKey(item.to) || item.to < item.from) return null;
      closures.push({ from: item.from, to: item.to, reason: typeof item.reason === "string" ? item.reason : null });
    }
  }

  return {
    timeZone,
    weekly,
    special,
    closures,
    source: typeof raw.source === "string" ? raw.source : null,
    checkedOn: isDateKey(raw.checkedOn) ? raw.checkedOn : null,
  };
}

function zonedNow(now: Date, timeZone: string): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour")) % 24;
  return {
    dateKey,
    weekday: weekdayOf(dateKey),
    minutes: hour * 60 + Number(get("minute")) + Number(get("second")) / 60,
  };
}

function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/**
 * Real minutes from `now` until a local wall-clock time (minutes from today's local midnight).
 * Differs from the wall-clock difference when a daylight-saving change falls in between.
 */
function realMinutesUntil(now: Date, timeZone: string, todayKey: string, nowMinutes: number, target: number): number {
  const todayMs = Date.parse(`${todayKey}T00:00:00Z`);
  let guess = now.getTime() + (target - nowMinutes) * 60_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = zonedNow(new Date(guess), timeZone);
    const dayOffset = Math.round((Date.parse(`${local.dateKey}T00:00:00Z`) - todayMs) / 86_400_000);
    const correction = target - (local.minutes + dayOffset * DAY_MINUTES);
    if (Math.abs(correction) < 0.5) break;
    guess += correction * 60_000;
  }
  return Math.max(0, (guess - now.getTime()) / 60_000);
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveDay(hours: PartnerHours, dateKey: string): ResolvedDay {
  const closure = hours.closures?.find((c) => c.from <= dateKey && dateKey <= c.to);
  if (closure) {
    return { intervals: [], note: closure.reason?.trim() || "Temporarily closed", closedAllDay: true };
  }
  const special = hours.special?.find((s) => s.date === dateKey);
  if (special) {
    const intervals = special.closed ? [] : special.intervals ?? [];
    return { intervals, note: special.label?.trim() || "Special hours", closedAllDay: intervals.length === 0 };
  }
  const intervals = hours.weekly[weekdayOf(dateKey)] ?? [];
  return { intervals, note: null, closedAllDay: intervals.length === 0 };
}

function intervalMinutes(interval: PartnerHoursInterval): Segment | null {
  const open = parseClockTime(interval.open);
  const close = parseClockTime(interval.close);
  if (open === null || close === null) return null;
  return { start: open, end: close <= open ? close + DAY_MINUTES : close };
}

/** Open periods in minutes relative to local midnight today, from yesterday through the lookahead window, merged. */
function buildSegments(hours: PartnerHours, todayKey: string): Segment[] {
  const segments: Segment[] = [];
  for (let offset = -1; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const { intervals } = resolveDay(hours, addDays(todayKey, offset));
    for (const interval of intervals) {
      const span = intervalMinutes(interval);
      if (!span) continue;
      segments.push({ start: span.start + offset * DAY_MINUTES, end: span.end + offset * DAY_MINUTES });
    }
  }
  segments.sort((a, b) => a.start - b.start);
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && segment.start <= last.end) last.end = Math.max(last.end, segment.end);
    else merged.push({ ...segment });
  }
  return merged;
}

export function formatClockMinutes(totalMinutes: number): string {
  const minutesInDay = ((Math.round(totalMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hour24 = Math.floor(minutesInDay / 60);
  const minute = minutesInDay % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatShortDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return `${WEEKDAY_NAMES[date.getUTCDay()].slice(0, 3)}, ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function dayPhrase(todayKey: string, dayOffset: number): string {
  if (dayOffset <= 0) return "today";
  if (dayOffset === 1) return "tomorrow";
  const dateKey = addDays(todayKey, dayOffset);
  if (dayOffset < 7) return WEEKDAY_NAMES[weekdayOf(dateKey)];
  return formatShortDate(dateKey);
}

export function formatIntervals(intervals: PartnerHoursInterval[]): string {
  const spans = intervals.map(intervalMinutes).filter((span): span is Segment => span !== null);
  if (spans.length === 0) return "Closed";
  if (spans.some((span) => span.start === 0 && span.end >= DAY_MINUTES)) return "Open 24 hours";
  return spans
    .sort((a, b) => a.start - b.start)
    .map((span) => `${formatClockMinutes(span.start)} \u2013 ${formatClockMinutes(span.end)}`)
    .join(", ");
}

const UNAVAILABLE: PartnerOpenStatus = { state: "unavailable", label: "Hours Unavailable", detail: null, note: null };

/** Live open/closed state in the business's own time zone. Never infers hours that were not provided. */
export function getPartnerOpenStatus(hours: PartnerHours | null | undefined, now: Date = new Date()): PartnerOpenStatus {
  if (!hours || !isValidTimeZone(hours.timeZone) || !Array.isArray(hours.weekly) || hours.weekly.length !== 7) {
    return UNAVAILABLE;
  }
  const local = zonedNow(now, hours.timeZone);
  const today = resolveDay(hours, local.dateKey);
  const segments = buildSegments(hours, local.dateKey);
  const current = segments.find((segment) => segment.start <= local.minutes && local.minutes < segment.end);

  if (current) {
    if (current.end - local.minutes >= 7 * DAY_MINUTES) {
      return { state: "open", label: "Open Now", detail: "Open 24 hours", note: today.note };
    }
    const closesAt = formatClockMinutes(current.end);
    const closeOffset = Math.floor(current.end / DAY_MINUTES);
    const when = closeOffset >= 2 ? ` ${dayPhrase(local.dateKey, closeOffset)}` : "";
    const closingSoon =
      realMinutesUntil(now, hours.timeZone, local.dateKey, local.minutes, current.end) <= CLOSING_SOON_MINUTES;
    return {
      state: closingSoon ? "closing_soon" : "open",
      label: closingSoon ? "Closing Soon" : "Open Now",
      detail: `Closes at ${closesAt}${when}`,
      note: today.note,
    };
  }

  const next = segments.find((segment) => segment.start > local.minutes);
  if (!next) {
    return { state: "closed", label: "Closed", detail: null, note: today.note };
  }
  const dayOffset = Math.floor(next.start / DAY_MINUTES);
  return {
    state: "closed",
    label: "Closed",
    detail: `Opens ${dayPhrase(local.dateKey, dayOffset)} at ${formatClockMinutes(next.start)}`,
    note: today.note,
  };
}

export function isPartnerOpenNow(hours: PartnerHours | null | undefined, now: Date = new Date()): boolean {
  const { state } = getPartnerOpenStatus(hours, now);
  return state === "open" || state === "closing_soon";
}

/** Today's hours in the business's time zone, including holiday or closure overrides. */
export function getTodayHoursLabel(hours: PartnerHours | null | undefined, now: Date = new Date()): string | null {
  if (!hours || !isValidTimeZone(hours.timeZone)) return null;
  const { dateKey } = zonedNow(now, hours.timeZone);
  const day = resolveDay(hours, dateKey);
  if (day.closedAllDay) return "Closed today";
  return formatIntervals(day.intervals);
}

/** Regular weekly schedule, Monday first, with today's row flagged. */
export function getWeeklyHoursRows(hours: PartnerHours | null | undefined, now: Date = new Date()): PartnerWeeklyRow[] {
  if (!hours || !isValidTimeZone(hours.timeZone) || hours.weekly.length !== 7) return [];
  const { weekday: todayWeekday } = zonedNow(now, hours.timeZone);
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    day: WEEKDAY_NAMES[weekday],
    hours: formatIntervals(hours.weekly[weekday] ?? []),
    isToday: weekday === todayWeekday,
  }));
}

/** Holiday hours and temporary closures in the next `days` days, so students see changes before they arrive. */
export function getUpcomingSpecialHours(
  hours: PartnerHours | null | undefined,
  now: Date = new Date(),
  days = 14,
): PartnerSpecialRow[] {
  if (!hours || !isValidTimeZone(hours.timeZone)) return [];
  const { dateKey: todayKey } = zonedNow(now, hours.timeZone);
  const rows: PartnerSpecialRow[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = addDays(todayKey, offset);
    const closure = hours.closures?.some((c) => c.from <= dateKey && dateKey <= c.to);
    const special = hours.special?.some((s) => s.date === dateKey);
    if (!closure && !special) continue;
    const day = resolveDay(hours, dateKey);
    rows.push({
      date: dateKey,
      dateLabel: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : formatShortDate(dateKey),
      hours: day.closedAllDay ? "Closed" : formatIntervals(day.intervals),
      note: day.note,
    });
  }
  return rows;
}

export function formatHoursCheckedOn(checkedOn: string | null | undefined): string | null {
  if (!isDateKey(checkedOn)) return null;
  const date = new Date(`${checkedOn}T00:00:00Z`);
  return `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Seven identical days of the same intervals — convenience for directory entries. */
export function everyDay(...intervals: PartnerHoursInterval[]): PartnerHoursInterval[][] {
  return Array.from({ length: 7 }, () => intervals.map((interval) => ({ ...interval })));
}
