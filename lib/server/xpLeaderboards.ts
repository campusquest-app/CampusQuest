import {
  accountSafetyAllowsPublicLeaderboardExposure,
  assertAccountCanSocialize,
} from "@/lib/server/accountSafety";
import { xpToLevel } from "@/lib/level";
import { ApiError } from "@/lib/server/http";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export const XP_LEADERBOARD_TOP_LIMIT = 50;

const LEADERBOARD_SORT_MODES = [
  "totalXp",
  "level",
  "strength",
  "stamina",
  "knowledge",
  "social",
  "focus",
  "bossesDefeated",
  "finalBossesDefeated",
] as const;

export type LeaderboardSortMode = (typeof LEADERBOARD_SORT_MODES)[number];

export function parseLeaderboardSort(searchParams: URLSearchParams): LeaderboardSortMode {
  const raw = searchParams.get("sort") ?? searchParams.get("by");
  if (raw && (LEADERBOARD_SORT_MODES as readonly string[]).includes(raw)) {
    return raw as LeaderboardSortMode;
  }
  return "level";
}

export type LeaderboardXpRow = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  level: number;
  totalXp: number;
  avatar: string;
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
  bossesDefeated: number;
  finalBossesDefeated: number;
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

function sortKeyValue(entry: Omit<LeaderboardXpRow, "rank">, mode: LeaderboardSortMode): number {
  switch (mode) {
    case "totalXp":
      return entry.totalXp;
    case "level":
      return entry.level;
    case "strength":
      return entry.strength;
    case "stamina":
      return entry.stamina;
    case "knowledge":
      return entry.knowledge;
    case "social":
      return entry.social;
    case "focus":
      return entry.focus;
    case "bossesDefeated":
      return entry.bossesDefeated;
    case "finalBossesDefeated":
      return entry.finalBossesDefeated;
    default:
      return entry.totalXp;
  }
}

function sortAndRank(entries: Omit<LeaderboardXpRow, "rank">[], mode: LeaderboardSortMode): LeaderboardXpRow[] {
  const sorted = [...entries].sort((a, b) => {
    const diff = sortKeyValue(b, mode) - sortKeyValue(a, mode);
    if (diff !== 0) return diff;
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
  user_stats: UserStatsRow | UserStatsRow[] | null;
};

type UserStatsRow = {
  level?: number | null;
  total_xp?: number | null;
  strength?: number | null;
  stamina?: number | null;
  knowledge?: number | null;
  social?: number | null;
  focus?: number | null;
  bosses_defeated?: number | null;
  final_bosses_defeated?: number | null;
};

function levelFromTotalXp(totalXp: number, storedLevel: number | null | undefined, userId: string): number {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const calculated = xpToLevel(safeXp);
  const stored = Math.max(1, Math.floor(Number(storedLevel ?? 1)));
  if (stored !== calculated) {
    console.warn("[cq][leaderboard] level/xp mismatch — using calculated level from total_xp", {
      userId,
      storedLevel: stored,
      calculatedLevel: calculated,
      totalXp: safeXp,
    });
  }
  return calculated;
}

function mapProfileToEntry(row: ProfileStatRow): Omit<LeaderboardXpRow, "rank"> | null {
  const stats = Array.isArray(row.user_stats) ? row.user_stats[0] : row.user_stats;
  if (!stats) return null;
  const s = stats as UserStatsRow;
  const totalXp = Math.max(0, Number(s.total_xp ?? 0));
  return {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    level: levelFromTotalXp(totalXp, s.level, row.id),
    totalXp,
    strength: Math.max(0, Number(s.strength ?? 0)),
    stamina: Math.max(0, Number(s.stamina ?? 0)),
    knowledge: Math.max(0, Number(s.knowledge ?? 0)),
    social: Math.max(0, Number(s.social ?? 0)),
    focus: Math.max(0, Number(s.focus ?? 0)),
    bossesDefeated: Math.max(0, Number(s.bosses_defeated ?? 0)),
    finalBossesDefeated: Math.max(0, Number(s.final_bosses_defeated ?? 0)),
    avatar: avatarPayload(row),
  };
}

async function fetchProfilesAndStats(admin: SupabaseClientLike, userIds: string[]) {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, avatar_custom_json, user_stats(level, total_xp, strength, stamina, knowledge, social, focus, bosses_defeated, final_bosses_defeated)",
    )
    .in("id", userIds);
  if (error) throw new ApiError(400, error.message, "LEADERBOARD_PROFILES_FETCH_FAILED");
  const rows = (profiles ?? []) as ProfileStatRow[];
  await reconcileStaleStoredLevels(admin, rows);
  return rows;
}

/** Keep user_stats.level aligned with total_xp (same formula as profile screen). */
async function reconcileStaleStoredLevels(admin: SupabaseClientLike, rows: ProfileStatRow[]) {
  const updates: { user_id: string; level: number }[] = [];
  for (const row of rows) {
    const stats = Array.isArray(row.user_stats) ? row.user_stats[0] : row.user_stats;
    if (!stats) continue;
    const totalXp = Math.max(0, Number(stats.total_xp ?? 0));
    const calculated = xpToLevel(totalXp);
    const stored = Math.max(1, Math.floor(Number(stats.level ?? 1)));
    if (stored !== calculated) {
      updates.push({ user_id: row.id, level: calculated });
    }
  }
  if (updates.length === 0) return;

  console.info("[cq][leaderboard] reconciling stale user_stats.level rows", {
    count: updates.length,
    sample: updates.slice(0, 5),
  });

  await Promise.all(
    updates.map(({ user_id, level }) =>
      admin.from("user_stats").update({ level }).eq("user_id", user_id),
    ),
  );
}

export async function fetchCampusXpLeaderboard(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  sort: LeaderboardSortMode;
}): Promise<LeaderboardXpResponse> {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, sort } = args;
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

  const ranked = sortAndRank(baseEntries, sort);
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
  sort: LeaderboardSortMode;
}): Promise<LeaderboardXpResponse> {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, sort } = args;
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

  const ranked = sortAndRank(baseEntries, sort);
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
