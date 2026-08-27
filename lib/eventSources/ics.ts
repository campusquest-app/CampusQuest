export type ParsedIcsEvent = {
  uid: string;
  summary: string;
  description: string;
  location: string;
  url: string;
  startsAt: string | null;
  endsAt: string | null;
  categories: string[];
  status: string | null;
};

function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .trim();
}

function easternCalendarDateToIso(year: string, month: string, day: string): string {
  for (const offset of ["-04:00", "-05:00"] as const) {
    const ms = Date.parse(`${year}-${month}-${day}T00:00:00${offset}`);
    if (Number.isNaN(ms)) continue;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (map.year === year && map.month === month && map.day === day) {
      return new Date(ms).toISOString();
    }
  }
  return `${year}-${month}-${day}T05:00:00.000Z`;
}

function parseIcsDate(value: string): string | null {
  const raw = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    return easternCalendarDateToIso(dateOnly[1], dateOnly[2], dateOnly[3]);
  }
  const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
  if (utc) {
    return `${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}.000Z`;
  }
  const local = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (local) {
    // Sidearm/ICS local times for URI are Eastern. Interpret without inventing offsets beyond TZ.
    const iso = `${local[1]}-${local[2]}-${local[3]}T${local[4]}:${local[5]}:${local[6]}-04:00`;
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  const fallback = Date.parse(raw);
  return Number.isNaN(fallback) ? null : new Date(fallback).toISOString();
}

function propertyValue(line: string): { name: string; value: string } | null {
  const split = line.indexOf(":");
  if (split <= 0) return null;
  const keyPart = line.slice(0, split);
  const value = line.slice(split + 1);
  const name = keyPart.split(";")[0]?.toUpperCase() ?? "";
  if (!name) return null;
  return { name, value };
}

export function parseIcsEvents(raw: string): ParsedIcsEvent[] {
  const unfolded = unfoldIcs(raw.replace(/\r\n/g, "\n"));
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const events: ParsedIcsEvent[] = [];

  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] ?? "";
    let uid = "";
    let summary = "";
    let description = "";
    let location = "";
    let url = "";
    let startsAt: string | null = null;
    let endsAt: string | null = null;
    let status: string | null = null;
    const categories: string[] = [];

    for (const line of body.split("\n")) {
      const parsed = propertyValue(line.trim());
      if (!parsed) continue;
      const value = unescapeIcs(parsed.value);
      if (parsed.name === "UID") uid = value;
      else if (parsed.name === "SUMMARY") summary = value;
      else if (parsed.name === "DESCRIPTION") description = value;
      else if (parsed.name === "LOCATION") location = value;
      else if (parsed.name === "URL") url = value;
      else if (parsed.name === "DTSTART") startsAt = parseIcsDate(value);
      else if (parsed.name === "DTEND") endsAt = parseIcsDate(value);
      else if (parsed.name === "STATUS") status = value;
      else if (parsed.name === "CATEGORIES") {
        categories.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
      }
    }

    if (!summary.trim() || !startsAt) continue;
    events.push({
      uid: uid || `${summary}|${startsAt}`,
      summary: summary.trim(),
      description,
      location,
      url,
      startsAt,
      endsAt,
      categories,
      status,
    });
  }

  return events;
}
