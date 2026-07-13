import type { RealmTravelMode } from "@/lib/realm/realmDirectionsTypes";

export function buildGoogleMapsDirectionsUrl(args: {
  origin?: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode?: RealmTravelMode;
}): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${args.destination.lat},${args.destination.lng}`,
    travelmode: args.travelMode === "DRIVING" ? "driving" : "walking",
  });
  if (args.origin) {
    params.set("origin", `${args.origin.lat},${args.origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
