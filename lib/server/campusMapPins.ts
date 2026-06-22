import { resolveCampusLocation } from "@/lib/campusLocations";
import { geoToRealmMapPercent } from "@/lib/realm/geoToMapPercent";

export type CampusMapPin = {
  id: string;
  pinType: "quest" | "qr";
  name: string;
  description: string;
  xpReward: number;
  locationName: string | null;
  locationAddress: string | null;
  icon: string;
  x: number;
  y: number;
  isActive: boolean;
  expiresAt: string | null;
  requiresQr: boolean;
  completionMethod: string | null;
  qrCode: string | null;
  scanPath: string | null;
  difficulty: string | null;
};

export function mapPercentForCoordinates(args: {
  lat: number | null;
  lng: number | null;
  mapPinX?: number | null;
  mapPinY?: number | null;
}): { x: number; y: number } | null {
  if (args.mapPinX != null && args.mapPinY != null) {
    return { x: Number(args.mapPinX), y: Number(args.mapPinY) };
  }
  if (args.lat == null || args.lng == null) return null;
  return geoToRealmMapPercent(args.lat, args.lng);
}

export function locationFieldsFromInput(input: Record<string, unknown>) {
  return resolveCampusLocation({
    locationKey: input.locationKey as string | undefined,
    location_key: input.location_key as string | undefined,
    locationName: input.locationName as string | undefined,
    location_name: input.location_name as string | undefined,
    locationAddress: input.locationAddress as string | undefined,
    location_address: input.location_address as string | undefined,
    locationLat: input.locationLat ?? input.location_lat,
    locationLng: input.locationLng ?? input.location_lng,
  });
}

export function isExpiredAt(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}
