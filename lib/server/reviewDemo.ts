import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * App Store review demo content (profiles, posts, events, organizations with
 * `is_review_demo = true`) is visible only to QA test accounts.
 *
 * Viewer-scoped reads are isolated by the restrictive RLS policy
 * "review demo rows visible to qa only". Service-role reads bypass RLS, so every
 * admin query that feeds a shared surface must apply {@link excludeReviewDemo}.
 */

export const REVIEW_DEMO_COLUMN = "is_review_demo";

type RpcClient = {
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
};

type FilterableQuery<Q> = { eq: (column: string, value: boolean) => Q };

export function isMissingReviewDemoColumnError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (!message.includes(REVIEW_DEMO_COLUMN)) return false;
  return error.code === "42703" || error.code === "PGRST204" || /does not exist|could not find/i.test(message);
}

/** Exclude demo rows from a service-role query. */
export function excludeReviewDemo<Q>(query: FilterableQuery<Q>): Q {
  return query.eq(REVIEW_DEMO_COLUMN, false);
}

/**
 * Run a query with the demo filter; on a schema that predates the
 * is_review_demo column (no demo rows can exist), rerun without it.
 */
export async function runExcludingReviewDemo<R extends { error: { code?: string; message?: string } | null }>(
  build: (applyDemoFilter: boolean) => PromiseLike<R>,
): Promise<R> {
  const result = await build(true);
  if (isMissingReviewDemoColumnError(result.error)) return build(false);
  return result;
}

type ProfileReader = Pick<SupabaseClient, "from">;

/** True when a profile row may view demo content (same rule as cq_can_view_review_demo). */
export function isReviewDemoViewerProfile(
  profile: { role?: string | null; is_test_user?: boolean | null; is_review_demo?: boolean | null } | null | undefined,
): boolean {
  return profile?.role === "qa" && profile.is_test_user === true && profile.is_review_demo !== true;
}

/**
 * Mirrors the restrictive RLS USING clause
 * `is_review_demo = false OR cq_can_view_review_demo()` for a session whose
 * `profiles` row is `viewer`. Anonymous and student sessions cannot read a
 * demo row even when they know its primary key.
 */
export function reviewDemoRowVisibleUnderRls(
  row: { is_review_demo?: boolean | null },
  viewer: Parameters<typeof isReviewDemoViewerProfile>[0],
): boolean {
  return row.is_review_demo !== true || isReviewDemoViewerProfile(viewer);
}

/**
 * Same rule as {@link viewerCanSeeReviewDemo} for an explicit user id, for code
 * paths that only hold a service-role client. Fails closed.
 */
export async function userCanSeeReviewDemo(admin: ProfileReader, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("role, is_test_user, is_review_demo")
      .eq("id", userId)
      .maybeSingle();
    if (error) return false;
    return isReviewDemoViewerProfile(data as Parameters<typeof isReviewDemoViewerProfile>[0]);
  } catch {
    return false;
  }
}

/** Ids of demo profiles (service-role client). Empty on error or pre-migration schema. */
export async function listReviewDemoProfileIds(admin: ProfileReader): Promise<Set<string>> {
  try {
    const { data, error } = await admin.from("profiles").select("id").eq(REVIEW_DEMO_COLUMN, true);
    if (error || !Array.isArray(data)) return new Set();
    return new Set((data as { id: string }[]).map((row) => row.id));
  } catch {
    return new Set();
  }
}

/**
 * Mirrors public.cq_can_view_review_demo() for the session behind `client`.
 * Service-role and anonymous clients always get false. Fails closed.
 */
export async function viewerCanSeeReviewDemo(client: RpcClient | null | undefined): Promise<boolean> {
  if (!client || typeof client.rpc !== "function") return false;
  try {
    const { data, error } = await client.rpc("cq_can_view_review_demo");
    return !error && data === true;
  } catch {
    return false;
  }
}
