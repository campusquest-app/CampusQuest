import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/server/supabase";

export const USER_ACTIVITY_MIN_INTERVAL_MS = 5 * 60 * 1000;

type SupabaseLike = Pick<SupabaseClient, "from">;

const touchCache = new Map<string, number>();

function isMissingLastActiveColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /last_active_at/i.test(error.message ?? "");
}

export async function touchUserActivity(
  userId: string,
  client: SupabaseLike,
  options?: { force?: boolean; minIntervalMs?: number },
): Promise<boolean> {
  const minInterval = options?.minIntervalMs ?? USER_ACTIVITY_MIN_INTERVAL_MS;
  const now = Date.now();

  if (!options?.force) {
    const cached = touchCache.get(userId);
    if (cached != null && now - cached < minInterval) {
      return false;
    }

    const { data, error } = await client
      .from("profiles")
      .select("last_active_at")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data?.last_active_at) {
      const lastMs = new Date(data.last_active_at as string).getTime();
      if (Number.isFinite(lastMs) && now - lastMs < minInterval) {
        touchCache.set(userId, lastMs);
        return false;
      }
    }
  }

  const isoNow = new Date().toISOString();
  const { error: updateError } = await client
    .from("profiles")
    .update({ last_active_at: isoNow, updated_at: isoNow })
    .eq("id", userId);

  if (updateError) {
    if (isMissingLastActiveColumn(updateError)) return false;
    throw updateError;
  }

  touchCache.set(userId, now);
  return true;
}

export function touchUserActivitySafe(
  userId: string,
  client: SupabaseLike,
  options?: { force?: boolean; minIntervalMs?: number },
): void {
  void touchUserActivity(userId, client, options).catch(() => {
    // Activity tracking must never break primary user flows.
  });
}

export function touchUserActivityFromAuth(auth: {
  user: { id: string };
  userClient: SupabaseLike;
}): void {
  touchUserActivitySafe(auth.user.id, auth.userClient);
}

export function touchUserActivityById(userId: string, options?: { force?: boolean }): void {
  touchUserActivitySafe(userId, createAdminClient(), options);
}
