import type { QuadFeedType } from "@/lib/feedStore";
import type { QuadCommunityChannel } from "@/lib/quadCommunityChannels";

export const MARKET_FEED_TAB = "market" as const;
export const LOCAL_BUSINESSES_FEED_TAB = "local_businesses" as const;

export type QuadFeedTab =
  | QuadFeedType
  | "trending"
  | QuadCommunityChannel
  | typeof MARKET_FEED_TAB
  | typeof LOCAL_BUSINESSES_FEED_TAB;

export type QuadFeedOption = { tab: QuadFeedTab; label: string; hint: string };

/** Order matches the CampusQuest ▼ selector. The Market sits under Organizations. */
export const QUAD_FEED_OPTIONS: QuadFeedOption[] = [
  { tab: "public", label: "Campus Feed", hint: "Everything happening across URI" },
  { tab: "trending", label: "For You", hint: "Trending moments, picked for you" },
  { tab: "friends", label: "Following", hint: "Posts from people you follow" },
  { tab: "student_organizations", label: "Organizations", hint: "Student clubs and campus orgs" },
  { tab: "market", label: "The Market", hint: "Student businesses, products, services, and campus listings" },
  { tab: "local_businesses", label: "Local Businesses", hint: "Deals, updates, and posts from nearby businesses" },
  { tab: "greek_life", label: "Greek Life", hint: "Fraternity and sorority community" },
  { tab: "athletics", label: "Athletics", hint: "Sports, club sports, and Rams" },
];

export function isMarketFeedTab(tab: string | null | undefined): tab is typeof MARKET_FEED_TAB {
  return tab === MARKET_FEED_TAB;
}

export function isLocalBusinessesFeedTab(
  tab: string | null | undefined,
): tab is typeof LOCAL_BUSINESSES_FEED_TAB {
  return tab === LOCAL_BUSINESSES_FEED_TAB;
}

export function isQuadFeedTab(value: string | null | undefined): value is QuadFeedTab {
  return QUAD_FEED_OPTIONS.some((option) => option.tab === value);
}
