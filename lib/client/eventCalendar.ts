import { DEFAULT_EVENT_DURATION_MS } from "@/lib/realm/eventVisibility";

export type EventCalendarInput = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  startsAt: string | null | undefined;
  endsAt?: string | null | undefined;
};

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join("\r\n");
}

/** Resolve calendar start/end. Missing end uses the shared 2-hour map default. */
export function resolveEventCalendarTimes(
  startsAt: string | null | undefined,
  endsAt?: string | null | undefined,
): { start: Date; end: Date } | null {
  const start = parseInstant(startsAt);
  if (!start) return null;
  const parsedEnd = parseInstant(endsAt);
  const end = parsedEnd && parsedEnd.getTime() > start.getTime()
    ? parsedEnd
    : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
  return { start, end };
}

export function buildEventIcs(input: EventCalendarInput): string | null {
  const times = resolveEventCalendarTimes(input.startsAt, input.endsAt);
  if (!times) return null;

  const uid = `campusquest-event-${input.id.replace(/[^a-zA-Z0-9_-]/g, "")}@campusquest.app`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CampusQuest//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(times.start)}`,
    `DTEND:${toIcsUtc(times.end)}`,
    `SUMMARY:${icsEscape(input.title.trim() || "CampusQuest event")}`,
  ];
  if (input.description?.trim()) lines.push(`DESCRIPTION:${icsEscape(input.description.trim())}`);
  if (input.location?.trim()) lines.push(`LOCATION:${icsEscape(input.location.trim())}`);
  if (input.url?.trim()) lines.push(`URL:${icsEscape(input.url.trim())}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function eventCalendarFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "campusquest-event"}.ics`;
}

export function downloadEventIcs(input: EventCalendarInput): boolean {
  const ics = buildEventIcs(input);
  if (!ics || typeof document === "undefined") return false;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = eventCalendarFilename(input.title);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1500);
  return true;
}
