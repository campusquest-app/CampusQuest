/** Build the best readable location_name for imported URInvolved events. */
export function buildExternalEventLocationName(
  venueName: string | null | undefined,
  address: string | null | undefined,
): string {
  const venue = venueName?.trim() || null;
  const addr = address?.trim() || null;

  if (venue && addr) {
    if (addr.toLowerCase().includes(venue.toLowerCase())) return addr;
    return `${venue}, ${addr}`;
  }
  if (venue) return venue;
  if (addr) return addr;
  return "Location TBA";
}

/** Split venue and address for card/detail display (dedupes when address already includes venue). */
export function externalEventLocationLines(
  venueName: string | null | undefined,
  address: string | null | undefined,
): { venue: string | null; address: string | null } {
  const venue = venueName?.trim() || null;
  const addr = address?.trim() || null;

  if (venue && addr && addr.toLowerCase().includes(venue.toLowerCase())) {
    return { venue, address: addr };
  }

  return { venue, address: addr };
}

export function externalEventHasLocationData(
  venueName: string | null | undefined,
  address: string | null | undefined,
  locationName: string | null | undefined,
): boolean {
  if (venueName?.trim() || address?.trim()) return true;
  const location = locationName?.trim();
  return Boolean(location && location !== "Location TBA");
}
