import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type BossDropRow = {
  id: string;
  user_id: string;
  boss_id: string;
  item_id: string;
  item_name: string | null;
  quantity: number;
  rarity: string | null;
  earned_at: string;
};

const BOSS_DROPS_SELECT =
  "id, user_id, boss_id, item_id, item_name, quantity, rarity, earned_at";

function isMissingBossDropsTable(error: { code?: string; message?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (msg.includes("boss_drops") &&
      (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find")))
  );
}

export async function fetchBossDropsForUser(
  userClient: SupabaseClientLike,
  userId: string,
  limit = 200,
): Promise<BossDropRow[]> {
  const { data, error } = await userClient
    .from("boss_drops")
    .select(BOSS_DROPS_SELECT)
    .eq("user_id", userId)
    .order("earned_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingBossDropsTable(error)) {
      return [];
    }
    throw new ApiError(400, error.message ?? "Could not load boss drops.", "BOSS_DROPS_FETCH_FAILED");
  }

  return (data ?? []) as BossDropRow[];
}
