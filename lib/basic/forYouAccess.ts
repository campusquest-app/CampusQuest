import type { BasicEntitlement } from "@/lib/basic/entitlement";

export type ForYouAccessStatus = "loading" | "active" | "inactive" | "unknown";

export type ForYouRecommendationGate =
  | { status: "allowed" }
  | { status: "upgrade_required" }
  | { status: "unknown" };

/** Personalized For You is allowed only for a known, active Basic window. */
export function forYouRecommendationGate(entitlement: BasicEntitlement): ForYouRecommendationGate {
  if (!entitlement.known) return { status: "unknown" };
  if (!entitlement.active) return { status: "upgrade_required" };
  return { status: "allowed" };
}

export function shouldPersonalizeForYouEvents(input: {
  timeframe: string;
  searching: boolean;
  access: ForYouAccessStatus;
}): boolean {
  return input.access === "active" && input.timeframe === "for_you" && !input.searching;
}

export type ForYouSurface = "browse" | "checking" | "unavailable" | "upgrade";

/**
 * For You stays blank until entitlement is known.
 * Search, saved, and every other timeframe keep the normal event list.
 */
export function forYouSurface(input: {
  timeframe: string;
  searching: boolean;
  access: ForYouAccessStatus;
}): ForYouSurface {
  if (input.searching || input.timeframe !== "for_you") return "browse";
  if (input.access === "active") return "browse";
  if (input.access === "inactive") return "upgrade";
  if (input.access === "unknown") return "unavailable";
  return "checking";
}
