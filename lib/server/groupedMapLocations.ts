import { getCampusLocations } from "@/lib/server/campusLocationsDb";
import { getCampusLocationPreset, isCampusLocationKey, isValidCampusCoordinate, resolveCampusLocation } from "@/lib/campusLocations";
import { getCampusLocation } from "@/lib/locations/registry";
import { resolveRealmLocationIdFromFields } from "@/lib/locations/resolveRealmLocationId";
import {
  attachesToLandmark,
  campusKeyForRealmLocationId,
  type GroupedMapLocation,
  type MapEventPin,
  type MapQuestPin,
  type MapQrPin,
  realmLocationIdForCampusKey,
} from "@/lib/mapLocationGroups";
import { geoToRealmMapPercent, realmMapPercentToGeo } from "@/lib/realm/geoToMapPercent";
import { ApiError } from "@/lib/server/http";
import { isAdminQuestCurrentlyActive, isAdminQuestsSchemaError } from "@/lib/server/adminQuests";
import type { AdminQuestRow } from "@/lib/adminQuestTypes";
import { isExpiredAt, mapPercentForCoordinates } from "@/lib/server/campusMapPins";
import { createAdminClient } from "@/lib/server/supabase";
import { resolveCampusLocationFromEventFields } from "@/lib/server/urinvolved/locationAliases";
import { eventDedupeKey, getTodayExternalEventsForMap } from "@/lib/server/urinvolved/todayMapEvents";

type GroupBucket = {
  groupKey: string;
  locationKey: GroupedMapLocation["locationKey"];
  realmLocationId: GroupedMapLocation["realmLocationId"];
  locationName: string;
  locationAddress: string | null;
  x: number;
  y: number;
  lat: number | null;
  lng: number | null;
  attachToLandmark: boolean;
  qrCodes: MapQrPin[];
  quests: MapQuestPin[];
  events: MapEventPin[];
};

/** Best real-world coordinates for a group: explicit lat/lng, else derived from percent pins. */
function groupGeo(args: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  x: number;
  y: number;
}): { lat: number; lng: number } {
  if (
    typeof args.lat === "number" &&
    typeof args.lng === "number" &&
    isValidCampusCoordinate(args.lat, args.lng)
  ) {
    return { lat: args.lat, lng: args.lng };
  }
  const geo = realmMapPercentToGeo(args.x, args.y);
  return { lat: geo.latitude, lng: geo.longitude };
}

