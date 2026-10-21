/**
 * View on Map eligibility for event detail actions.
 * Uses campus-day timing (America/New_York via shared realm helpers) and only
 * treats locations as map-ready when they are reliably resolvable — never by
 * fuzzy/similar building-name guessing.
 */

import type { FeedEvent } from "@/lib/client/eventFeedTypes";
import { eventHasMappedLocation } from "@/lib/client/eventDiscovery";
import { athleticsEventEligibleForCampusMap } from "@/lib/eventSources/athleticsMapEligibility";
import { listCampusLocationRegistryEntries } from "@/lib/locations/campusLocationCatalog";
import { hasValidCoordinates } from "@/lib/server/urinvolved/validCoordinates";
import { isLiveOrUpcomingMapEvent, isMapEventCancelled } from "@/lib/realm/eventVisibility";

function normalizeLocationLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Exact catalog name/slug match only (case/diacritic-insensitive).
 * Does not use venue aliases or fuzzy "similar building" matching.
 */
export function findExactCampusLocationId(locationLabel: string | null | undefined): string | null {
  const needle = normalizeLocationLabel(locationLabel ?? "");
  if (!needle || needle === "location tba") return null;
  for (const row of listCampusLocationRegistryEntries()) {
    if (normalizeLocationLabel(row.name) === needle) return row.slug;
    if (normalizeLocationLabel(row.slug.replace(/-/g, " ")) === needle) return row.slug;
    if (normalizeLocationLabel(row.shortLabel) === needle) return row.slug;
  }
  return null;
}

/** True when the feed event has a verified, mappable campus placement. */
export function eventHasVerifiedMapLocation(item: FeedEvent): boolean {
  if (item.kind === "campus") {
    const location = item.event.location?.trim() ?? "";
    if (!location || location === "Location TBA") return false;
    // Campus feed events rarely carry lat/lng; require an exact catalog match.
    return findExactCampusLocationId(location) !== null;
  }

  if (!athleticsEventEligibleForCampusMap({ source: item.event.source, homeAway: item.event.homeAway })) {
    return false;
  }

  // External events must have real coordinates — venue/address strings alone are not enough.
  if (
    hasValidCoordinates({
      latitude: item.event.latitude,
      longitude: item.event.longitude,
    })
  ) {
    return true;
  }

  // Fall back only when the shared mapped-location helper already trusts the row
  // AND the venue exactly matches a campus catalog place (no alias guessing).
  if (!eventHasMappedLocation({
    latitude: item.event.latitude,
    longitude: item.event.longitude,
    venueName: item.event.venueName,
    location: item.event.location,
    address: item.event.address,
    source: item.event.source,
    homeAway: item.event.homeAway,
  })) {
    return false;
  }

  return (
    findExactCampusLocationId(item.event.venueName) !== null ||
    findExactCampusLocationId(item.event.location) !== null
  );
}

/** Upcoming or live, not ended, not canceled — campus timezone via shared helpers. */
export function eventIsViewOnMapTimingEligible(item: FeedEvent, now: Date = new Date()): boolean {
  const cancelled = isMapEventCancelled({
    title: item.event.title,
    cancelled: Boolean(item.event.isCancelled),
  });
  if (cancelled) return false;
  return isLiveOrUpcomingMapEvent(
    {
      startsAt: item.event.startsAt,
      endsAt: item.event.endsAt,
      cancelled,
      title: item.event.title,
    },
    now,
  );
}

/** Show View on Map only when timing and verified location both pass. */
export function eventViewOnMapEligible(item: FeedEvent, now: Date = new Date()): boolean {
  return eventIsViewOnMapTimingEligible(item, now) && eventHasVerifiedMapLocation(item);
}
