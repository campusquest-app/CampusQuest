import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

async function countTable(admin: ReturnType<typeof createAdminClient>, table: string) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) throw new ApiError(400, error.message, "ANALYTICS_COUNT_FAILED");
  return count ?? 0;
}

export async function getPilotAnalyticsSnapshot() {
  const admin = createAdminClient();
  const { count: verifiedUsersCount, error: verifiedUsersError } = await admin
    .from("user_school_verifications")
    .select("*", { count: "exact", head: true })
    .eq("status", "verified");
  if (verifiedUsersError) throw new ApiError(400, verifiedUsersError.message, "ANALYTICS_COUNT_FAILED");

  const [
    totalUsers,
    eventsCreated,
    eventRsvps,
    organizationsCreated,
    messagesSent,
    messageReports,
    eventReports,
    organizationReports,
  ] = await Promise.all([
    countTable(admin, "profiles"),
    countTable(admin, "campus_events"),
    countTable(admin, "event_rsvps"),
    countTable(admin, "student_organizations"),
    countTable(admin, "direct_messages"),
    countTable(admin, "message_reports"),
    countTable(admin, "campus_event_reports"),
    countTable(admin, "organization_reports"),
  ]);

  const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [xpRows, rsvpRows, messageRows] = await Promise.all([
    admin.from("xp_logs").select("user_id").gte("created_at", oneDayAgoIso),
    admin.from("event_rsvps").select("user_id").gte("updated_at", oneDayAgoIso),
    admin.from("direct_messages").select("sender_id").gte("created_at", oneDayAgoIso),
  ]);
  if (xpRows.error) throw new ApiError(400, xpRows.error.message, "ANALYTICS_DAU_FAILED");
  if (rsvpRows.error) throw new ApiError(400, rsvpRows.error.message, "ANALYTICS_DAU_FAILED");
  if (messageRows.error) throw new ApiError(400, messageRows.error.message, "ANALYTICS_DAU_FAILED");

  const activeUsers = new Set<string>();
  for (const row of xpRows.data ?? []) activeUsers.add(row.user_id);
  for (const row of rsvpRows.data ?? []) activeUsers.add(row.user_id);
  for (const row of messageRows.data ?? []) activeUsers.add(row.sender_id);

  return {
    totalUsers,
    verifiedUsers: verifiedUsersCount ?? 0,
    eventsCreated,
    eventRsvps,
    organizationsCreated,
    messagesSent,
    reportsSubmitted: messageReports + eventReports + organizationReports,
    dailyActiveUsers: activeUsers.size,
    generatedAt: new Date().toISOString(),
  };
}