function otherGroupKey(lat: number, lng: number): string {
  return `other:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

function resolveGroupMeta(args: {
  locationId?: string | null;
  locationKey?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  mapPinX?: number | null;
  mapPinY?: number | null;
}): Omit<GroupBucket, "qrCodes" | "quests" | "events"> | null {
  const canonicalId = resolveRealmLocationIdFromFields({
    locationId: args.locationId,
    locationKey: args.locationKey,
  });

  if (canonicalId) {
    const entry = getCampusLocation(canonicalId);
    const coords = mapPercentForCoordinates({
      lat: entry.latitude,
      lng: entry.longitude,
      mapPinX: args.mapPinX ?? entry.mapX,
      mapPinY: args.mapPinY ?? entry.mapY,
    });
    if (!coords) return null;

    return {
      groupKey: canonicalId,
      locationKey: entry.legacyCampusKey,
      realmLocationId: canonicalId,
      locationName: entry.name,
      locationAddress: args.locationAddress ?? null,
      x: coords.x,
      y: coords.y,
      lat: entry.latitude,
      lng: entry.longitude,
      attachToLandmark: true,
    };
  }

  const resolved = resolveCampusLocation({
    location_key: args.locationKey ?? null,
    location_name: args.locationName ?? null,
    location_address: args.locationAddress ?? null,
    location_lat: args.locationLat ?? null,
    location_lng: args.locationLng ?? null,
  });

  if (!resolved.showOnMap) return null;

  const key = resolved.locationKey;
  const realmLocationId = realmLocationIdForCampusKey(key);
  const attachToLandmark = attachesToLandmark(key);
  const coords = mapPercentForCoordinates({
    lat: resolved.locationLat,
    lng: resolved.locationLng,
    mapPinX: args.mapPinX ?? resolved.mapPinX,
    mapPinY: args.mapPinY ?? resolved.mapPinY,
  });
  if (!coords) return null;

  const groupKey =
    attachToLandmark && realmLocationId
      ? realmLocationId
      : key && key !== "other"
        ? key
        : otherGroupKey(resolved.locationLat as number, resolved.locationLng as number);

  const geo = groupGeo({ lat: resolved.locationLat, lng: resolved.locationLng, x: coords.x, y: coords.y });

  return {
    groupKey,
    locationKey: key,
    realmLocationId,
    locationName: resolved.locationName ?? "Campus location",
    locationAddress: resolved.locationAddress,
    x: coords.x,
    y: coords.y,
    lat: geo.lat,
    lng: geo.lng,
    attachToLandmark,
  };
}

function getOrCreateBucket(map: Map<string, GroupBucket>, meta: Omit<GroupBucket, "qrCodes" | "quests" | "events">): GroupBucket {
  const existing = map.get(meta.groupKey);
  if (existing) return existing;
  const bucket: GroupBucket = { ...meta, qrCodes: [], quests: [], events: [] };
  map.set(meta.groupKey, bucket);
  return bucket;
}

function inferCampusKeyFromEventLocation(locationName: string): GroupedMapLocation["locationKey"] {
  const normalized = locationName.trim().toLowerCase();
  if (!normalized) return null;

  for (const key of ["quad", "library", "memorial_union", "mackal_rec_center", "ryan_center", "dining_hall", "dorm_residence", "academic_building"] as const) {
    const preset = getCampusLocationPreset(key);
    if (normalized.includes(preset.label.toLowerCase())) return key;
  }

  const resolved = resolveCampusLocationFromEventFields({ locationName });
  const realmId = resolved.locationMatch?.realmLocationId;
  if (realmId) return campusKeyForRealmLocationId(realmId);

  return null;
}

function eventGroupMeta(locationKey: GroupedMapLocation["locationKey"], locationName: string): Omit<GroupBucket, "qrCodes" | "quests" | "events"> | null {
  if (!locationKey) return null;
  if (locationKey === "other") return null;

  const preset = getCampusLocationPreset(locationKey);
  const map = geoToRealmMapPercent(preset.latitude, preset.longitude);
  const realmLocationId = realmLocationIdForCampusKey(locationKey);
  const attachToLandmark = attachesToLandmark(locationKey);

  return {
    groupKey: attachToLandmark && realmLocationId ? realmLocationId : locationKey,
    locationKey,
    realmLocationId,
    locationName: preset.label,
    locationAddress: preset.address,
    x: map.x,
    y: map.y,
    lat: preset.latitude,
    lng: preset.longitude,
    attachToLandmark,
  };
}

/**
 * Bucket meta for external events at known campus buildings that are not
 * (yet) catalog Realm locations — pins by raw coordinates as a standalone
 * supplementary marker (e.g. Weldin Hall).
 */
function externalEventCoordsMeta(match: {
  locationName: string;
  latitude: number;
  longitude: number;
}): Omit<GroupBucket, "qrCodes" | "quests" | "events"> | null {
  if (!isValidCampusCoordinate(match.latitude, match.longitude)) return null;
  const map = geoToRealmMapPercent(match.latitude, match.longitude);
  return {
    groupKey: `ext-event:${match.locationName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    locationKey: "other",
    realmLocationId: null,
    locationName: match.locationName,
    locationAddress: null,
    x: map.x,
    y: map.y,
    lat: match.latitude,
    lng: match.longitude,
    attachToLandmark: false,
  };
}

