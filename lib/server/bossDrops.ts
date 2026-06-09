import { ApiError } from "@/lib/server/http";
import { addItemToInventory } from "@/lib/server/services";
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

export type PersistBossDropInput = {
  bossId: string;
  bossName: string;
  cosmeticId: string;
  itemName?: string;
  rarity?: string;
  isFinalBoss?: boolean;
  quantity?: number;
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

async function resolveCatalogItemId(
  userClient: SupabaseClientLike,
  cosmeticId: string,
): Promise<string | null> {
  const { data, error } = await userClient
    .from("items")
    .select("id")
    .eq("slug", cosmeticId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
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

export async function persistBossDrop(args: {
  userClient: SupabaseClientLike;
  userId: string;
  input: PersistBossDropInput;
}): Promise<BossDropRow> {
  const { userClient, userId, input } = args;
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const itemId = input.cosmeticId.trim();
  const itemName = (input.itemName ?? input.bossName).slice(0, 120);

  const { data: existing, error: existingError } = await userClient
    .from("boss_drops")
    .select(BOSS_DROPS_SELECT)
    .eq("user_id", userId)
    .eq("boss_id", input.bossId)
    .eq("item_id", itemId)
    .maybeSingle();

  if (existingError) {
    if (isMissingBossDropsTable(existingError)) {
      throw new ApiError(
        503,
        "Boss drop storage is not available yet. Apply the latest database migration.",
        "BOSS_DROPS_TABLE_MISSING",
      );
    }
    throw new ApiError(400, existingError.message ?? "Could not read boss drop.", "BOSS_DROP_READ_FAILED");
  }

  if (existing) {
    return existing as BossDropRow;
  }

  const { data: inserted, error: insertError } = await userClient
    .from("boss_drops")
    .insert({
      user_id: userId,
      boss_id: input.bossId,
      item_id: itemId,
      item_name: itemName,
      quantity,
      rarity: input.rarity ?? null,
    })
    .select(BOSS_DROPS_SELECT)
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await userClient
        .from("boss_drops")
        .select(BOSS_DROPS_SELECT)
        .eq("user_id", userId)
        .eq("boss_id", input.bossId)
        .eq("item_id", itemId)
        .maybeSingle();
      if (raced) return raced as BossDropRow;
    }
    throw new ApiError(400, insertError.message ?? "Could not save boss drop.", "BOSS_DROP_INSERT_FAILED");
  }

  const catalogItemId = await resolveCatalogItemId(userClient, itemId);
  if (catalogItemId) {
    await addItemToInventory({
      userClient,
      userId,
      itemId: catalogItemId,
      quantity,
      source: "boss_drop",
    });
  }

  return inserted as BossDropRow;
}
