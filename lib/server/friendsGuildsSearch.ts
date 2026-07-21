import { ApiError } from "@/lib/server/http";
import { calculateLevelProgression } from "@/lib/server/gameplay";
import { listHiddenUserIds } from "@/lib/server/qaTestAccount";
import { createAdminClient } from "@/lib/server/supabase";
import {
  rankUserSearchCandidates,
  resolveUserSearchConnectionStatus,
  type UserSearchConnectionStatus,
} from "@/lib/server/userSearchRanking";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

type ProfileSearchRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_custom_json: string | null;
};

type GuildSearchDbRow = {
  id: string;
  name: string;
  description: string | null;
  total_xp: number | null;
  member_count: number | null;
  logo_url: string | null;
};

const DEFAULT_LIMIT = 15;
const PEOPLE_MIN_QUERY_LEN = 1;
const GUILD_MIN_QUERY_LEN = 2;
const CANDIDATE_POOL = 40;

export type PeopleSearchRow = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  level: number;
  totalXp: number;
  mutualFriendsCount: number;
  isFriend: boolean;
  connectionStatus: UserSearchConnectionStatus;
};

export type GuildSearchRow = {
  guildId: string;
  name: string;
  description: string;
  categoryLabel: string | null;
  memberCount: number;
  level: number;
  totalXp: number;
  logoUrl: string | null;
};

function sanitizeIlikeNeedle(query: string): string {
  return `%${query.replace(/[%_,]/g, "").trim()}%`;
}

function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

async function fetchConnectionSets(
  userClient: SupabaseClientLike,
  userId: string,
): Promise<{ connectedIds: Set<string>; incomingIds: Set<string>; outgoingIds: Set<string> }> {
  const { data, error } = await userClient
    .from("student_connections")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) throw new ApiError(400, error.message, "PEOPLE_SEARCH_CONNECTIONS_FAILED");

  const connectedIds = new Set<string>();
  const incomingIds = new Set<string>();
  const outgoingIds = new Set<string>();

  for (const row of data ?? []) {
    const requesterId = row.requester_id as string;
    const addresseeId = row.addressee_id as string;
    const status = row.status as string;
    const otherId = requesterId === userId ? addresseeId : requesterId;
    if (otherId === userId) continue;

    if (status === "accepted") {
      connectedIds.add(otherId);
      continue;
    }
    if (status !== "pending") continue;
    if (requesterId === userId) outgoingIds.add(otherId);
    else incomingIds.add(otherId);
  }

  return { connectedIds, incomingIds, outgoingIds };
}

