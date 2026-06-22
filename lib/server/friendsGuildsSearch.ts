import { ApiError } from "@/lib/server/http";
import { calculateLevelProgression } from "@/lib/server/gameplay";
import { createAdminClient } from "@/lib/server/supabase";

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

const DEFAULT_LIMIT = 8;
const MIN_QUERY_LEN = 2;

export type PeopleSearchRow = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarCustomJson: string | null;
  level: number;
  totalXp: number;
  mutualFriendsCount: number;
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
  if (query.length < MIN_QUERY_LEN) return [];

  const limit = Math.min(10, Math.max(1, args.limit ?? DEFAULT_LIMIT));
  const needle = sanitizeIlikeNeedle(query);

  const { data: profiles, error } = await args.userClient
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_custom_json")
    .neq("id", args.userId)
    .or(`username.ilike.${needle},display_name.ilike.${needle}`)
    .order("username", { ascending: true })
    .limit(limit);

  if (error) throw new ApiError(400, error.message, "PEOPLE_SEARCH_FAILED");

  const rows = (profiles ?? []) as ProfileSearchRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { data: statsRows, error: statsError } = await args.userClient
    .from("user_stats")
    .select("user_id, total_xp")
    .in("user_id", ids);
  if (statsError) throw new ApiError(400, statsError.message, "PEOPLE_SEARCH_STATS_FAILED");

  const statsMap = new Map((statsRows ?? []).map((row) => [row.user_id, Number(row.total_xp ?? 0)]));

  const mutualCounts = await Promise.all(
    rows.map((row) => countMutualFriends(args.userClient, args.userId, row.id)),
  );

  return rows.map((row, index) => {
    const totalXp = statsMap.get(row.id) ?? 0;
    return {
      userId: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      avatarCustomJson: row.avatar_custom_json,
      level: calculateLevelProgression(totalXp).level,
      totalXp,
      mutualFriendsCount: mutualCounts[index] ?? 0,
    };
  });
}

export async function searchPublicGuilds(args: {
  userClient: SupabaseClientLike;
  query: string;
  limit?: number;
}): Promise<GuildSearchRow[]> {
  const query = normalizeQuery(args.query);
  if (query.length < MIN_QUERY_LEN) return [];

  const limit = Math.min(10, Math.max(1, args.limit ?? DEFAULT_LIMIT));
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
