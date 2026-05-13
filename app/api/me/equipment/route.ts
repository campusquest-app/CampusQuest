import { ZodError } from "zod";
import { fail, ok, ApiError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/security";
import { requireAuthUser } from "@/lib/server/supabase";
import { patchMeEquipmentSchema, readJson } from "@/lib/server/validation";

function normalizeId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = v.trim();
  return s.length === 0 ? null : s;
}

function stripSlotKeys(eq: Record<string, string>): Record<string, string> {
  const out = { ...eq };
  delete out.hat;
  delete out.glasses;
  delete out.backpack;
  return out;
}

type SlotKey = "hat" | "glasses" | "backpack";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:equipment:get", limit: 120, windowMs: 60_000 });

    const { data: profile, error: pErr } = await auth.userClient
      .from("profiles")
      .select("game_state_json")
      .eq("id", auth.user.id)
      .single();

    if (pErr || !profile) {
      throw new ApiError(404, pErr?.message ?? "Profile not found.", "PROFILE_NOT_FOUND");
    }

    const eq =
      (profile.game_state_json as { equippedCosmetics?: Record<string, string> } | null)?.equippedCosmetics ?? {};

    const pickSlot = (k: SlotKey): string | null => normalizeId(eq[k]);

    return ok({
      hat: pickSlot("hat"),
      glasses: pickSlot("glasses"),
      backpack: pickSlot("backpack"),
      extra: stripSlotKeys({ ...eq }),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "me:equipment:patch", limit: 60, windowMs: 60_000 });
    const input = await readJson(request, patchMeEquipmentSchema);

    const { data: existingProf, error: loadErr } = await auth.userClient
      .from("profiles")
      .select("game_state_json")
      .eq("id", auth.user.id)
      .single();

    if (loadErr || !existingProf) {
      throw new ApiError(404, loadErr?.message ?? "Profile not found.", "PROFILE_NOT_FOUND");
    }

    const gs = ((existingProf.game_state_json as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const equipped: Record<string, string> = {
      ...(((gs.equippedCosmetics as Record<string, string>) ?? {}) as Record<string, string>),
    };

    const slots: SlotKey[] = ["hat", "glasses", "backpack"];
    for (const slot of slots) {
      if (!Object.prototype.hasOwnProperty.call(input, slot)) continue;
      const raw = input[slot];
      if (raw === null || raw === "") delete equipped[slot];
      else {
        const id = String(raw).trim();
        if (id) equipped[slot] = id;
      }
    }

    if (input.extraSlots) {
      for (const [k, v] of Object.entries(input.extraSlots)) {
        if (v === null || v === "") delete equipped[k];
        else {
          const id = String(v).trim();
          if (id) equipped[k] = id;
        }
      }
    }

    if (Object.keys(equipped).length === 0) delete gs.equippedCosmetics;
    else gs.equippedCosmetics = equipped;

    const hat_id = normalizeId(equipped.hat);
    const glasses_id = normalizeId(equipped.glasses);
    const backpack_id = normalizeId(equipped.backpack);
    const extra_slots = stripSlotKeys(equipped);

    const { error: upEqErr } = await auth.userClient.from("user_equipment_loadouts").upsert(
      {
        user_id: auth.user.id,
        hat_id,
        glasses_id,
        backpack_id,
        extra_slots,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upEqErr) throw new ApiError(400, upEqErr.message ?? "Could not save equipment row.", "EQUIPMENT_UPSERT_FAILED");

    const { error: gsErr } = await auth.userClient
      .from("profiles")
      .update({ game_state_json: gs, updated_at: new Date().toISOString() })
      .eq("id", auth.user.id);

    if (gsErr) throw new ApiError(400, gsErr.message ?? "Could not sync profile game state.", "PROFILE_GAMESTATE_FAILED");

    return ok({
      hat: hat_id,
      glasses: glasses_id,
      backpack: backpack_id,
      extra: extra_slots,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(new ApiError(400, error.issues[0]?.message ?? "Invalid payload.", "VALIDATION_ERROR"));
    }
    return fail(error);
  }
}
