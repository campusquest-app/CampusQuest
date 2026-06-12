import { buildExternalEventLocationName } from "@/lib/externalEventLocation";
import { matchCampusLocation, type LocationMatch } from "@/lib/server/urinvolved/locationAliases";
import type { UrinvolvedEventAddressRaw } from "@/lib/server/urinvolved/fetchSources";

export function buildUrinvolvedAddressString(address: UrinvolvedEventAddressRaw | null | undefined): string | null {
  if (!address) return null;
  if (address.address?.trim()) return address.address.trim();

  const cityState = [address.city?.trim(), address.state?.trim()].filter(Boolean).join(", ");
  const parts = [address.line1?.trim(), address.line2?.trim(), cityState || null, address.zip?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function resolveUrinvolvedEventLocation(input: {
  venueName: string | null;
  address: string | null;
}): {
  venueName: string | null;
  address: string | null;
  locationName: string;
  locationMatch: LocationMatch | null;
} {
  const venueName = input.venueName?.trim() || null;
  const address = input.address?.trim() || null;
  const locationName = buildExternalEventLocationName(venueName, address);
  const locationMatch =
    matchCampusLocation(venueName) ?? (!venueName ? matchCampusLocation(locationName) : null);

  return {
    venueName,
    address,
    locationName,
    locationMatch,
  };
}
