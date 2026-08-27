/** Strip room/floor suffixes and normalize campus location text for building matching. */
export function normalizeCampusLocationName(value = ""): string {
  return value
    .toLowerCase()
    .replace(/\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+floor\b/g, "")
    .replace(/\b(room|rm|suite|ste|lounge)\s*[a-z0-9-]*/g, "")
    .replace(/[(),.-]/g, " ")
    .replace(/\buri\b/g, "")
    .replace(/\buniversity of rhode island\b/g, "")
    .replace(/\bkingston\b/g, "")
    .replace(/\br\s*i\b/g, "")
    .replace(/\bri\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract the primary campus building name from URInvolved location strings. */
export function extractBuildingName(value = ""): string {
  if (!value.trim()) return "";

  const segments = value
    .split(/[,|–—\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const normalized = normalizeCampusLocationName(segment);
    if (normalized.length >= 4) return normalized;
  }

  return normalizeCampusLocationName(value);
}

/** Title-case a normalized building slug for display / Google queries. */
export function buildingNameForDisplay(normalized: string): string {
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function buildingNameTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((token) => token.length > 2 && !["hall", "building", "center", "centre"].includes(token));
}
