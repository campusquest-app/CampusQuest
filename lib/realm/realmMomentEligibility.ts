import { isRealmLocationId } from "@/lib/realm/locationGeo";

export function shouldCreateRealmMoment(args: {
  visibility: "public" | "friends";
  locationId?: string | null;
}): boolean {
  const locationId = args.locationId?.trim();
  return args.visibility === "public" && !!locationId && isRealmLocationId(locationId);
}
