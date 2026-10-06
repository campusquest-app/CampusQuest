/** Dedicated Local Businesses quad channel. Campus posts stay on `campus`. */
export const LOCAL_BUSINESSES_FEED = "local_businesses" as const;
export const ORGANIZATIONS_FEED = "organizations" as const;
export const CAMPUS_FEED_DESTINATION = "campus" as const;

export type QuadFeedDestination =
  | typeof CAMPUS_FEED_DESTINATION
  | typeof LOCAL_BUSINESSES_FEED
  | typeof ORGANIZATIONS_FEED;

export function normalizeFeedDestination(value: string | null | undefined): QuadFeedDestination {
  if (value === LOCAL_BUSINESSES_FEED) return LOCAL_BUSINESSES_FEED;
  if (value === ORGANIZATIONS_FEED) return ORGANIZATIONS_FEED;
  return CAMPUS_FEED_DESTINATION;
}

/**
 * Local Businesses is its own feed. Organization posts stay in Organizations and
 * also remain on Campus Feed. Other channels keep ordinary campus posts only.
 */
export function postBelongsInFeed(
  postDestination: string | null | undefined,
  feed: "campus" | "local_businesses" | "organizations" | "other",
): boolean {
  const destination = normalizeFeedDestination(postDestination);
  if (feed === "local_businesses") return destination === LOCAL_BUSINESSES_FEED;
  if (feed === "organizations") return destination === ORGANIZATIONS_FEED;
  if (feed === "campus") return destination === CAMPUS_FEED_DESTINATION || destination === ORGANIZATIONS_FEED;
  return destination === CAMPUS_FEED_DESTINATION;
}

/**
 * Posting to Local Businesses requires the caller to be acting as a verified
 * student business. Personal accounts, organizations, and unverified businesses
 * are rejected. Viewing is not gated here.
 */
export function localBusinessPostDenial(args: {
  feedDestination: string | null | undefined;
  postedAsType: string | null | undefined;
  postedAsVerified: boolean;
}): string | null {
  if (normalizeFeedDestination(args.feedDestination) !== LOCAL_BUSINESSES_FEED) return null;
  if (args.postedAsType === "student_business" && args.postedAsVerified) return null;
  return "Only verified business accounts can post to Local Businesses.";
}

/** The composer and Local Businesses + button are offered only to verified businesses. */
export function canOfferLocalBusinessComposer(
  identities: Array<{ type: string; verified: boolean }>,
): boolean {
  return identities.some((identity) => identity.type === "student_business" && identity.verified);
}

/**
 * Posting to Organizations requires the caller to be acting as an approved
 * organization they represent. Personal accounts, regular members, and
 * businesses are rejected. Viewing is not gated here.
 */
export function organizationPostDenial(args: {
  feedDestination: string | null | undefined;
  postedAsType: string | null | undefined;
  postedAsVerified: boolean;
}): string | null {
  if (normalizeFeedDestination(args.feedDestination) !== ORGANIZATIONS_FEED) return null;
  if (args.postedAsType === "organization" && args.postedAsVerified) return null;
  return "Only approved organization representatives can post to Organizations.";
}

/** The Organizations destination and + button are offered only to approved org representatives. */
export function canOfferOrganizationComposer(
  identities: Array<{ type: string; verified: boolean }>,
): boolean {
  return identities.some((identity) => identity.type === "organization" && identity.verified);
}

/**
 * The author can manage their post. Another approved representative of the same
 * organization can manage that organization's posts. A different organization cannot.
 */
export function canManageOrganizationPost(args: {
  actorUserId: string;
  postUserId: string;
  postDestination: string | null | undefined;
  postedAsType: string | null | undefined;
  postedAsOrganizationId: string | null | undefined;
  actorOrganizationIds: string[];
}): boolean {
  if (canManageAuthoredPost({ actorUserId: args.actorUserId, postUserId: args.postUserId })) return true;
  if (normalizeFeedDestination(args.postDestination) !== ORGANIZATIONS_FEED) return false;
  if (args.postedAsType !== "organization" || !args.postedAsOrganizationId) return false;
  return args.actorOrganizationIds.includes(args.postedAsOrganizationId);
}

/** Edit/delete stays with the creating account, so another business cannot change the post. */
export function canManageAuthoredPost(args: { actorUserId: string; postUserId: string }): boolean {
  return args.actorUserId.length > 0 && args.actorUserId === args.postUserId;
}
