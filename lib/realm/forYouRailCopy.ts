/**
 * Compact copy for For You recommendation cards.
 * Ranking / reason labels stay in mapRecommendations — this only hides redundant UI lines.
 */

export function compactRecommendationSecondaryLine(item: {
  title: string;
  locationName: string;
  timeLabel: string | null;
}): string | null {
  const title = item.title.trim();
  const time = item.timeLabel?.trim() || null;
  const locationBit = meaningfulLocationBit(title, item.locationName);

  if (locationBit && time) return `${locationBit} · ${time}`;
  return locationBit || time;
}

function meaningfulLocationBit(title: string, locationName: string): string | null {
  const location = locationName.trim();
  if (!location) return null;

  const nTitle = normalizeCopy(title);
  let remainder = location;
  const nLoc = normalizeCopy(location);

  if (nLoc === nTitle) return null;

  if (nLoc.startsWith(`${nTitle} · `) || nLoc.startsWith(`${nTitle} - `) || nLoc.startsWith(`${nTitle} – `)) {
    remainder = location.slice(title.trim().length).replace(/^\s*[·\-–]\s*/, "").trim();
  }

  if (!remainder) return null;
  if (/^(campus place|place)$/i.test(remainder)) return null;
  if (normalizeCopy(remainder) === nTitle) return null;
  return remainder;
}

function normalizeCopy(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
