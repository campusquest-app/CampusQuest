import type { RealmTravelMode } from "@/lib/realm/realmDirectionsTypes";

export function buildGoogleMapsDirectionsUrl(args: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode?: RealmTravelMode;
}): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${args.origin.lat},${args.origin.lng}`,
    destination: `${args.destination.lat},${args.destination.lng}`,
    travelmode: args.travelMode === "DRIVING" ? "driving" : "walking",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
