import type { QuadPostApiRow } from "@/lib/quadFieldNote";
import {
  classifyOrganizationBucket,
  type OrgBrowseFilterId,
} from "@/lib/organizationBrowseFilters";
import type { CommunityId } from "@/lib/onboarding/taxonomy";
import {
  type QuadCommunityChannel,
  isQuadCommunityChannel,
} from "@/lib/quadCommunityChannels";
import { postBelongsInFeed } from "@/lib/quad/localBusinessFeed";
import { QUAD_POSTS_LEGACY_PROFILE_SELECT, QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
import { listHiddenUserIds } from "@/lib/server/qaTestAccount";
import { createAdminClient } from "@/lib/server/supabase";
import { ApiError } from "@/lib/server/http";

export type { QuadCommunityChannel };
export { isQuadCommunityChannel };

const CHANNEL_ORG_BUCKETS: Record<QuadCommunityChannel, OrgBrowseFilterId[]> = {
  student_organizations: [
    "academic_professional",
    "cultural_identity",
    "honor_societies",
    "media_publications",
    "performance_arts",
    "political_advocacy",
    "service_volunteer",
    "spiritual_religious",
    "student_government",
    "other",
  ],
  greek_life: ["fsl"],
  athletics: ["club_sports"],
};

const CHANNEL_COMMUNITY_ID: Record<QuadCommunityChannel, CommunityId> = {
  student_organizations: "student_organizations",
  greek_life: "greek_life",
  athletics: "athletics",
};

/**
 * Greek Life must not include every Campus post from users who merely selected
 * the affiliation in onboarding. Athletics still uses author membership.
 */
const CHANNEL_INCLUDES_AUTHOR_MEMBERSHIP: Record<QuadCommunityChannel, boolean> = {
  student_organizations: true,
  greek_life: false,
  athletics: true,
};

type UserClient = ReturnType<typeof createAdminClient>;

type OrgClassifyRow = {
  id: string;
  category?: string | null;
  name?: string | null;
  tags?: unknown;
};

function matchingOrgIdsForChannel(
  channel: QuadCommunityChannel,
  campusOrgs: OrgClassifyRow[] | null | undefined,
  externalOrgs: OrgClassifyRow[] | null | undefined,
): Set<string> {
  const allowedBuckets = new Set(CHANNEL_ORG_BUCKETS[channel]);
  const matchingOrgIds = new Set<string>();

  for (const org of campusOrgs ?? []) {
    const bucket = classifyOrganizationBucket({
      campusCategorySlug: typeof org.category === "string" ? org.category : null,
      name: typeof org.name === "string" ? org.name : undefined,
    });
    if (allowedBuckets.has(bucket)) matchingOrgIds.add(String(org.id));
  }

  for (const org of externalOrgs ?? []) {
    const bucket = classifyOrganizationBucket({
      category: typeof org.category === "string" ? org.category : null,
      tags: Array.isArray(org.tags) ? (org.tags as string[]) : [],
      name: typeof org.name === "string" ? org.name : undefined,
    });
    if (allowedBuckets.has(bucket)) matchingOrgIds.add(String(org.id));
  }

  return matchingOrgIds;
}

async function loadMatchingOrgIds(
  admin: UserClient,
  channel: QuadCommunityChannel,
  orgIds: string[],
): Promise<Set<string>> {
  if (orgIds.length === 0) return new Set();
  const [{ data: campusOrgs }, { data: externalOrgs }] = await Promise.all([
    admin.from("student_organizations").select("id, category, name").in("id", orgIds),
    admin.from("external_organizations").select("id, category, tags, name").in("id", orgIds),
  ]);
  return matchingOrgIdsForChannel(
    channel,
    campusOrgs as OrgClassifyRow[] | null,
    externalOrgs as OrgClassifyRow[] | null,
  );
}

async function authorIdsForCommunity(communityId: CommunityId): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_onboarding_preferences")
    .select("user_id, communities")
    .not("communities", "is", null)
    .limit(2000);

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load community members.", "COMMUNITY_AUTHORS_FAILED");
  }

  const ids: string[] = [];
  for (const row of data ?? []) {
    const communities = Array.isArray(row.communities) ? (row.communities as string[]) : [];
    if (communities.includes(communityId) && typeof row.user_id === "string") {
      ids.push(row.user_id);
    }
  }
  return ids;
}

async function postIdsTaggingCommunityOrgs(channel: QuadCommunityChannel): Promise<string[]> {
  const admin = createAdminClient();
  const { data: tags, error: tagError } = await admin
    .from("post_tags")
    .select("post_id, entity_id")
    .eq("entity_type", "organization")
    .eq("status", "approved")
    .limit(2000);

  if (tagError) {
    // Missing table or empty — treat as no tagged posts.
    if (tagError.code === "42P01" || /does not exist/i.test(tagError.message ?? "")) return [];
    throw new ApiError(400, tagError.message ?? "Could not load org tags.", "COMMUNITY_TAGS_FAILED");
  }

  const orgIds = Array.from(new Set((tags ?? []).map((t) => String(t.entity_id)).filter(Boolean)));
  const matchingOrgIds = await loadMatchingOrgIds(admin, channel, orgIds);
  if (matchingOrgIds.size === 0) return [];

  return (tags ?? [])
    .filter((t) => matchingOrgIds.has(String(t.entity_id)))
    .map((t) => String(t.post_id))
    .filter(Boolean);
}

