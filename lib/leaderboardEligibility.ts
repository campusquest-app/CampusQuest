/**
 * Single leaderboard eligibility rule used by every ranking surface
 * (campus/friends XP leaderboards, legacy leaderboards, guild member
 * rankings, top-user widgets, profile rank numbers).
 *
 * Only real student accounts compete:
 *   role = 'student' AND is_hidden = false AND is_test_user = false
 *
 * Everyone else — faculty/staff, admins, QA, internal testers, hidden
 * accounts — can still view leaderboards and use the app normally, but they
 * never receive a rank, never shift another user's rank, and never count
 * toward leaderboard totals. Their XP history is preserved untouched; if a
 * user's role returns to 'student', eligibility returns automatically.
 */

export const LEADERBOARD_ELIGIBLE_ROLE = "student";

export type LeaderboardEligibilityProfile = {
  role?: string | null;
  is_hidden?: boolean | null;
  is_test_user?: boolean | null;
};

export function isLeaderboardEligible(
  profile: LeaderboardEligibilityProfile | null | undefined,
): boolean {
  if (!profile) return false;
  // Missing role (pre-migration rows) defaults to 'student' in the DB.
  const role = profile.role ?? LEADERBOARD_ELIGIBLE_ROLE;
  return (
    role === LEADERBOARD_ELIGIBLE_ROLE &&
    profile.is_hidden !== true &&
    profile.is_test_user !== true
  );
}

/** Keep only ranking-eligible rows (each row must carry the flag columns). */
export function filterLeaderboardEligible<T extends LeaderboardEligibilityProfile>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => isLeaderboardEligible(row));
}
