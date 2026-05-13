import { ApiError } from "@/lib/server/http";
import { logAdminAuditAction } from "@/lib/server/audit";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;
type CampusReportReason = "unsafe" | "harassment" | "scam" | "inappropriate" | "spam" | "other";

export async function reportEvent(args: {
  userClient: SupabaseClientLike;
  userId: string;
  eventId: string;
  reason: CampusReportReason;
  details?: string;
}) {
  const { userClient, userId, eventId, reason, details } = args;
  const { data: event, error: eventError } = await userClient
    .from("campus_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new ApiError(400, eventError.message, "EVENT_LOOKUP_FAILED");
  if (!event) throw new ApiError(404, "Event not found.", "EVENT_NOT_FOUND");

  const { data, error } = await userClient
    .from("campus_event_reports")
    .upsert(
      {
        event_id: eventId,
        reporter_id: userId,
        reason,
        details: details?.trim() ? details.trim().slice(0, 1000) : null,
        status: "open",
      },
      { onConflict: "event_id,reporter_id" },
    )
    .select("id, status, reason, created_at")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not report event.", "EVENT_REPORT_FAILED");
  return data;
}

export async function reportOrganization(args: {
  userClient: SupabaseClientLike;
  userId: string;
  organizationId: string;
  reason: CampusReportReason;
  details?: string;
}) {
  const { userClient, userId, organizationId, reason, details } = args;
  const { data: org, error: orgError } = await userClient
    .from("student_organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");

  const { data, error } = await userClient
    .from("organization_reports")
    .upsert(
      {
        organization_id: organizationId,
        reporter_id: userId,
        reason,
        details: details?.trim() ? details.trim().slice(0, 1000) : null,
        status: "open",
      },
      { onConflict: "organization_id,reporter_id" },
    )
    .select("id, status, reason, created_at")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not report organization.", "ORGANIZATION_REPORT_FAILED");
  }
  return data;
}

export async function listCampusReportsForModeration(limit = 100) {
  const admin = createAdminClient();
  const capped = Math.max(1, Math.min(200, limit));
  const [eventReportsRes, organizationReportsRes] = await Promise.all([
    admin
      .from("campus_event_reports")
      .select("id, event_id, reporter_id, reason, details, status, moderator_note, reviewed_by, reviewed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(capped),
    admin
      .from("organization_reports")
      .select(
        "id, organization_id, reporter_id, reason, details, status, moderator_note, reviewed_by, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(capped),
  ]);
  if (eventReportsRes.error) {
    throw new ApiError(400, eventReportsRes.error.message, "EVENT_REPORTS_FETCH_FAILED");
  }
  if (organizationReportsRes.error) {
    throw new ApiError(400, organizationReportsRes.error.message, "ORGANIZATION_REPORTS_FETCH_FAILED");
  }

  const eventReports = eventReportsRes.data ?? [];
  const organizationReports = organizationReportsRes.data ?? [];
  const reporterIds = Array.from(
    new Set(
      [...eventReports.map((row) => row.reporter_id), ...organizationReports.map((row) => row.reporter_id)].filter(Boolean),
    ),
  );
  const eventIds = eventReports.map((row) => row.event_id);
  const organizationIds = organizationReports.map((row) => row.organization_id);

  const [profilesRes, eventsRes, organizationsRes] = await Promise.all([
    reporterIds.length
      ? admin.from("profiles").select("id, username, display_name").in("id", reporterIds)
      : Promise.resolve({ data: [], error: null } as any),
    eventIds.length
      ? admin.from("campus_events").select("id, title, created_by, school_name, school_domain, is_removed_by_moderation").in("id", eventIds)
      : Promise.resolve({ data: [], error: null } as any),
    organizationIds.length
      ? admin
          .from("student_organizations")
          .select("id, name, created_by, school_name, school_domain, is_removed_by_moderation")
          .in("id", organizationIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (profilesRes.error) throw new ApiError(400, profilesRes.error.message, "REPORT_PROFILES_FETCH_FAILED");
  if (eventsRes.error) throw new ApiError(400, eventsRes.error.message, "REPORT_EVENTS_FETCH_FAILED");
  if (organizationsRes.error) throw new ApiError(400, organizationsRes.error.message, "REPORT_ORGS_FETCH_FAILED");

  const profileMap = new Map((profilesRes.data ?? []).map((row: any) => [row.id, row]));
  const eventMap = new Map((eventsRes.data ?? []).map((row: any) => [row.id, row]));
  const organizationMap = new Map((organizationsRes.data ?? []).map((row: any) => [row.id, row]));

  return {
    eventReports: eventReports.map((row: any) => ({
      id: row.id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      moderatorNote: row.moderator_note,
      reporter: profileMap.get(row.reporter_id) ?? null,
      event: eventMap.get(row.event_id) ?? null,
    })),
    organizationReports: organizationReports.map((row: any) => ({
      id: row.id,
      reason: row.reason,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      moderatorNote: row.moderator_note,
      reporter: profileMap.get(row.reporter_id) ?? null,
      organization: organizationMap.get(row.organization_id) ?? null,
    })),
  };
}

export async function resolveCampusReport(args: {
  entityType: "event" | "organization";
  reportId: string;
  status: "resolved" | "dismissed";
  moderatorNote?: string;
  reviewerUserId?: string;
  reviewerEmail?: string;
}) {
  const { entityType, reportId, status, moderatorNote, reviewerUserId, reviewerEmail } = args;
  const admin = createAdminClient();
  const table = entityType === "event" ? "campus_event_reports" : "organization_reports";

  const { data, error } = await admin
    .from(table)
    .update({
      status,
      moderator_note: moderatorNote?.trim() ? moderatorNote.trim().slice(0, 1000) : null,
      reviewed_by: reviewerUserId ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .select("id, status")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not resolve report.", "REPORT_RESOLVE_FAILED");

  await logAdminAuditAction({
    actionType: status === "resolved" ? "report_resolved" : "report_dismissed",
    adminUserId: reviewerUserId ?? null,
    adminEmail: reviewerEmail ?? null,
    reason: moderatorNote ?? null,
    metadata: { entityType, reportId: data.id, status: data.status },
  });

  return data;
}

export async function moderateCampusContent(args: {
  entityType: "event" | "organization";
  entityId: string;
  action: "remove" | "restore";
  moderatorNote?: string;
  reviewerUserId?: string;
  reviewerEmail?: string;
}) {
  const { entityType, entityId, action, moderatorNote, reviewerUserId, reviewerEmail } = args;
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const removed = action === "remove";
  const table = entityType === "event" ? "campus_events" : "student_organizations";

  const { data, error } = await admin
    .from(table)
    .update({
      is_removed_by_moderation: removed,
      moderation_note: moderatorNote?.trim() ? moderatorNote.trim().slice(0, 1000) : null,
      moderated_by: reviewerUserId ?? null,
      moderated_at: nowIso,
    })
    .eq("id", entityId)
    .select("id, is_removed_by_moderation")
    .single();
  if (error || !data) {
    throw new ApiError(400, error?.message ?? "Could not update moderation status.", "CAMPUS_CONTENT_MODERATE_FAILED");
  }

  await logAdminAuditAction({
    actionType: removed ? "campus_content_removed" : "campus_content_restored",
    adminUserId: reviewerUserId ?? null,
    adminEmail: reviewerEmail ?? null,
    reason: moderatorNote ?? null,
    metadata: { entityType, entityId: data.id },
  });

  return data;
}
