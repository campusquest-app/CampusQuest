import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";

export type QrActivityLink = {
  activityId: string;
  activityLabel: string;
  stat: "strength" | "stamina" | "knowledge" | "social" | "focus";
  statGain: number;
};

const ACTIVITY_NAME_TO_LINK: Record<string, QrActivityLink> = {
  "hitting the gym": {
    activityId: "gym",
    activityLabel: "Hitting the Gym",
    stat: "strength",
    statGain: 2,
  },
};

const CODE_TO_LINK: Record<string, QrActivityLink> = {
  GYM: ACTIVITY_NAME_TO_LINK["hitting the gym"]!,
  URI_GYM_CHECKIN_V1: ACTIVITY_NAME_TO_LINK["hitting the gym"]!,
};

export function resolveQrActivityLink(args: {
  code: string;
  activityName: string | null;
  locationName: string | null;
}): QrActivityLink | null {
  const codeKey = args.code.trim().toUpperCase();
  if (CODE_TO_LINK[codeKey]) return CODE_TO_LINK[codeKey]!;

  const nameKey = args.activityName?.trim().toLowerCase();
  if (nameKey && ACTIVITY_NAME_TO_LINK[nameKey]) return ACTIVITY_NAME_TO_LINK[nameKey]!;

  if (args.locationName && /uri gym|gym/i.test(args.locationName)) {
    return ACTIVITY_NAME_TO_LINK["hitting the gym"]!;
  }

  return null;
}

const STAT_COLUMNS = ["strength", "stamina", "knowledge", "social", "focus"] as const;

export async function applyQrActivityStatBoost(args: {
  userClient: SupabaseClient;
  userId: string;
  link: QrActivityLink;
}) {
  const { userClient, userId, link } = args;
  if (!STAT_COLUMNS.includes(link.stat)) return;

  const { data: stats, error } = await userClient
    .from("user_stats")
    .select("strength, stamina, knowledge, social, focus")
    .eq("user_id", userId)
    .single();

  if (error || !stats) {
    throw new ApiError(404, "User stats not found.", "STATS_NOT_FOUND");
  }

  const current = Number(stats[link.stat] ?? 0);
  const next = Math.min(100, current + link.statGain);

  const { error: updateError } = await userClient
    .from("user_stats")
    .update({ [link.stat]: next })
    .eq("user_id", userId);

  if (updateError) {
    throw new ApiError(400, updateError.message, "QR_STAT_UPDATE_FAILED");
  }

  return { stat: link.stat, statGain: next - current };
}