export async function listGroupedMapLocations(): Promise<GroupedMapLocation[]> {
  const catalogRows = await getCampusLocations({ refreshCache: true });
  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const buckets = new Map<string, GroupBucket>();

  const externalEventsPromise = getTodayExternalEventsForMap({
    catalog: catalogRows.map((row) => ({ slug: row.slug, name: row.name })),
    now,
  }).catch(() => []);

  const [questsResult, qrResult, eventsResult] = await Promise.all([
    admin
      .from("admin_quests")
      .select(
        "id, name, description, xp_reward, difficulty, completion_method, requires_qr, qr_code_id, location_id, location_key, location_name, location_address, location_lat, location_lng, map_pin_x, map_pin_y, icon, starts_at, ends_at, visibility_status, deleted_at",
      )
      .eq("visibility_status", "active")
      .is("deleted_at", null)
      .or("location_key.not.is.null,location_id.not.is.null"),
    admin
      .from("qr_codes")
      .select(
        "id, code, title, description, xp_reward, is_active, starts_at, expires_at, admin_quest_id, location_key, location_name, location_address, location_lat, location_lng",
      )
      .eq("is_active", true)
      .not("location_key", "is", null),
    admin
      .from("campus_events")
      .select("id, title, starts_at, ends_at, location_name, is_cancelled, host_organization_id, student_organizations(name)")
      .eq("is_cancelled", false)
      .gte("starts_at", nowIso),
  ]);

  if (questsResult.error && !isAdminQuestsSchemaError(questsResult.error)) {
    throw new ApiError(400, questsResult.error.message, "ADMIN_QUEST_MAP_PINS_FAILED");
  }
  if (qrResult.error) {
    throw new ApiError(400, qrResult.error.message, "QR_CODE_MAP_PINS_FAILED");
  }

  for (const row of questsResult.data ?? []) {
    const quest = row as AdminQuestRow;
    if (!isAdminQuestCurrentlyActive(quest, now)) continue;
    if (isExpiredAt(quest.ends_at, now)) continue;

    const meta = resolveGroupMeta({
      locationId: (row.location_id as string | null) ?? null,
      locationKey: (row.location_key as string | null) ?? null,
      locationName: (row.location_name as string | null) ?? null,
      locationAddress: (row.location_address as string | null) ?? null,
      locationLat: row.location_lat as number | null,
      locationLng: row.location_lng as number | null,
      mapPinX: row.map_pin_x as number | null,
      mapPinY: row.map_pin_y as number | null,
    });
    if (!meta) continue;

    const bucket = getOrCreateBucket(buckets, meta);
    bucket.quests.push({
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? "",
      xpReward: row.xp_reward as number,
      difficulty: (row.difficulty as string | null) ?? null,
      completionMethod: (row.completion_method as string | null) ?? null,
      requiresQr: Boolean(row.requires_qr),
      expiresAt: (row.ends_at as string | null) ?? null,
      icon: (row.icon as string | null) ?? "🎯",
      qrCodeId: (row.qr_code_id as string | null) ?? null,
    });
  }

  for (const row of qrResult.data ?? []) {
    if (isExpiredAt((row.expires_at as string | null) ?? null, now)) continue;
    const startsAt = (row.starts_at as string | null) ?? null;
    if (startsAt && new Date(startsAt) > now) continue;

    const meta = resolveGroupMeta({
      locationKey: (row.location_key as string | null) ?? null,
      locationName: (row.location_name as string | null) ?? null,
      locationAddress: (row.location_address as string | null) ?? null,
      locationLat: row.location_lat as number | null,
      locationLng: row.location_lng as number | null,
    });
    if (!meta) continue;

    const code = String(row.code);
    const bucket = getOrCreateBucket(buckets, meta);
    bucket.qrCodes.push({
      id: String(row.id),
      name: String(row.title),
      description: (row.description as string | null) ?? "",
      xpReward: Number(row.xp_reward ?? 0),
      expiresAt: (row.expires_at as string | null) ?? null,
      scanPath: `/scan?code=${encodeURIComponent(code)}`,
      qrCode: code,
      adminQuestId: (row.admin_quest_id as string | null) ?? null,
    });
  }

  if (!eventsResult.error) {
    for (const row of eventsResult.data ?? []) {
      if (row.ends_at && new Date(String(row.ends_at)) <= now) continue;
      const locationName = String(row.location_name ?? "");
      const locationKey = inferCampusKeyFromEventLocation(locationName);
      const meta = eventGroupMeta(locationKey, locationName);
      if (!meta) continue;

      const bucket = getOrCreateBucket(buckets, meta);
      const org = row.student_organizations as { name?: string } | null;
      bucket.events.push({
        id: String(row.id),
        title: String(row.title),
        startsAt: String(row.starts_at),
        endsAt: (row.ends_at as string | null) ?? null,
        organizationName: org?.name ?? null,
        eventUrl: null,
      });
    }
  }

  // Today's URInvolved events, grouped onto the matching realm locations.
  // Manual admin pins are untouched; duplicates (same title + start) skipped.
  const externalEvents = await externalEventsPromise;
  for (const item of externalEvents) {
    const meta =
      item.match.kind === "realm"
        ? resolveGroupMeta({ locationId: item.match.realmLocationId })
        : externalEventCoordsMeta(item.match);
    if (!meta) continue;
    const bucket = getOrCreateBucket(buckets, meta);
    const key = eventDedupeKey(item.pin);
    const isDuplicate = bucket.events.some(
      (existing) => existing.id === item.pin.id || eventDedupeKey(existing) === key,
    );
    if (!isDuplicate) bucket.events.push(item.pin);
  }

  return Array.from(buckets.values())
    .filter((bucket) => bucket.qrCodes.length + bucket.quests.length + bucket.events.length > 0)
    .map((bucket) => ({
      groupKey: bucket.groupKey,
      locationKey: bucket.locationKey,
      realmLocationId: bucket.realmLocationId,
      locationName: bucket.locationName,
      locationAddress: bucket.locationAddress,
      x: bucket.x,
      y: bucket.y,
      lat: bucket.lat,
      lng: bucket.lng,
      attachToLandmark: bucket.attachToLandmark,
      qrCodes: bucket.qrCodes,
      quests: bucket.quests,
      events: bucket.events,
    }));
}

export function isMapEligibleLocationKey(value: string | null | undefined): boolean {
  if (!value || !isCampusLocationKey(value)) return false;
  if (value === "other") return false;
  return true;
}

export function hasValidCustomMapCoordinates(lat: unknown, lng: unknown): boolean {
  const latNum = lat == null ? null : Number(lat);
  const lngNum = lng == null ? null : Number(lng);
  if (latNum == null || lngNum == null || !Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false;
  return isValidCampusCoordinate(latNum, lngNum);
}
