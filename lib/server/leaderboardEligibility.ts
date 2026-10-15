import {
  isLeaderboardEligible,
  type LeaderboardEligibilityProfile,
} from "@/lib/leaderboardEligibility";
import { listHiddenUserIds } from "@/lib/server/qaTestAccount";
import { isMissingReviewDemoColumnError } from "@/lib/server/reviewDemo";
import { createAdminClient } from "@/lib/server/supabase";

type ClientLike = Pick<ReturnType<typeof createAdminClient>, "from">;

type EligibilityRow = LeaderboardEligibilityProfile & { id: string; is_review_demo?: boolean | null };

/**
 * IDs of profiles that must never appear on any leaderboard/ranking:
 * faculty/staff, admins, QA, internal testers, hidden and test accounts —
 * anything that fails the shared isLeaderboardEligible rule.
 *
 * Pass `userIds` to scope the lookup to a candidate cohort; omit it to scan
 * for all ineligible profiles (they are rare, so the global query stays
 * small). Falls back to the hidden-only filter on pre-migration schemas and
 * never throws — eligibility filtering must not break the surface using it.
 */
export async function listLeaderboardIneligibleUserIds(
  client?: ClientLike,
  userIds?: readonly string[],
): Promise<Set<string>> {
  if (userIds && userIds.length === 0) return new Set();
  try {
    const supabase = client ?? createAdminClient();
    const load = (includeDemoFlag: boolean) => {
      let query = supabase
        .from("profiles")
        .select(includeDemoFlag ? "id, role, is_hidden, is_test_user, is_review_demo" : "id, role, is_hidden, is_test_user");
      query = userIds
        ? query.in("id", [...userIds])
        : query.or(
            includeDemoFlag
              ? "role.neq.student,is_hidden.eq.true,is_test_user.eq.true,is_review_demo.eq.true"
              : "role.neq.student,is_hidden.eq.true,is_test_user.eq.true",
          );
      return query;
    };
    let { data, error } = await load(true);
    if (isMissingReviewDemoColumnError(error)) ({ data, error } = await load(false));
    if (error || !data) throw error ?? new Error("empty eligibility result");
    return new Set(
      (data as unknown as EligibilityRow[])
        .filter((row) => row.is_review_demo === true || !isLeaderboardEligible(row))
        .map((row) => row.id),
    );
  } catch {
    // Pre-migration schema (missing role/flag columns): hidden-only filter.
    return listHiddenUserIds(client);
  }
}
