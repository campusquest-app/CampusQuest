import { describe, expect, it } from "vitest";
import {
  everyDay,
  formatClockMinutes,
  getPartnerOpenStatus,
  getTodayHoursLabel,
  getUpcomingSpecialHours,
  getWeeklyHoursRows,
  isPartnerOpenNow,
  parsePartnerHours,
} from "@/lib/partners/partnerHours";
import type { PartnerHours } from "@/lib/partners/types";

/** 2026-10-12 is a Monday. New York is UTC-4 in October (EDT) and UTC-5 in December (EST). */
function ny(local: string): Date {
  return new Date(`${local}-04:00`);
}

const daily = (open: string, close: string): PartnerHours => ({
  timeZone: "America/New_York",
  weekly: everyDay({ open, close }),
});

describe("getPartnerOpenStatus", () => {
  it("is unavailable when no hours are configured", () => {
    expect(getPartnerOpenStatus(null, ny("2026-10-12T13:00:00"))).toEqual({
      state: "unavailable",
      label: "Hours Unavailable",
      detail: null,
      note: null,
    });
  });

  it("is unavailable for a bad time zone or malformed schedule", () => {
    expect(getPartnerOpenStatus({ timeZone: "Mars/Base", weekly: everyDay() }).state).toBe("unavailable");
    expect(getPartnerOpenStatus({ timeZone: "America/New_York", weekly: [] }).state).toBe("unavailable");
  });

  it("shows Open Now with the closing time", () => {
    const status = getPartnerOpenStatus(daily("12:00", "22:00"), ny("2026-10-12T13:00:00"));
    expect(status).toMatchObject({ state: "open", label: "Open Now", detail: "Closes at 10 PM" });
  });

  it("shows Closing Soon within the last hour", () => {
    const status = getPartnerOpenStatus(daily("12:00", "22:00"), ny("2026-10-12T21:15:00"));
    expect(status).toMatchObject({ state: "closing_soon", label: "Closing Soon", detail: "Closes at 10 PM" });
  });

  it("shows Closed with today's opening time before opening", () => {
    const status = getPartnerOpenStatus(daily("12:00", "22:00"), ny("2026-10-12T09:00:00"));
    expect(status).toMatchObject({ state: "closed", label: "Closed", detail: "Opens today at 12 PM" });
  });

  it("shows Closed with tomorrow's opening time after closing", () => {
    const status = getPartnerOpenStatus(daily("07:00", "12:00"), ny("2026-10-12T15:00:00"));
    expect(status).toMatchObject({ state: "closed", detail: "Opens tomorrow at 7 AM" });
  });

  it("treats the closing minute as closed", () => {
    expect(getPartnerOpenStatus(daily("12:00", "22:00"), ny("2026-10-12T22:00:00")).state).toBe("closed");
    expect(getPartnerOpenStatus(daily("12:00", "22:00"), ny("2026-10-12T12:00:00")).state).toBe("open");
  });

  it("uses the business time zone, not the device or UTC", () => {
    // 01:00 UTC on Oct 13 is 9 PM on Oct 12 in New York.
    const status = getPartnerOpenStatus(daily("12:00", "22:00"), new Date("2026-10-13T01:00:00Z"));
    expect(status.state).toBe("closing_soon");
    const la: PartnerHours = { timeZone: "America/Los_Angeles", weekly: everyDay({ open: "12:00", close: "22:00" }) };
    // Same instant is 6 PM in Los Angeles.
    expect(getPartnerOpenStatus(la, new Date("2026-10-13T01:00:00Z"))).toMatchObject({
      state: "open",
      detail: "Closes at 10 PM",
    });
  });

  it("handles DST: same wall-clock hours in winter", () => {
    const winterNoonish = new Date("2026-12-14T17:30:00Z"); // 12:30 PM EST
    expect(getPartnerOpenStatus(daily("12:00", "22:00"), winterNoonish).state).toBe("open");
  });

  it("handles the spring-forward day (Mar 8, 2026: 2 AM jumps to 3 AM)", () => {
    // Daytime hours on the transition day keep their wall-clock times.
    expect(getPartnerOpenStatus(daily("12:00", "22:00"), new Date("2026-03-08T17:00:00Z"))).toMatchObject({
      state: "open",
      detail: "Closes at 10 PM",
    });
    expect(getPartnerOpenStatus(daily("12:00", "22:00"), new Date("2026-03-08T06:30:00Z")).detail).toBe(
      "Opens today at 12 PM",
    );
    // Overnight shift ending at 3 AM: at 1:30 AM EST only 30 real minutes remain, so it is closing soon.
    const late = daily("22:00", "03:00");
    expect(getPartnerOpenStatus(late, new Date("2026-03-08T06:30:00Z"))).toMatchObject({
      state: "closing_soon",
      detail: "Closes at 3 AM",
    });
    // 12:30 AM EST: 150 wall-clock minutes to 3 AM, but only 90 real minutes.
    expect(getPartnerOpenStatus(late, new Date("2026-03-08T05:30:00Z")).state).toBe("open");
    // 3:00 AM EDT, the moment after the shift ends.
    expect(getPartnerOpenStatus(late, new Date("2026-03-08T07:00:00Z")).state).toBe("closed");
    // A close time inside the skipped hour (2:30 AM) is closed once the clock reads 3 AM.
    const skipped = daily("20:00", "02:30");
    expect(getPartnerOpenStatus(skipped, new Date("2026-03-08T06:59:00Z")).state).not.toBe("closed");
    expect(getPartnerOpenStatus(skipped, new Date("2026-03-08T07:00:00Z")).state).toBe("closed");
  });

  it("handles the fall-back day (Nov 1, 2026: 1 AM repeats)", () => {
    const late = daily("20:00", "02:00");
    // First 1:30 AM (EDT): 90 real minutes remain because the 1 AM hour repeats.
    expect(getPartnerOpenStatus(late, new Date("2026-11-01T05:30:00Z"))).toMatchObject({
      state: "open",
      detail: "Closes at 2 AM",
    });
    // Second 1:30 AM (EST): 30 minutes remain.
    expect(getPartnerOpenStatus(late, new Date("2026-11-01T06:30:00Z")).state).toBe("closing_soon");
    // 2:30 AM EST: closed.
    expect(getPartnerOpenStatus(late, new Date("2026-11-01T07:30:00Z")).state).toBe("closed");
    // Daytime hours after the change use EST wall-clock times.
    expect(getPartnerOpenStatus(daily("12:00", "22:00"), new Date("2026-11-01T17:30:00Z")).detail).toBe(
      "Closes at 10 PM",
    );
  });

  it("supports per-weekday hours and closed weekdays", () => {
    const hours: PartnerHours = {
      timeZone: "America/New_York",
      weekly: [
        [], // Sunday closed
        [{ open: "09:00", close: "17:00" }],
        [{ open: "09:00", close: "17:00" }],
        [{ open: "09:00", close: "17:00" }],
        [{ open: "09:00", close: "17:00" }],
        [{ open: "09:00", close: "21:00" }],
        [{ open: "10:00", close: "14:00" }],
      ],
    };
    // Saturday 3 PM: closed, Sunday closed, so next is Monday.
    expect(getPartnerOpenStatus(hours, ny("2026-10-17T15:00:00")).detail).toBe("Opens Monday at 9 AM");
    expect(getPartnerOpenStatus(hours, ny("2026-10-16T19:00:00")).detail).toBe("Closes at 9 PM");
  });

  it("supports multiple intervals in one day (lunch break)", () => {
    const hours: PartnerHours = {
      timeZone: "America/New_York",
      weekly: everyDay({ open: "11:00", close: "14:00" }, { open: "17:00", close: "21:30" }),
    };
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T15:00:00")).detail).toBe("Opens today at 5 PM");
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T18:00:00")).detail).toBe("Closes at 9:30 PM");
    expect(getTodayHoursLabel(hours, ny("2026-10-12T08:00:00"))).toBe("11 AM \u2013 2 PM, 5 PM \u2013 9:30 PM");
  });

  it("supports overnight hours that cross midnight", () => {
    const hours = daily("18:00", "02:00");
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T23:00:00"))).toMatchObject({
      state: "open",
      detail: "Closes at 2 AM",
    });
    // 1:30 AM Tuesday is still inside Monday's late shift, and within the closing-soon hour.
    expect(getPartnerOpenStatus(hours, ny("2026-10-13T01:30:00"))).toMatchObject({ state: "closing_soon" });
    expect(getPartnerOpenStatus(hours, ny("2026-10-13T03:00:00")).detail).toBe("Opens today at 6 PM");
  });

  it("merges back-to-back intervals so a midnight handoff is not shown as closing", () => {
    const hours: PartnerHours = { timeZone: "America/New_York", weekly: everyDay({ open: "00:00", close: "24:00" }) };
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T23:30:00"))).toMatchObject({
      state: "open",
      detail: "Open 24 hours",
    });
    expect(getTodayHoursLabel(hours, ny("2026-10-12T10:00:00"))).toBe("Open 24 hours");
  });

  it("applies holiday hours instead of the weekly schedule", () => {
    const hours: PartnerHours = {
      ...daily("12:00", "22:00"),
      special: [{ date: "2026-10-12", label: "Holiday hours", intervals: [{ open: "12:00", close: "17:00" }] }],
    };
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T16:30:00"))).toMatchObject({
      state: "closing_soon",
      detail: "Closes at 5 PM",
      note: "Holiday hours",
    });
    expect(getTodayHoursLabel(hours, ny("2026-10-12T10:00:00"))).toBe("12 PM \u2013 5 PM");
  });

  it("applies a closed holiday", () => {
    const hours: PartnerHours = {
      ...daily("12:00", "22:00"),
      special: [{ date: "2026-11-26", label: "Thanksgiving", closed: true }],
    };
    const status = getPartnerOpenStatus(hours, new Date("2026-11-26T18:00:00Z"));
    expect(status).toMatchObject({ state: "closed", detail: "Opens tomorrow at 12 PM", note: "Thanksgiving" });
  });

  it("keeps the previous night's overnight shift when today is a holiday closure", () => {
    const hours: PartnerHours = {
      ...daily("20:00", "02:00"),
      special: [{ date: "2026-10-13", label: "Closed for the holiday", closed: true }],
    };
    // 1 AM Oct 13 belongs to Monday's shift, which is not affected by Tuesday's closure.
    expect(getPartnerOpenStatus(hours, ny("2026-10-13T01:00:00")).state).toBe("closing_soon");
    expect(getPartnerOpenStatus(hours, ny("2026-10-13T21:00:00"))).toMatchObject({
      state: "closed",
      detail: "Opens tomorrow at 8 PM",
      note: "Closed for the holiday",
    });
  });

  it("combines split shifts with an overnight late shift", () => {
    const hours: PartnerHours = {
      timeZone: "America/New_York",
      weekly: everyDay({ open: "07:00", close: "11:00" }, { open: "21:00", close: "01:00" }),
    };
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T12:00:00")).detail).toBe("Opens today at 9 PM");
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T23:00:00")).detail).toBe("Closes at 1 AM");
    expect(getPartnerOpenStatus(hours, ny("2026-10-13T02:00:00")).detail).toBe("Opens today at 7 AM");
  });

  it("applies temporary closures across several days", () => {
    const hours: PartnerHours = {
      ...daily("12:00", "22:00"),
      closures: [{ from: "2026-10-12", to: "2026-10-14", reason: "Closed for renovations" }],
    };
    const status = getPartnerOpenStatus(hours, ny("2026-10-12T13:00:00"));
    expect(status).toMatchObject({
      state: "closed",
      detail: "Opens Thursday at 12 PM",
      note: "Closed for renovations",
    });
    expect(getTodayHoursLabel(hours, ny("2026-10-12T13:00:00"))).toBe("Closed today");
  });

  it("says Closed without a guess when nothing opens in the next week", () => {
    const hours: PartnerHours = {
      ...daily("12:00", "22:00"),
      closures: [{ from: "2026-10-01", to: "2026-12-31", reason: null }],
    };
    expect(getPartnerOpenStatus(hours, ny("2026-10-12T13:00:00"))).toMatchObject({
      state: "closed",
      detail: null,
      note: "Temporarily closed",
    });
  });
});

