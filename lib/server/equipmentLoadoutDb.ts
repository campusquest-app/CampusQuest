import type { SupabaseClient } from "@supabase/supabase-js";

function stripCoreSlots(eq: Record<string, string>): Record<string, string> {
  const out = { ...eq };
  delete out.hat;
  delete out.glasses;
  delete out.backpack;
  return out;
}

/** Keep `user_equipment_loadouts` in sync when `profiles.game_state_json` is updated (e.g. autosave). */
export async function syncEquipmentTableFromGameState(
  userClient: SupabaseClient,
  userId: string,
  gameStateJson: Record<string, unknown> | null | undefined,
): Promise<void> {
  const raw = gameStateJson?.equippedCosmetics;
  const eq: Record<string, string> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? Object.fromEntries(
          Object.entries(raw as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string" && (v as string).length > 0,
          ) as [string, string][],
        )
      : {};
  const hat_id = typeof eq.hat === "string" && eq.hat.trim() ? eq.hat.trim() : null;
  const glasses_id = typeof eq.glasses === "string" && eq.glasses.trim() ? eq.glasses.trim() : null;
  const backpack_id = typeof eq.backpack === "string" && eq.backpack.trim() ? eq.backpack.trim() : null;
  const extra_slots = stripCoreSlots(eq);

  const { error } = await userClient.from("user_equipment_loadouts").upsert(
    {
      user_id: userId,
      hat_id,
      glasses_id,
      backpack_id,
      extra_slots,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.warn("[cq] equipment table sync failed", error.message);
  }
}
