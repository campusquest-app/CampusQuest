import { ApiError } from "@/lib/server/http";
import { fetchProfileRole, userHasPlatformAdminAccess } from "@/lib/server/permissions";
import { createAdminClient } from "@/lib/server/supabase";
import type { User } from "@supabase/supabase-js";

export type TorchBearerAwardResult = {
  founderNumber: number;
  newlyAwarded: boolean;
};

export type BetaFounderRow = {
  user_id: string;
  founder_number: number;
  awarded_at: string;
  username?: string | null;
  display_name?: string | null;
};

export async function tryAwardTorchBearerBadge(args: {
  userId: string;
  user?: User | null;
  email?: string | null;
  allowAdmin?: boolean;
}): Promise<TorchBearerAwardResult | null> {
  const { userId, user, email, allowAdmin = false } = args;
  const admin = createAdminClient();

  // QA/test accounts never receive badges.
  const { data: flagRow } = await admin
    .from("profiles")
    .select("is_test_user")
    .eq("id", userId)
    .maybeSingle();
  if (flagRow?.is_test_user === true) {
    return null;
  }

  if (!allowAdmin) {
    const role = await fetchProfileRole(admin as never, userId, { email });
    if (user && userHasPlatformAdminAccess(user, role)) {
      return null;
    }
    if (!user && role !== "student") {
      return null;
    }
  }

  const { data, error } = await admin.rpc("award_torch_bearer_badge", {
    p_user_id: userId,
    p_allow_admin: allowAdmin,
  });

  if (error) {
    throw new ApiError(400, error.message, "TORCH_BEARER_AWARD_FAILED");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.founder_number !== "number") {
    return null;
  }

  return {
    founderNumber: row.founder_number,
    newlyAwarded: Boolean(row.newly_awarded),
  };
}

export async function listBetaFounders(): Promise<{
  founders: BetaFounderRow[];
  totalAwarded: number;
  slotsRemaining: number;
  fullyClaimed: boolean;
}> {
  const admin = createAdminClient();
  const { data: founders, error } = await admin
    .from("beta_founders")
    .select("user_id, founder_number, awarded_at")
    .order("founder_number", { ascending: true });

  if (error) {
    throw new ApiError(400, error.message, "BETA_FOUNDERS_LIST_FAILED");
  }

  const rows = founders ?? [];
  const userIds = rows.map((r) => r.user_id);
  const profileMap = new Map<string, { username: string | null; display_name: string | null }>();

  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { username: p.username, display_name: p.display_name });
    }
  }

  const totalAwarded = rows.length;
  return {
    founders: rows.map((row) => ({
      ...row,
      username: profileMap.get(row.user_id)?.username ?? null,
      display_name: profileMap.get(row.user_id)?.display_name ?? null,
    })),
    totalAwarded,
    slotsRemaining: Math.max(0, 30 - totalAwarded),
    fullyClaimed: totalAwarded >= 30,
  };
}

export async function getBetaFounderForUser(userId: string): Promise<BetaFounderRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("beta_founders")
    .select("user_id, founder_number, awarded_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(400, error.message, "BETA_FOUNDER_FETCH_FAILED");
  }
  return data ?? null;
}
