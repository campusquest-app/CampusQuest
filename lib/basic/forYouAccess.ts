/**
 * For You is a free Events tab for every signed-in user.
 * CampusQuest Basic / cq_basic_access must not gate this journey.
 */

export function shouldPersonalizeForYouEvents(input: {
  timeframe: string;
  searching: boolean;
}): boolean {
  return input.timeframe === "for_you" && !input.searching;
}

export type ForYouSurface = "browse";

/**
 * For You always shows the personalized catalog. Search, saved, and other
 * timeframes also browse — there is no upgrade or entitlement wall.
 */
export function forYouSurface(input: {
  timeframe: string;
  searching: boolean;
}): ForYouSurface {
  void input;
  return "browse";
}
