import { buildExternalEventLocationName } from "@/lib/externalEventLocation";
import {
  resolveCampusLocationFromEventFields,
  type LocationMatch,
  type LocationMatchSource,
  type ResolvedCampusLocation,
} from "@/lib/server/urinvolved/locationAliases";
import type { UrinvolvedEventAddressRaw } from "@/lib/server/urinvolved/fetchSources";

export function buildUrinvolvedAddressString(address: UrinvolvedEventAddressRaw | null | undefined): string | null {
  if (!address) return null;
  if (address.address?.trim()) return address.address.trim();

  const cityState = [address.city?.trim(), address.state?.trim()].filter(Boolean).join(", ");
  const parts = [address.line1?.trim(), address.line2?.trim(), cityState || null, address.zip?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export type ResolvedUrinvolvedEventLocation = {
  venueName: string | null;
  address: string | null;
  locationName: string;
  locationMatch: LocationMatch | null;
  matchedBy: LocationMatchSource | null;
  aliasMatched: boolean;
  mapPinAvailable: boolean;
};

export function resolveUrinvolvedEventLocation(input: {
  venueName: string | null;
  address: string | null;
  description?: string | null;
}): ResolvedUrinvolvedEventLocation {
  const venueName = input.venueName?.trim() || null;
  const address = input.address?.trim() || null;
  const locationName = buildExternalEventLocationName(venueName, address);
  const resolved = resolveCampusLocationFromEventFields({
    venueName,
    locationName,
    address,
    description: input.description,
  });

  return {
    venueName,
    address,
    locationName,
    locationMatch: resolved.locationMatch,
    matchedBy: resolved.matchedBy,
    aliasMatched: resolved.aliasMatched,
    mapPinAvailable: resolved.mapPinAvailable,
  };
}

export function classifyImportedEventLocation(input: {
  venueName: string | null;
  address: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
}): ResolvedCampusLocation & {
  missingLocation: boolean;
  onMap: boolean;
  matchedWithoutMapPin: boolean;
} {
  const venue = input.venueName?.trim() || null;
  const address = input.address?.trim() || null;
  const locationName = input.locationName?.trim() || buildExternalEventLocationName(venue, address);
  const resolved = resolveCampusLocationFromEventFields({
    venueName: venue,
    locationName,
    address,
  });

  const missingLocation = !venue && !address && (!locationName || locationName === "Location TBA");
  const onMap = input.latitude != null && input.longitude != null;
  const matchedWithoutMapPin = resolved.aliasMatched && !resolved.mapPinAvailable && !onMap;

  return {
    ...resolved,
    missingLocation,
    onMap,
    matchedWithoutMapPin,
  };
}
