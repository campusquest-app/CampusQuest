import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";

export type QrMilestoneDefinition = {
  id: string;
  title: string;
  requiredScans: number;
  /** Match qr_codes.code (e.g. GYM) */
  code?: string;
  locationPattern?: RegExp;
};

/** URI Gym milestones — successful student scans only (not admin_bypass). */
export const GYM_QR_MILESTONES: QrMilestoneDefinition[] = [
  { id: "gym_novice", title: "Gym Novice", requiredScans: 7, code: "GYM" },
  { id: "gym_regular", title: "Gym Regular", requiredScans: 14, code: "GYM" },
  { id: "gym_legend", title: "Gym Legend", requiredScans: 30, code: "GYM" },
];

export const QR_LOCATION_MILESTONES: QrMilestoneDefinition[] = [
  ...GYM_QR_MILESTONES,
  { id: "library_scholar", title: "Library Scholar", requiredScans: 7, locationPattern: /library/i },
  { id: "tutoring_climber", title: "Tutoring Climber", requiredScans: 4, locationPattern: /tutoring/i },
];

type GameStateJson = {
  achievements?: string[];
  qrMilestones?: Record<string, { unlockedAt: string; title: string }>;
};

function scanMatchesMilestone(
  row: { qr_codes?: { code?: string | null; location_name?: string | null } },
  def: QrMilestoneDefinition,
): boolean {
  const code = row.qr_codes?.code ?? "";
  const loc = row.qr_codes?.location_name ?? "";
  if (def.code && code === def.code) return true;
  if (def.locationPattern && def.locationPattern.test(loc)) return true;
  return false;
}

export async function applyQrLocationMilestones(args: {
  adminClient: SupabaseClient;
  userId: string;
  qrCode?: string | null;
  locationName: string | null;
}): Promise<string[]> {
  const { adminClient, userId, qrCode, locationName } = args;

  const matchingDefs = QR_LOCATION_MILESTONES.filter((def) => {
    if (def.code && qrCode === def.code) return true;
    if (def.locationPattern && locationName && def.locationPattern.test(locationName)) return true;
    return false;
  });

  if (matchingDefs.length === 0) return [];

  const { data: scans, error: scansError } = await adminClient
    .from("qr_scans")
    .select("id, qr_codes!inner(code, location_name)")
    .eq("user_id", userId)
    .eq("status", "success");

  if (scansError) {
    throw new ApiError(400, scansError.message, "QR_MILESTONE_COUNT_FAILED");
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("game_state_json")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    throw new ApiError(404, "Profile not found for milestones.", "PROFILE_NOT_FOUND");
  }

  const gs = (profile.game_state_json ?? {}) as GameStateJson;
  const achievements = Array.isArray(gs.achievements) ? [...gs.achievements] : [];
  const qrMilestones = { ...(gs.qrMilestones ?? {}) };
  const unlockedTitles: string[] = [];

  for (const def of matchingDefs) {
    const successCount = (scans ?? []).filter((row) => {
      const normalized = {
        qr_codes: Array.isArray(row.qr_codes) ? row.qr_codes[0] : row.qr_codes,
      };
      return scanMatchesMilestone(normalized, def);
    }).length;
    if (successCount < def.requiredScans) continue;
    if (qrMilestones[def.id]) continue;

    qrMilestones[def.id] = { unlockedAt: new Date().toISOString(), title: def.title };
    if (!achievements.includes(def.title)) achievements.push(def.title);
    unlockedTitles.push(def.title);
  }

  if (unlockedTitles.length === 0) return [];

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      game_state_json: {
        ...gs,
        achievements,
        qrMilestones,
      },
    })
    .eq("id", userId);
  if (updateError) {
    throw new ApiError(400, updateError.message, "QR_MILESTONE_SAVE_FAILED");
  }

  return unlockedTitles;
}