describe("isPartnerOpenNow", () => {
  it("counts closing soon as open and unknown hours as not open", () => {
    expect(isPartnerOpenNow(daily("12:00", "22:00"), ny("2026-10-12T21:30:00"))).toBe(true);
    expect(isPartnerOpenNow(null, ny("2026-10-12T13:00:00"))).toBe(false);
  });
});

describe("weekly and special rows", () => {
  it("lists Monday-first rows and flags today", () => {
    const rows = getWeeklyHoursRows(daily("07:00", "12:00"), ny("2026-10-14T09:00:00"));
    expect(rows.map((row) => row.day)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(rows.find((row) => row.isToday)?.day).toBe("Wednesday");
    expect(rows[0].hours).toBe("7 AM \u2013 12 PM");
  });

  it("lists upcoming holiday hours and closures", () => {
    const hours: PartnerHours = {
      ...daily("12:00", "22:00"),
      special: [{ date: "2026-10-13", label: "Short day", intervals: [{ open: "12:00", close: "16:00" }] }],
      closures: [{ from: "2026-10-20", to: "2026-10-20", reason: "Staff event" }],
    };
    expect(getUpcomingSpecialHours(hours, ny("2026-10-12T10:00:00"))).toEqual([
      { date: "2026-10-13", dateLabel: "Tomorrow", hours: "12 PM \u2013 4 PM", note: "Short day" },
      { date: "2026-10-20", dateLabel: "Tue, Oct 20", hours: "Closed", note: "Staff event" },
    ]);
  });
});

describe("parsePartnerHours", () => {
  it("accepts a valid schedule and defaults the time zone", () => {
    const parsed = parsePartnerHours({ weekly: everyDay({ open: "09:00", close: "17:00" }) });
    expect(parsed?.timeZone).toBe("America/New_York");
  });

  it("rejects malformed input rather than guessing", () => {
    expect(parsePartnerHours(null)).toBeNull();
    expect(parsePartnerHours(["Mon-Fri 9-5"])).toBeNull();
    expect(parsePartnerHours({ weekly: everyDay({ open: "9am", close: "5pm" }) })).toBeNull();
    expect(parsePartnerHours({ weekly: everyDay({ open: "09:00", close: "25:00" }) })).toBeNull();
    expect(parsePartnerHours({ timeZone: "Nowhere/City", weekly: everyDay() })).toBeNull();
    expect(
      parsePartnerHours({ weekly: everyDay(), closures: [{ from: "2026-10-20", to: "2026-10-10" }] }),
    ).toBeNull();
  });
});

describe("formatClockMinutes", () => {
  it("formats 12-hour times", () => {
    expect(formatClockMinutes(0)).toBe("12 AM");
    expect(formatClockMinutes(12 * 60)).toBe("12 PM");
    expect(formatClockMinutes(21 * 60 + 30)).toBe("9:30 PM");
    expect(formatClockMinutes(26 * 60)).toBe("2 AM");
  });
});
