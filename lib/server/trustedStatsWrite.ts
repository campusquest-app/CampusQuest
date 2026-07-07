import { createAdminClient } from "@/lib/server/supabase";

/** Service-role client for trusted server-side writes (stats, XP, quests, etc.). */
export function getTrustedStatsWriteClient() {
  return createAdminClient();
}
