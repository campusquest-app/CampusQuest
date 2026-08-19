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
import { QUAD_POSTS_WITH_PROFILE_SELECT } from "@/lib/server/quadPosts";
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

type UserClient = ReturnType<typeof createAdminClient>;

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

  const orgIds = Array.from(
    new Set((tags ?? []).map((t) => String(t.entity_id)).filter(Boolean)),
  );
  if (orgIds.length === 0) return [];

  const [{ data: campusOrgs }, { data: externalOrgs }] = await Promise.all([
    admin.from("student_organizations").select("id, category, name").in("id", orgIds),
    admin.from("external_organizations").select("id, category, tags, name").in("id", orgIds),
  ]);

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

  if (matchingOrgIds.size === 0) return [];

  return (tags ?? [])
    .filter((t) => matchingOrgIds.has(String(t.entity_id)))
    .map((t) => String(t.post_id))
    .filter(Boolean);
}

/**
 * Public posts for a dedicated community channel.
 * Includes authors who opted into that community and posts tagging matching orgs.
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

  const [authorIds, taggedPostIds, hiddenIds] = await Promise.all([
    authorIdsForCommunity(communityId),
    postIdsTaggingCommunityOrgs(channel),
    listHiddenUserIds(userClient),
  ]);

  if (authorIds.length === 0 && taggedPostIds.length === 0) {
    return [];
  }

  // Fetch a slightly larger window then filter — PostgREST OR with large IN lists is awkward.
  const fetchLimit = Math.min(200, Math.max(limit * 3, limit));
  const { data, error } = await userClient
    .from("quad_posts")
    .select(QUAD_POSTS_WITH_PROFILE_SELECT)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (error) {
    throw new ApiError(400, error.message ?? "Could not load community feed.", "COMMUNITY_FEED_FAILED");
  }

  const authorSet = new Set(authorIds);
  const taggedSet = new Set(taggedPostIds);

  const posts = ((data ?? []) as unknown as QuadPostApiRow[]).filter((post) => {
    if (post.user_id !== userId && hiddenIds.has(post.user_id)) return false;
    return authorSet.has(post.user_id) || taggedSet.has(post.id);
  });

  return posts.slice(0, limit);
}
