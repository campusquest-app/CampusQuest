import type { DiningMealPeriodId } from "./types";

const NY = "America/New_York";

/** Calendar date YYYY-MM-DD in URI local time. */
export function uriTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** NetNutrition date string: Today or M/D/YYYY */
export function toNetNutritionDateParam(isoDate: string, now: Date = new Date()): string {
  if (isoDate === uriTodayIso(now)) return "Today";
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${isoDate}`);
  return `${m}/${d}/${y}`;
}

export function parseIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return trimmed;
}

/** Upcoming ISO dates starting from `fromIso` (inclusive), length `count`. */
export function upcomingIsoDates(fromIso: string, count: number): string[] {
  const [y, m, d] = fromIso.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

export function formatDayChipLabel(isoDate: string, todayIso: string): string {
  if (isoDate === todayIso) return "Today";
  const tomorrow = upcomingIsoDates(todayIso, 2)[1];
  if (isoDate === tomorrow) return "Tomorrow";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dt);
  return `${weekday} ${m}/${d}`;
}

/**
 * Soft UX default for which meal tab to open.
 * NetNutrition did not expose per-meal start/end times in probed hours markup;
 * this is CampusQuest tab selection only — not displayed as URI schedule data.
 */
export function selectDefaultMealPeriod(
  available: DiningMealPeriodId[],
  now: Date = new Date(),
): DiningMealPeriodId | null {
  if (available.length === 0) return null;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: NY,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  const preferred: DiningMealPeriodId =
    hour < 11 ? "breakfast" : hour < 16 ? "lunch" : "dinner";
  if (available.includes(preferred)) return preferred;
  return available[0] ?? null;
}

export function mealContextLabel(
  mealId: DiningMealPeriodId | null,
  isToday: boolean,
): string | null {
  if (!mealId || !isToday) return null;
  const name = mealId === "breakfast" ? "Breakfast" : mealId === "lunch" ? "Lunch" : "Dinner";
  return `Serving ${name}`;
}
