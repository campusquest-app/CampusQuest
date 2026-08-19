import { buildExternalEventLocationName } from "@/lib/externalEventLocation";
import { stripHtmlToText } from "@/lib/server/urinvolved/fetchSources";
import type { ParsedUrinvolvedEvent } from "@/lib/server/urinvolved/parseRssEvents";

const CAMPUSLABS_IMAGE_BASE = "https://se-images.campuslabs.com/clink/images/";

export type UrinvolvedDiscoveryEventRaw = {
  id?: string | number | null;
  name?: string | null;
  description?: string | null;
  location?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  imagePath?: string | null;
  imageUrl?: string | null;
  organizationName?: string | null;
  organizationNames?: string[] | null;
  categoryNames?: string[] | null;
  status?: string | null;
  visibility?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
};

function parseIsoDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function buildDiscoveryEventImageUrl(
  imagePath: string | null | undefined,
  imageUrl?: string | null | undefined,
): string | null {
  if (imageUrl?.trim()) return imageUrl.trim();
  if (!imagePath?.trim()) return null;
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath.trim();
  return `${CAMPUSLABS_IMAGE_BASE}${imagePath.trim()}?preset=med-w`;
}

function organizationFromDiscovery(raw: UrinvolvedDiscoveryEventRaw): string | null {
  const primary = raw.organizationName?.trim();
  if (primary) return primary;
  const names = (raw.organizationNames ?? []).map((n) => n?.trim()).filter(Boolean) as string[];
  return names.length > 0 ? names.join(", ") : null;
}

/** Map Campus Labs Engage discovery search rows into the shared ParsedUrinvolvedEvent shape. */
export function parseUrinvolvedDiscoveryEvents(rows: UrinvolvedDiscoveryEventRaw[]): ParsedUrinvolvedEvent[] {
  const parsed: ParsedUrinvolvedEvent[] = [];

  for (const raw of rows) {
    const externalId = raw.id != null ? String(raw.id).trim() : "";
    const title = raw.name?.trim() ?? "";
    if (!externalId || !title) continue;

    const venueName = raw.location?.trim() || null;
    const locationName = buildExternalEventLocationName(venueName, null);
    const tags = (raw.categoryNames ?? []).map((c) => c?.trim()).filter(Boolean) as string[];
    const status = raw.status?.trim() ?? "";
    if (status && /cancell?ed/i.test(status) && !tags.some((t) => /^cancell?ed$/i.test(t))) {
      tags.push("cancelled");
    }

    parsed.push({
      externalId,
      title,
      description: stripHtmlToText(raw.description ?? null),
      venueName,
      address: null,
      locationName,
      organizationName: organizationFromDiscovery(raw),
      startsAt: parseIsoDate(raw.startsOn),
      endsAt: parseIsoDate(raw.endsOn),
      imageUrl: buildDiscoveryEventImageUrl(raw.imagePath, raw.imageUrl),
      eventUrl: `https://urinvolved.uri.edu/event/${externalId}`,
      category: tags[0] ?? null,
      tags,
    });
  }

  return parsed;
}
