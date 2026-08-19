import { describe, expect, it } from "vitest";
import {
  CQ_MEAL_SERVICE_WINDOWS,
  URI_TIME_ZONE,
  effectiveMealWindowsForDay,
  formatMinutesAsClock,
  parseClockToMinutes,
  pickInitialSelectedMeal,
  resolveDiningServiceStatus,
  type DiningDayHours,
} from "./diningServiceStatus";

const butterfieldMonday: DiningDayHours = {
  weekday: "Monday",
  closed: false,
  openLabel: "7:00 AM",
  closeLabel: "6:30 PM",
  openMinutes: parseClockToMinutes("7:00 AM")!,
  closeMinutes: parseClockToMinutes("6:30 PM")!,
};

const week: DiningDayHours[] = [
  { weekday: "Sunday", closed: true },
  butterfieldMonday,
  {
    weekday: "Tuesday",
    closed: false,
    openLabel: "7:00 AM",
    closeLabel: "6:30 PM",
    openMinutes: 7 * 60,
    closeMinutes: 18 * 60 + 30,
  },
];

const meals = ["breakfast", "lunch", "dinner"] as const;

describe("diningServiceStatus", () => {
  it("uses America/New_York timezone helpers", () => {
    expect(URI_TIME_ZONE).toBe("America/New_York");
    expect(formatMinutesAsClock(7 * 60)).toBe("7:00 AM");
    expect(formatMinutesAsClock(15 * 60)).toBe("3:00 PM");
    expect(parseClockToMinutes("11:00 AM")).toBe(11 * 60);
  });

  it("clips CQ meal windows to NetNutrition day open/close", () => {
    const windows = effectiveMealWindowsForDay({
      day: butterfieldMonday,
      availableMealIds: [...meals],
    });
    expect(windows.map((w) => w.mealId)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(windows.find((w) => w.mealId === "dinner")?.endLabel).toBe("6:30 PM");
    expect(windows.find((w) => w.mealId === "breakfast")?.startLabel).toBe("7:00 AM");
    expect(CQ_MEAL_SERVICE_WINDOWS.lunch.endMinutes).toBe(15 * 60);
  });

  it("current time during breakfast → Now Serving Breakfast", () => {
    const status = resolveDiningServiceStatus({
      now: new Date("2026-08-17T08:15:00-04:00"), // Monday
      selectedIsoDate: "2026-08-17",
      todayIsoDate: "2026-08-17",
      hoursDays: week,
      availableMealIds: [...meals],
    });
    expect(status.kind).toBe("serving");
    expect(status.title).toBe("Now Serving Breakfast");
    expect(status.subtitle).toMatch(/7:00 AM/);
    expect(status.currentMealId).toBe("breakfast");
    expect(status.isLive).toBe(true);
  });

  it("current time during lunch → Now Serving Lunch", () => {
    const status = resolveDiningServiceStatus({
      now: new Date("2026-08-17T12:30:00-04:00"),
      selectedIsoDate: "2026-08-17",
      todayIsoDate: "2026-08-17",
      hoursDays: week,
      availableMealIds: [...meals],
    });
    expect(status.title).toBe("Now Serving Lunch");
    expect(status.currentMealId).toBe("lunch");
    expect(status.subtitle).toBe("11:00 AM – 3:00 PM");
  });

  it("current time during dinner → Now Serving Dinner", () => {
    const status = resolveDiningServiceStatus({
      now: new Date("2026-08-17T17:00:00-04:00"),
      selectedIsoDate: "2026-08-17",
      todayIsoDate: "2026-08-17",
      hoursDays: week,
      availableMealIds: [...meals],
    });
    expect(status.title).toBe("Now Serving Dinner");
    expect(status.currentMealId).toBe("dinner");
    expect(status.subtitle).toBe("4:30 PM – 6:30 PM");
  });

  it("between meal periods → next meal start time", () => {
    const status = resolveDiningServiceStatus({
      now: new Date("2026-08-17T10:45:00-04:00"),
      selectedIsoDate: "2026-08-17",
      todayIsoDate: "2026-08-17",
      hoursDays: week,
      availableMealIds: [...meals],
    });
    expect(status.kind).toBe("upcoming");
    expect(status.title).toBe("Lunch starts at 11:00 AM");
    expect(status.subtitle).toMatch(/Next service/);
    expect(status.currentMealId).toBeNull();
  });

  it("after closing → closed / next available service", () => {
    const status = resolveDiningServiceStatus({
      now: new Date("2026-08-17T19:00:00-04:00"),
      selectedIsoDate: "2026-08-17",
      todayIsoDate: "2026-08-17",
      hoursDays: week,
      availableMealIds: [...meals],
    });
    expect(status.kind).toBe("closed");
    expect(status.title).toBe("Dining Closed");
    expect(status.subtitle).toMatch(/Breakfast begins tomorrow at 7:00 AM/);
    expect(status.currentMealId).toBeNull();
  });

  it("future date never says Now Serving", () => {
    const status = resolveDiningServiceStatus({
      now: new Date("2026-08-17T12:30:00-04:00"),
      selectedIsoDate: "2026-08-18",
      todayIsoDate: "2026-08-17",
      hoursDays: week,
      availableMealIds: [...meals],
      browsingMealId: "lunch",
    });
    expect(status.isLive).toBe(false);
    expect(status.title).toBe("Lunch");
    expect(status.title).not.toMatch(/Now Serving/);
    expect(status.currentMealId).toBeNull();
  });

  it("initial Today load selects the live current meal", () => {
    expect(
      pickInitialSelectedMeal({
        availableMealIds: [...meals],
        currentMealId: "lunch",
        now: new Date("2026-08-17T12:30:00-04:00"),
      }),
    ).toBe("lunch");
  });

  it("browsing another meal does not change currentMealId from status", () => {
    const status = resolveDiningServiceStatus({
      now: new Date("2026-08-17T12:30:00-04:00"),
      selectedIsoDate: "2026-08-17",
      todayIsoDate: "2026-08-17",
      hoursDays: week,
      availableMealIds: [...meals],
      browsingMealId: "breakfast",
    });
    expect(status.currentMealId).toBe("lunch");
    expect(status.title).toBe("Now Serving Lunch");
  });

  it("service start/end times display correctly when clipped", () => {
    const dinner = effectiveMealWindowsForDay({
      day: butterfieldMonday,
      availableMealIds: ["dinner"],
    })[0]!;
    expect(dinner.startLabel).toBe("4:30 PM");
    expect(dinner.endLabel).toBe("6:30 PM");
  });
});
