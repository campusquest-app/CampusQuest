import type { HomeAway } from "@/lib/eventSources/types";

/**
 * Campus map pins are only for Athletics events that actually occur on URI's
 * Kingston campus. Home/away is the athletic designation (who hosts), not a
 * guarantee of campus coordinates — e.g. 2026 football "home" games at
 * Centreville Bank Stadium stay in Events/Search/For You without a Realm marker.
 */
export function athleticsEventEligibleForCampusMap(input: {
  source?: string | null;
  homeAway?: HomeAway | string | null;
}): boolean {
  const source = (input.source ?? "").trim().toLowerCase();
  if (source && source !== "athletics") return true;
  return input.homeAway !== "away";
}
