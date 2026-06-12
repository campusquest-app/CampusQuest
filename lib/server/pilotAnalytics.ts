import { ApiError } from "@/lib/server/http";
import {
  PILOT_ANALYTICS_TIMEZONE,
  rollingWindowStartMs,
  startOfCalendarDayInTimeZone,
  startOfCalendarMonthInTimeZone,
} from "@/lib/server/analyticsTime";
import { createAdminClient } from "@/lib/server/supabase";

async function countTable(admin: ReturnType<typeof createAdminClient>, table: string) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) throw new ApiError(400, error.message, "ANALYTICS_COUNT_FAILED");
  return count ?? 0;
}

type ProfileActivityRow = {
  id: string;
  role: string | null;
  last_active_at: string | null;
};

function isMissingLastActiveColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /last_active_at/i.test(error.message ?? "");
}

async function loadProfilesActiveSince(
  admin: ReturnType<typeof createAdminClient>,
  sinceIso: string,
): Promise<ProfileActivityRow[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, last_active_at")
    .not("last_active_at", "is", null)
    .gte("last_active_at", sinceIso);

  if (error) {
    if (isMissingLastActiveColumn(error)) return [];
    throw new ApiError(400, error.message, "ANALYTICS_ACTIVE_USERS_FAILED");
  }

  return (data ?? []) as ProfileActivityRow[];
}

async function loadBannedUserIds(admin: ReturnType<typeof createAdminClient>, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("user_account_safety")
    .select("user_id")
    .in("user_id", userIds)
    .eq("status", "banned");
  if (error) throw new ApiError(400, error.message, "ANALYTICS_SAFETY_FAILED");
  return new Set((data ?? []).map((row) => row.user_id as string));
}

function countActiveUsers(rows: ProfileActivityRow[], bannedIds: Set<string>, studentsOnly: boolean): number {
  return rows.filter((row) => {
    if (bannedIds.has(row.id)) return false;
    if (!studentsOnly) return true;
    const role = row.role ?? "student";
    return role === "student";
  }).length;
}

export async function getPilotAnalyticsSnapshot() {
  const admin = createAdminClient();
  const now = new Date();
  const startOfTodayIso = startOfCalendarDayInTimeZone(PILOT_ANALYTICS_TIMEZONE, now).toISOString();
  const startOfWeekIso = rollingWindowStartMs(7, now).toISOString();
  const startOfMonthIso = startOfCalendarMonthInTimeZone(PILOT_ANALYTICS_TIMEZONE, now).toISOString();

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
    dailyRows,
    weeklyRows,
    monthlyRows,
    lastActivityResult,
  ] = await Promise.all([
    countTable(admin, "profiles"),
    countTable(admin, "campus_events"),
    countTable(admin, "event_rsvps"),
    countTable(admin, "student_organizations"),
    countTable(admin, "direct_messages"),
    countTable(admin, "message_reports"),
    countTable(admin, "campus_event_reports"),
    countTable(admin, "organization_reports"),
    loadProfilesActiveSince(admin, startOfTodayIso),
    loadProfilesActiveSince(admin, startOfWeekIso),
    loadProfilesActiveSince(admin, startOfMonthIso),
    admin
      .from("profiles")
      .select("last_active_at")
      .not("last_active_at", "is", null)
      .order("last_active_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (lastActivityResult.error && !isMissingLastActiveColumn(lastActivityResult.error)) {
    throw new ApiError(400, lastActivityResult.error.message, "ANALYTICS_LAST_ACTIVITY_FAILED");
  }

  const activeUserIds = Array.from(
    new Set([...dailyRows, ...weeklyRows, ...monthlyRows].map((row) => row.id)),
  );
  const bannedIds = await loadBannedUserIds(admin, activeUserIds);

  return {
    totalUsers,
    verifiedUsers: verifiedUsersCount ?? 0,
    eventsCreated,
    eventRsvps,
    organizationsCreated,
    messagesSent,
    reportsSubmitted: messageReports + eventReports + organizationReports,
    dailyActiveUsers: countActiveUsers(dailyRows, bannedIds, false),
    dailyActiveStudents: countActiveUsers(dailyRows, bannedIds, true),
    weeklyActiveUsers: countActiveUsers(weeklyRows, bannedIds, false),
    monthlyActiveUsers: countActiveUsers(monthlyRows, bannedIds, false),
    lastActivityAt: (lastActivityResult.data?.last_active_at as string | null) ?? null,
    analyticsTimezone: PILOT_ANALYTICS_TIMEZONE,
    generatedAt: now.toISOString(),
  };
}
