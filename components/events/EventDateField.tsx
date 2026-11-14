"use client";

import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { campusDateKey, campusDateWindow, formatCampusDateLabel } from "@/lib/realm/campusTime";
import { CAMPUS_TIME_ZONE } from "@/lib/realm/eventCountdown";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function campusMonthParts(dateKey: string): { year: number; month: number } | null {
  const window = campusDateWindow(dateKey);
  if (!window) return null;
  const [year, month] = dateKey.split("-").map(Number);
  return { year: year!, month: month! };
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
}

function daysInMonth(year: number, month: number): number {
  for (let day = 31; day >= 28; day -= 1) {
    if (campusDateWindow(`${year}-${pad(month)}-${pad(day)}`)) return day;
  }
  return 28;
}

/** Campus calendar for the Filter Events "Choose a Date" control. */
export function EventDateField({
  date,
  onSelect,
  onClear,
  defaultOpen = false,
}: {
  date: string;
  onSelect: (date: string) => void;
  onClear: () => void;
  /** Open the month grid immediately (header date picker). */
  defaultOpen?: boolean;
}) {
  const todayKey = campusDateKey(new Date());
  const selected = campusMonthParts(date);
  const [open, setOpen] = useState(defaultOpen);
  const [visible, setVisible] = useState(() => selected ?? campusMonthParts(todayKey) ?? { year: 2026, month: 11 });
  const month = selected && !open ? selected : visible;

  const cells = useMemo(() => {
    const firstKey = `${month.year}-${pad(month.month)}-01`;
    const first = campusDateWindow(firstKey);
    const weekday = first
      ? new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, weekday: "short" }).format(first.start)
      : "Sun";
    const leading = Math.max(0, WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]));
    const count = daysInMonth(month.year, month.month);
    const days = Array.from({ length: count }, (_, index) => {
      const day = index + 1;
      return `${month.year}-${pad(month.month)}-${pad(day)}`;
    });
    return { leading, days };
  }, [month.month, month.year]);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(campusDateWindow(`${month.year}-${pad(month.month)}-01`)?.start ?? new Date());

  function show(next: { year: number; month: number }) {
    setVisible(next);
    setOpen(true);
  }

  return (
    <div className="cq-events-date">
      <div className="cq-events-date-row">
        <button
          type="button"
          className={`cq-events-filter-check cq-events-date-toggle${date ? " cq-events-filter-check--on" : ""}`}
          aria-expanded={open}
          aria-controls="cq-events-date-calendar"
          onClick={() => {
            if (selected) setVisible(selected);
            setOpen((current) => !current);
          }}
        >
          <Calendar className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2.2} />
          <span>{date ? formatCampusDateLabel(date) : "Choose a Date"}</span>
        </button>
        {date ? (
          <button type="button" className="cq-events-date-clear" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      {open ? (
        <div id="cq-events-date-calendar" className="cq-events-date-popover" role="dialog" aria-label="Choose a date">
          <div className="cq-events-date-nav">
            <button
              type="button"
              className="cq-events-date-nav-btn"
              aria-label="Previous month"
              onClick={() => show(shiftMonth(month.year, month.month, -1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <p className="cq-events-date-month">{monthLabel}</p>
            <button
              type="button"
              className="cq-events-date-nav-btn"
              aria-label="Next month"
              onClick={() => show(shiftMonth(month.year, month.month, 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="cq-events-cal" role="grid" aria-label={monthLabel}>
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="cq-events-cal-weekday" aria-hidden>
                {weekday.slice(0, 1)}
              </span>
            ))}
            {Array.from({ length: cells.leading }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {cells.days.map((key) => {
              const day = Number(key.slice(-2));
              const selectedDay = key === date;
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  className={`cq-events-cal-day${selectedDay ? " cq-events-cal-day--selected" : ""}${
                    key === todayKey ? " cq-events-cal-day--today" : ""
                  }`}
                  aria-pressed={selectedDay}
                  aria-label={new Intl.DateTimeFormat("en-US", {
                    timeZone: CAMPUS_TIME_ZONE,
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }).format(campusDateWindow(key)!.start)}
                  onClick={() => onSelect(key)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