/**
 * Posts published as a verified organization that belongs to this community channel
 * (e.g. a fraternity posting as itself for Greek Life).
 */
async function postIdsPostedAsCommunityOrgs(channel: QuadCommunityChannel): Promise<string[]> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("quad_posts")
    .select("id, posted_as_id")
    .eq("visibility", "public")
    .eq("posted_as_type", "organization")
    .not("posted_as_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "42703" || /posted_as_id|posted_as_type/i.test(error.message ?? "")) return [];
    throw new ApiError(400, error.message ?? "Could not load organization posts.", "COMMUNITY_POSTED_AS_FAILED");
  }

  const orgIds = Array.from(
    new Set((rows ?? []).map((row) => String(row.posted_as_id ?? "")).filter(Boolean)),
  );
  const matchingOrgIds = await loadMatchingOrgIds(admin, channel, orgIds);
  if (matchingOrgIds.size === 0) return [];

  return (rows ?? [])
    .filter((row) => matchingOrgIds.has(String(row.posted_as_id ?? "")))
    .map((row) => String(row.id))
    .filter(Boolean);
}

/** Pure membership check used by the server filter and unit tests. */
export function postQualifiesForCommunityChannel(args: {
  channel: QuadCommunityChannel;
  viewerId: string;
  post: { id: string; user_id: string; feed_destination?: string | null };
  authorIds: ReadonlySet<string>;
  taggedPostIds: ReadonlySet<string>;
  postedAsPostIds: ReadonlySet<string>;
  hiddenAuthorIds: ReadonlySet<string>;
}): boolean {
  const { channel, viewerId, post, authorIds, taggedPostIds, postedAsPostIds, hiddenAuthorIds } = args;
  if (post.user_id !== viewerId && hiddenAuthorIds.has(post.user_id)) return false;

  const explicitlyDesignated = taggedPostIds.has(post.id) || postedAsPostIds.has(post.id);
  if (explicitlyDesignated) {
    // Tagged / posted-as greek (or athletics) org posts may live on campus or organizations.
    if (post.feed_destination === "local_businesses") return false;
    return true;
  }

  if (!CHANNEL_INCLUDES_AUTHOR_MEMBERSHIP[channel]) return false;
  if (!authorIds.has(post.user_id)) return false;
  return postBelongsInFeed(post.feed_destination, "other");
}

/**
 * Public posts for a dedicated community channel.
 *
 * Greek Life: only posts that tag an FSL org or are posted as an FSL org.
 * Athletics / other community channels may also include authors who opted into
 * that community during onboarding.
 *
 * Does not replace the main Campus Feed (`feed=public`).
 */
export async function listCommunityQuadPosts(args: {
  userClient: UserClient;
  userId: string;
  channel: QuadCommunityChannel;
  limit: number;
}): Promise<QuadPostApiRow[]> {
  const { userClient, userId, channel, limit } = args;
  const communityId = CHANNEL_COMMUNITY_ID[channel];
  const includeAuthors = CHANNEL_INCLUDES_AUTHOR_MEMBERSHIP[channel];

  const [authorIds, taggedPostIds, postedAsPostIds, hiddenIds] = await Promise.all([
    includeAuthors ? authorIdsForCommunity(communityId) : Promise.resolve([] as string[]),
    postIdsTaggingCommunityOrgs(channel),
    postIdsPostedAsCommunityOrgs(channel),
    listHiddenUserIds(userClient),
  ]);

  if (authorIds.length === 0 && taggedPostIds.length === 0 && postedAsPostIds.length === 0) {
    return [];
  }

  // Fetch a slightly larger window then filter — PostgREST OR with large IN lists is awkward.
  const fetchLimit = Math.min(200, Math.max(limit * 3, limit));
  const destinationFilter = includeAuthors
    ? "feed_destination.eq.campus,feed_destination.is.null"
    : "feed_destination.eq.campus,feed_destination.is.null,feed_destination.eq.organizations";

  let { data, error } = await userClient
    .from("quad_posts")
    .select(QUAD_POSTS_WITH_PROFILE_SELECT)
    .eq("visibility", "public")
    .or(destinationFilter)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (error && /feed_destination/i.test(`${error.message ?? ""} ${error.details ?? ""}`)) {
    const retry = await userClient
      .from("quad_posts")
      .select(QUAD_POSTS_LEGACY_PROFILE_SELECT)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(fetchLimit);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load community feed.", "COMMUNITY_FEED_FAILED");
  }

  const authorSet = new Set(authorIds);
  const taggedSet = new Set(taggedPostIds);
  const postedAsSet = new Set(postedAsPostIds);

  const posts = ((data ?? []) as unknown as QuadPostApiRow[]).filter((post) =>
    postQualifiesForCommunityChannel({
      channel,
      viewerId: userId,
      post: {
        id: post.id,
        user_id: post.user_id,
        feed_destination: post.feed_destination ?? null,
      },
      authorIds: authorSet,
      taggedPostIds: taggedSet,
      postedAsPostIds: postedAsSet,
      hiddenAuthorIds: hiddenIds,
    }),
  );

  return posts.slice(0, limit);
}
