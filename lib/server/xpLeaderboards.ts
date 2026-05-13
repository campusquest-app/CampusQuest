import {
  accountSafetyAllowsPublicLeaderboardExposure,
  assertAccountCanSocialize,
} from "@/lib/server/accountSafety";
import { ApiError } from "@/lib/server/http";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export const XP_LEADERBOARD_TOP_LIMIT = 50;

export type LeaderboardXpRow = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  level: number;
  totalXp: number;
  avatar: string;
};

export type LeaderboardXpResponse = {
  topUsers: LeaderboardXpRow[];
  currentUserRank: number | null;
  currentUserEntry: LeaderboardXpRow | null;
  totalRankedUsers: number;
};

function normalizedSchoolDomain(value: string) {
  return value.trim().toLowerCase();
}

function avatarPayload(p: {
  avatar_custom_json?: string | null;
  avatar_url?: string | null;
}): string {
  const j = (p.avatar_custom_json ?? "").trim();
  if (j) return j;
  const u = (p.avatar_url ?? "").trim();
  if (u) return u;
  return "🎓";
}

function sortAndRank(entries: Omit<LeaderboardXpRow, "rank">[]): LeaderboardXpRow[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
    return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
  });
  return sorted.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

async function loadSafetyAllowedSet(admin: SupabaseClientLike, userIds: string[], nowMs: number): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data: safetyRows, error } = await admin
    .from("user_account_safety")
    .select("user_id, status, suspended_until")
    .in("user_id", userIds);
  if (error) throw new ApiError(400, error.message, "LEADERBOARD_SAFETY_LOOKUP_FAILED");

  const disallowed = new Set<string>();
  for (const row of safetyRows ?? []) {
    if (!accountSafetyAllowsPublicLeaderboardExposure(row as any, nowMs)) {
      disallowed.add((row as any).user_id as string);
    }
  }

  const allowed = new Set(userIds.filter((id) => !disallowed.has(id)));
  return allowed;
}

type ProfileStatRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_custom_json: string | null;
  user_stats: { level: number; total_xp: number } | { level: number; total_xp: number }[] | null;
};

function mapProfileToEntry(row: ProfileStatRow): Omit<LeaderboardXpRow, "rank"> | null {
  const stats = Array.isArray(row.user_stats) ? row.user_stats[0] : row.user_stats;
  if (!stats) return null;
  return {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    level: Number(stats.level ?? 1),
    totalXp: Number(stats.total_xp ?? 0),
    avatar: avatarPayload(row),
  };
}

async function fetchProfilesAndStats(admin: SupabaseClientLike, userIds: string[]) {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, avatar_custom_json, user_stats(level, total_xp)",
    )
    .in("id", userIds);
  if (error) throw new ApiError(400, error.message, "LEADERBOARD_PROFILES_FETCH_FAILED");
  return (profiles ?? []) as ProfileStatRow[];
}

export async function fetchCampusXpLeaderboard(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
}): Promise<LeaderboardXpResponse> {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt } = args;
  const admin = createAdminClient();
  const nowMs = Date.now();

  await assertAccountCanSocialize(userClient, userId);
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
  const domain = normalizedSchoolDomain(school.schoolDomain ?? "");
  if (!domain) {
    throw new ApiError(400, "School scope is missing for campus leaderboard.", "SCHOOL_SCOPE_MISSING");
  }

  const { data: verifs, error: verifError } = await admin
    .from("user_school_verifications")
    .select("user_id")
    .eq("status", "verified")
    .eq("school_domain", domain);
  if (verifError) throw new ApiError(400, verifError.message, "CAMPUS_LEADERBOARD_SCOPE_FAILED");

  const candidateIds = Array.from(new Set((verifs ?? []).map((row: any) => row.user_id as string))).filter(Boolean);
  const allowedSafety = await loadSafetyAllowedSet(admin, candidateIds, nowMs);
  const userIdsEligible = candidateIds.filter((id) => allowedSafety.has(id));

  if (userIdsEligible.length === 0) {
    return { topUsers: [], currentUserRank: null, currentUserEntry: null, totalRankedUsers: 0 };
  }

  const profilesRows = await fetchProfilesAndStats(admin, userIdsEligible);
  const baseEntries: Omit<LeaderboardXpRow, "rank">[] = [];
  for (const row of profilesRows) {
    const mapped = mapProfileToEntry(row);
    if (mapped && allowedSafety.has(mapped.userId)) baseEntries.push(mapped);
  }

  const ranked = sortAndRank(baseEntries);
  const totalRankedUsers = ranked.length;
  const me = ranked.find((r) => r.userId === userId);

  const topUsers = ranked.slice(0, XP_LEADERBOARD_TOP_LIMIT);

  return {
    topUsers,
    currentUserRank: me?.rank ?? null,
    currentUserEntry: me ?? null,
    totalRankedUsers,
  };
}