async function fetchProfilesByIds(userClient: SupabaseClientLike, ids: string[]): Promise<ProfileSearchRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .in("id", ids);
  if (error) throw new ApiError(400, error.message, "PEOPLE_SEARCH_PROFILES_FAILED");
  return (data ?? []) as ProfileSearchRow[];
}
async function countMutualFriends(
  userClient: SupabaseClientLike,
  userId: string,
  otherUserId: string,
): Promise<number> {
  const [myRows, theirRows] = await Promise.all([
    userClient
      .from("student_connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    userClient
      .from("student_connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${otherUserId},addressee_id.eq.${otherUserId}`),
  ]);
  if (myRows.error) throw new ApiError(400, myRows.error.message, "MUTUAL_FRIENDS_FETCH_FAILED");
  if (theirRows.error) throw new ApiError(400, theirRows.error.message, "MUTUAL_FRIENDS_FETCH_FAILED");

  const myFriends = new Set(
    (myRows.data ?? []).map((row) => (row.requester_id === userId ? row.addressee_id : row.requester_id)),
  );
  let count = 0;
  for (const row of theirRows.data ?? []) {
    const friendId = row.requester_id === otherUserId ? row.addressee_id : row.requester_id;
    if (friendId !== userId && friendId !== otherUserId && myFriends.has(friendId)) count += 1;
  }
  return count;
}

function inferGuildCategoryLabel(name: string, description: string): string | null {
  const haystack = `${name} ${description}`.toLowerCase();
  if (/library|study|exam|all-nighter|research/.test(haystack)) return "Study";
  if (/fitness|gym|run|workout|keaney fit|ram runner/.test(haystack)) return "Fitness";
  if (/career|network|linkedin|professional/.test(haystack)) return "Networking";
  if (/club|social|quad|crew|music|campus/.test(haystack)) return "Clubs";
  return null;
}

export async function searchPeopleProfiles(args: {
  userClient: SupabaseClientLike;
  userId: string;
  query: string;
  limit?: number;
}): Promise<PeopleSearchRow[]> {
  const query = normalizeQuery(args.query);
  if (query.length < PEOPLE_MIN_QUERY_LEN) return [];

  const limit = Math.min(15, Math.max(1, args.limit ?? DEFAULT_LIMIT));
  const needle = sanitizeIlikeNeedle(query);

  const [{ connectedIds, incomingIds, outgoingIds }, globalResult] = await Promise.all([
    fetchConnectionSets(args.userClient, args.userId),
    args.userClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_custom_json")
      .neq("id", args.userId)
      .or(`username.ilike.${needle},display_name.ilike.${needle}`)
      .order("username", { ascending: true })
      .limit(CANDIDATE_POOL),
  ]);

  if (globalResult.error) throw new ApiError(400, globalResult.error.message, "PEOPLE_SEARCH_FAILED");

  const profileMap = new Map<string, ProfileSearchRow>();
  for (const row of (globalResult.data ?? []) as ProfileSearchRow[]) {
    profileMap.set(row.id, row);
  }

  const friendIds = Array.from(connectedIds);
  if (friendIds.length > 0) {
    const { data: friendMatches, error: friendError } = await args.userClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_custom_json")
      .in("id", friendIds)
      .or(`username.ilike.${needle},display_name.ilike.${needle}`);
    if (friendError) throw new ApiError(400, friendError.message, "PEOPLE_SEARCH_FRIENDS_FAILED");
    for (const row of (friendMatches ?? []) as ProfileSearchRow[]) {
      profileMap.set(row.id, row);
    }
  }

  // QA/test accounts (is_hidden = true) never appear in user search.
  const hiddenIds = await listHiddenUserIds(args.userClient);

  const candidates = Array.from(profileMap.values())
    .filter((row) => !hiddenIds.has(row.id))
    .map((row) => ({
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
    }));

  const ranked = rankUserSearchCandidates(query, candidates, connectedIds, limit);
  if (ranked.length === 0) return [];

  const rankedProfiles = await fetchProfilesByIds(
    args.userClient,
    ranked.map((row) => row.userId),
  );
  const rankedProfileMap = new Map(rankedProfiles.map((row) => [row.id, row]));

  const { data: statsRows, error: statsError } = await args.userClient
    .from("user_stats")
    .select("user_id, total_xp")
    .in(
      "user_id",
      ranked.map((row) => row.userId),
    );
  if (statsError) throw new ApiError(400, statsError.message, "PEOPLE_SEARCH_STATS_FAILED");

  const statsMap = new Map((statsRows ?? []).map((row) => [row.user_id, Number(row.total_xp ?? 0)]));

  const mutualCounts = await Promise.all(
    ranked.map((row) => countMutualFriends(args.userClient, args.userId, row.userId)),
  );

  return ranked
    .map((row, index) => {
      const profile = rankedProfileMap.get(row.userId);
      if (!profile || profile.id === args.userId) return null;
      const totalXp = statsMap.get(profile.id) ?? 0;
      const connectionStatus = resolveUserSearchConnectionStatus({
        userId: profile.id,
        connectedIds,
        incomingIds,
        outgoingIds,
      });
      return {
        userId: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        avatarCustomJson: profile.avatar_custom_json,
        level: calculateLevelProgression(totalXp).level,
        totalXp,
        mutualFriendsCount: mutualCounts[index] ?? 0,
        isFriend: connectionStatus === "connected",
        connectionStatus,
      };
    })
    .filter((row): row is PeopleSearchRow => row != null);
}

export async function searchPublicGuilds(args: {
  userClient: SupabaseClientLike;
  query: string;
  limit?: number;
}): Promise<GuildSearchRow[]> {
  const query = normalizeQuery(args.query);
  if (query.length < GUILD_MIN_QUERY_LEN) return [];

  const limit = Math.min(10, Math.max(1, args.limit ?? 8));
  const needle = sanitizeIlikeNeedle(query);

  const { data: guilds, error } = await args.userClient
    .from("guilds")
    .select("id, name, description, total_xp, member_count, logo_url")
    .eq("is_public", true)
    .or(`name.ilike.${needle},description.ilike.${needle}`)
    .order("total_xp", { ascending: false })
    .limit(limit);

  if (error) throw new ApiError(400, error.message, "GUILD_SEARCH_FAILED");

  return (guilds ?? []).map((guild: GuildSearchDbRow) => {
    const totalXp = Number(guild.total_xp ?? 0);
    const description = (guild.description ?? "").trim();
    return {
      guildId: guild.id,
      name: guild.name,
      description,
      categoryLabel: inferGuildCategoryLabel(guild.name, description),
      memberCount: Number(guild.member_count ?? 0),
      level: calculateLevelProgression(totalXp).level,
      totalXp,
      logoUrl: guild.logo_url ?? null,
    };
  });
}
