import {
  QUAD_POST_XP_AMOUNT,
  QUAD_POST_XP_DAILY_CAP,
  QUAD_POST_XP_SOURCE_TYPE,
  type QuadPostXpReward,
} from "@/lib/quadPostXp";
import { ApiError } from "@/lib/server/http";
import { logQuadPostError } from "@/lib/server/quadPosts";
import { addXpInternal } from "@/lib/server/services";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

function utcDayStartIso(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function countQuadPostXpGrantsToday(admin: SupabaseClientLike, userId: string): Promise<number> {
  const { count, error } = await admin
    .from("quad_post_xp_grants")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("granted_at", utcDayStartIso());

  if (error) {
    if (error.code === "42P01") return 0;
    throw new ApiError(400, error.message, "QUAD_POST_XP_COUNT_FAILED");
  }
  return count ?? 0;
}

/**
 * Award XP for a successfully created Quad post. Idempotent per post_id; capped at
 * {@link QUAD_POST_XP_DAILY_CAP} rewarded posts per UTC day. Never throws — callers
 * should log failures and still return the created post.
 */
export async function maybeAwardQuadPostCreationXp(args: {
  userId: string;
  postId: string;
}): Promise<QuadPostXpReward> {
  const { userId, postId } = args;
  const admin = createAdminClient();

  try {
    const { data: existingGrant, error: lookupError } = await admin
      .from("quad_post_xp_grants")
      .select("post_id")
      .eq("post_id", postId)
      .maybeSingle();

    if (lookupError) {
      if (lookupError.code === "42P01") {
        logQuadPostError("xp_reward_schema_missing", lookupError, { userId, postId });
        return { awarded: false, xpAmount: 0 };
      }
      throw lookupError;
    }
    if (existingGrant) {
      return { awarded: false, xpAmount: 0 };
    }

    const grantsToday = await countQuadPostXpGrantsToday(admin, userId);
    if (grantsToday >= QUAD_POST_XP_DAILY_CAP) {
      return { awarded: false, xpAmount: 0, dailyCapReached: true };
    }

    const { error: grantInsertError } = await admin.from("quad_post_xp_grants").insert({
      post_id: postId,
      user_id: userId,
      xp_amount: QUAD_POST_XP_AMOUNT,
    });

    if (grantInsertError) {
      if (grantInsertError.code === "23505") {
        return { awarded: false, xpAmount: 0 };
      }
      if (grantInsertError.code === "42P01") {
        logQuadPostError("xp_reward_schema_missing", grantInsertError, { userId, postId });
        return { awarded: false, xpAmount: 0 };
      }
      throw grantInsertError;
    }

    await addXpInternal({
      userClient: admin,
      userId,
      amount: QUAD_POST_XP_AMOUNT,
      sourceType: QUAD_POST_XP_SOURCE_TYPE,
      sourceId: postId,
      note: "Quad post published",
      applyStreakUpdate: true,
    });

    return { awarded: true, xpAmount: QUAD_POST_XP_AMOUNT };
  } catch (error) {
    logQuadPostError("xp_reward", error, { userId, postId });
    return { awarded: false, xpAmount: 0 };
  }
}