export async function fetchFriendsXpLeaderboard(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
}): Promise<LeaderboardXpResponse> {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt } = args;
  const admin = createAdminClient();
  const nowMs = Date.now();

  await assertAccountCanSocialize(userClient, userId);
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });

  const [{ data: outRows, error: outErr }, { data: inRows, error: inErr }] = await Promise.all([
    userClient
      .from("student_connections")
      .select("addressee_id")
      .eq("requester_id", userId)
      .eq("status", "accepted"),
    userClient
      .from("student_connections")
      .select("requester_id")
      .eq("addressee_id", userId)
      .eq("status", "accepted"),
  ]);

  if (outErr) throw new ApiError(400, outErr.message, "FRIENDS_LEADERBOARD_OUT_FAILED");
  if (inErr) throw new ApiError(400, inErr.message, "FRIENDS_LEADERBOARD_IN_FAILED");

  const friendIds = Array.from(
    new Set([
      ...(outRows ?? []).map((r: any) => r.addressee_id as string),
      ...(inRows ?? []).map((r: any) => r.requester_id as string),
    ]),
  ).filter(Boolean);

  if (friendIds.length === 0) {
    return { topUsers: [], currentUserRank: null, currentUserEntry: null, totalRankedUsers: 0 };
  }

  const viewerDomain = normalizedSchoolDomain(school.schoolDomain ?? "");

  const { data: friendVerifs, error: fvErr } = await admin
    .from("user_school_verifications")
    .select("user_id, school_domain, status")
    .in("user_id", friendIds);
  if (fvErr) throw new ApiError(400, fvErr.message, "FRIENDS_LEADERBOARD_SCHOOL_LOOKUP_FAILED");

  const sameCampusFriendIds = friendIds.filter((fid) => {
    const fv = (friendVerifs ?? []).find((row: any) => row.user_id === fid);
    return (
      fv?.status === "verified" &&
      normalizedSchoolDomain(String((fv as any).school_domain ?? "")) === viewerDomain
    );
  });

  if (sameCampusFriendIds.length === 0) {
    return { topUsers: [], currentUserRank: null, currentUserEntry: null, totalRankedUsers: 0 };
  }

  const cohortIds = Array.from(new Set([userId, ...sameCampusFriendIds]));
  const safetyAllowedSet = await loadSafetyAllowedSet(admin, cohortIds, nowMs);

  /** Only peers that pass safety screening are ranked (viewer excluded from empty check already). */
  const rankedIdsAll = cohortIds.filter((id) => safetyAllowedSet.has(id));

  const profilesRows = await fetchProfilesAndStats(admin, rankedIdsAll);

  const baseEntries: Omit<LeaderboardXpRow, "rank">[] = [];
  for (const row of profilesRows) {
    const mapped = mapProfileToEntry(row);
    if (mapped && safetyAllowedSet.has(mapped.userId)) baseEntries.push(mapped);
  }

  const ranked = sortAndRank(baseEntries);
  const totalRankedUsers = ranked.length;
  const me = ranked.find((r) => r.userId === userId);

  const topUsers = ranked.slice(0, XP_LEADERBOARD_TOP_LIMIT);

  return {
    topUsers,
    currentUserRank: me?.rank ?? null,
    currentUserEntry: me ?? null,
    totalRankedUsers,
  };
}
