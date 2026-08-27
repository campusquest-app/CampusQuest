import { describe, expect, it } from "vitest";
import { formatEventCardWhen, formatEventDateTimeRange } from "@/lib/client/eventDateTime";

describe("formatEventDateTimeRange", () => {
  const now = new Date("2026-09-08T16:00:00.000Z"); // Tue Sep 8, 12:00 PM EDT

  it("labels today and a same-day end time", () => {
    expect(formatEventDateTimeRange("2026-09-08T14:00:00.000Z", "2026-09-08T16:00:00.000Z", now)).toBe(
      "Today · 10:00 AM–12:00 PM",
    );
  });

  it("labels tomorrow without a raw timestamp", () => {
    expect(formatEventDateTimeRange("2026-09-09T20:30:00.000Z", null, now)).toBe("Tomorrow · 4:30 PM");
  });

  it("uses This weekday for later this week", () => {
    expect(formatEventDateTimeRange("2026-09-12T17:00:00.000Z", null, now)).toBe("This Saturday · 1:00 PM");
  });

  it("uses a short weekday date further out", () => {
    expect(formatEventDateTimeRange("2026-09-15T16:00:00.000Z", "2026-09-15T18:00:00.000Z", now)).toBe(
      "Tue, Sep 15 · 12:00 PM–2:00 PM",
    );
  });

  it("formats compact card times with a bullet", () => {
    expect(formatEventCardWhen("2026-11-04T00:00:00.000Z")).toBe("Tue, Nov 3 • 7:00 PM");
  });

  it("returns Date TBA for missing or invalid starts", () => {
    expect(formatEventDateTimeRange(null, null, now)).toBe("Date TBA");
    expect(formatEventDateTimeRange("not-a-date", null, now)).toBe("Date TBA");
  });
});
