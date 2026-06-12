import { buildExternalEventLocationName } from "@/lib/externalEventLocation";

export type ParsedUrinvolvedEvent = {
  externalId: string;
  title: string;
  description: string;
  venueName: string | null;
  address: string | null;
  locationName: string | null;
  organizationName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string | null;
  eventUrl: string;
  category: string | null;
  tags: string[];
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(html: string): string {
  return decodeXmlEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(block: string, pattern: RegExp): string | null {
  const match = block.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function allMatches(block: string, pattern: RegExp): string[] {
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  return Array.from(block.matchAll(globalPattern))
    .map((m) => m[1]?.trim())
    .filter(Boolean) as string[];
}

function parseRfc822Date(value: string | null): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractExternalId(guidOrLink: string): string | null {
  const match = guidOrLink.match(/\/event\/(\d+)/i);
  return match?.[1] ?? null;
}

/** Parse Campus Labs Engage RSS feed from urinvolved.uri.edu/events.rss */
export function parseUrinvolvedEventsRss(xml: string): ParsedUrinvolvedEvent[] {
  const items = xml.split(/<item>/i).slice(1);
  const parsed: ParsedUrinvolvedEvent[] = [];

  for (const rawItem of items) {
    const block = rawItem.split(/<\/item>/i)[0] ?? rawItem;
    const title = decodeXmlEntities(firstMatch(block, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) ?? "");
    const guid = firstMatch(block, /<guid>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i);
    const link = firstMatch(block, /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const externalId = extractExternalId(guid ?? link ?? "");
    if (!externalId || !title) continue;

    const descriptionRaw =
      firstMatch(block, /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) ?? "";
    const descriptionFromHtml =
      firstMatch(descriptionRaw, /<div class="p-description description">([\s\S]*?)<\/div>/i) ??
      descriptionRaw;
    const description = stripHtml(descriptionFromHtml);

    const locationFromNs = firstMatch(block, /<location[^>]*xmlns="events"[^>]*>([\s\S]*?)<\/location>/i);
    const locationFromHtml = firstMatch(
      descriptionRaw,
      /<span class="p-location location">([\s\S]*?)<\/span>/i,
    );
    const venueName = decodeXmlEntities(locationFromNs ?? locationFromHtml ?? "").trim() || null;

    const addressFromNs = firstMatch(block, /<address[^>]*xmlns="events"[^>]*>([\s\S]*?)<\/address>/i);
    const addressFromHtml = firstMatch(
      descriptionRaw,
      /<span class="p-street-address street-address">([\s\S]*?)<\/span>/i,
    );
    const address = decodeXmlEntities(addressFromNs ?? addressFromHtml ?? "").trim() || null;
    const locationName = buildExternalEventLocationName(venueName, address);

    const startRaw =
      firstMatch(block, /<start[^>]*xmlns="events"[^>]*>([\s\S]*?)<\/start>/i) ??
      firstMatch(descriptionRaw, /datetime="([^"]+)"/i);
    const endRaw = firstMatch(block, /<end[^>]*xmlns="events"[^>]*>([\s\S]*?)<\/end>/i);
    const startsAt = parseRfc822Date(startRaw);
    const endsAt = parseRfc822Date(endRaw);

    const hosts = allMatches(block, /<host[^>]*xmlns="events"[^>]*>([\s\S]*?)<\/host>/i);
    const organizationName = hosts.length > 0 ? hosts.join(", ") : null;

    const categories = allMatches(block, /<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/i);
    const tags = categories.map((c) => decodeXmlEntities(c)).filter(Boolean);
    const category = tags[0] ?? null;

    const imageUrl = firstMatch(block, /<enclosure[^>]+url="([^"]+)"/i);

    parsed.push({
      externalId,
      title,
      description,
      venueName,
      address,
      locationName,
      organizationName,
      startsAt,
      endsAt,
      imageUrl,
      eventUrl: link ?? `https://urinvolved.uri.edu/event/${externalId}`,
      category,
      tags,
    });
  }

  return parsed;
}
