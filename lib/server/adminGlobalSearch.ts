import { createAdminClient } from "@/lib/server/supabase";
import type { AdminSearchScope } from "@/lib/admin/searchQuery";

const RESULT_LIMIT = 10;

export type AdminSearchUserResult = {
  kind: "user";
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  level: number | null;
  verified: boolean;
  safetyStatus: "active" | "suspended" | "banned";
};

export type AdminSearchOrganizationResult = {
  kind: "organization";
  id: string;
  name: string;
  category: string | null;
  schoolName: string | null;
  ownerUsername: string | null;
  ownerDisplayName: string | null;
  isFrozen: boolean;
  imported: boolean;
};

export type AdminSearchEventResult = {
  kind: "event";
  id: string;
  title: string;
  startsAt: string | null;
  organizer: string | null;
  imported: boolean;
  removed: boolean;
};

export type AdminSearchReportResult = {
  kind: "report";
  id: string;
  reportType: "message" | "event" | "organization";
  reason: string;
  status: string;
  reporterLabel: string | null;
  reportedLabel: string | null;
  createdAt: string;
};

export type AdminSearchMessageResult = {
  kind: "message";
  id: string;
  contentPreview: string;
  senderLabel: string | null;
  recipientLabel: string | null;
  createdAt: string;
};

export type AdminSearchAuditResult = {
  kind: "audit";
  id: string;
  actionType: string;
  adminLabel: string | null;
  targetLabel: string | null;
  createdAt: string;
};

export type AdminGlobalSearchResults = {
  users: AdminSearchUserResult[];
  organizations: AdminSearchOrganizationResult[];
  events: AdminSearchEventResult[];
  reports: AdminSearchReportResult[];
  messages: AdminSearchMessageResult[];
  auditLogs: AdminSearchAuditResult[];
};

type AuthUserLite = { id: string; email: string | null };

async function listAuthUsers(admin: ReturnType<typeof createAdminClient>, max = 500): Promise<AuthUserLite[]> {
  const users: AuthUserLite[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const batch = (data?.users ?? []).map((user) => ({ id: user.id, email: user.email ?? null }));
    users.push(...batch);
    if (batch.length < 100) break;
  }
  return users.slice(0, max);
}

function ilikeNeedle(query: string) {
  return `%${query.replace(/[%_,]/g, "")}%`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function levelFromXp(totalXp: number | null | undefined) {
  const xp = Math.max(0, Number(totalXp ?? 0));
  return Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
}

function profileLabel(profile: { display_name?: string | null; username?: string | null } | null | undefined) {
  if (!profile) return null;
  return profile.display_name ?? profile.username ?? null;
}

async function searchUsers(
  admin: ReturnType<typeof createAdminClient>,
  query: string,
  emailNeedle: boolean,
): Promise<AdminSearchUserResult[]> {
  const authUsers = await listAuthUsers(admin);
  const emailMap = new Map(authUsers.map((user) => [user.id, user.email]));
  const emailMatches =
    emailNeedle || query.includes("@")
      ? authUsers.filter((user) => (user.email ?? "").toLowerCase().includes(query.toLowerCase())).map((user) => user.id)
      : [];

  let profileQuery = admin.from("profiles").select("id, username, display_name").limit(RESULT_LIMIT * 3);
  if (isUuid(query)) {
    profileQuery = profileQuery.eq("id", query);
  } else if (query) {
    profileQuery = profileQuery.or(`username.ilike.${ilikeNeedle(query)},display_name.ilike.${ilikeNeedle(query)}`);
  }

  const { data: profiles, error } = await profileQuery;
  if (error) throw error;

  const ids = Array.from(new Set([...(profiles ?? []).map((row) => row.id), ...emailMatches])).slice(0, RESULT_LIMIT * 2);
  if (ids.length === 0) return [];

  const [{ data: statsRows }, { data: safetyRows }, { data: verificationRows }] = await Promise.all([
    admin.from("user_stats").select("user_id, total_xp").in("user_id", ids),
    admin.from("user_account_safety").select("user_id, status").in("user_id", ids),
    admin.from("user_school_verifications").select("user_id, status").in("user_id", ids),
  ]);

  const statsMap = new Map((statsRows ?? []).map((row) => [row.user_id, row.total_xp as number]));
  const safetyMap = new Map((safetyRows ?? []).map((row) => [row.user_id, row.status as string]));
  const verifiedSet = new Set(
    (verificationRows ?? []).filter((row) => row.status === "verified").map((row) => row.user_id as string),
  );

  const results = ids
    .map((id) => {
      const profile = (profiles ?? []).find((row) => row.id === id);
      if (!profile && !emailMatches.includes(id)) return null;
      return {
        kind: "user" as const,
        id,
        username: profile?.username ?? "unknown",
        displayName: profile?.display_name ?? profile?.username ?? "Unknown",
        email: emailMap.get(id) ?? null,
        level: levelFromXp(statsMap.get(id)),
        verified: verifiedSet.has(id),
        safetyStatus: (safetyMap.get(id) as AdminSearchUserResult["safetyStatus"] | undefined) ?? "active",
      };
    })
    .filter(Boolean) as AdminSearchUserResult[];

  return results.slice(0, RESULT_LIMIT);
}

async function searchOrganizations(
  admin: ReturnType<typeof createAdminClient>,
  query: string,
): Promise<AdminSearchOrganizationResult[]> {
  let orgQuery = admin
    .from("student_organizations")
    .select("id, name, category, school_name, is_frozen")
    .limit(RESULT_LIMIT);
  if (isUuid(query)) orgQuery = orgQuery.eq("id", query);
  else if (query) orgQuery = orgQuery.or(`name.ilike.${ilikeNeedle(query)},category.ilike.${ilikeNeedle(query)}`);

  let externalQuery = admin
    .from("external_organizations")
    .select("id, name, category")
    .eq("is_active", true)
    .limit(RESULT_LIMIT);
  if (isUuid(query)) externalQuery = externalQuery.eq("id", query);
  else if (query) externalQuery = externalQuery.ilike("name", ilikeNeedle(query));

  const [{ data: campusOrgs }, { data: externalOrgs }] = await Promise.all([orgQuery, externalQuery]);

  const orgIds = (campusOrgs ?? []).map((row) => row.id as string);
  const { data: owners } = orgIds.length
    ? await admin
        .from("organization_members")
        .select("organization_id, user_id, profiles(username, display_name)")
        .eq("org_role", "owner")
        .eq("status", "approved")
        .in("organization_id", orgIds)
    : { data: [] };

  const ownerMap = new Map<string, { username: string | null; display_name: string | null }>();
  for (const row of owners ?? []) {
    const profile = row.profiles as { username?: string; display_name?: string } | { username?: string; display_name?: string }[] | null;
    const resolved = Array.isArray(profile) ? profile[0] : profile;
    ownerMap.set(row.organization_id as string, {
      username: resolved?.username ?? null,
      display_name: resolved?.display_name ?? null,
    });
  }

  const campusResults: AdminSearchOrganizationResult[] = (campusOrgs ?? []).map((row) => {
    const owner = ownerMap.get(row.id as string);
    return {
      kind: "organization",
      id: row.id as string,
      name: row.name as string,
      category: (row.category as string | null) ?? null,
      schoolName: (row.school_name as string | null) ?? null,
      ownerUsername: owner?.username ?? null,
      ownerDisplayName: owner?.display_name ?? null,
      isFrozen: Boolean(row.is_frozen),
      imported: false,
    };
  });

  const externalResults: AdminSearchOrganizationResult[] = (externalOrgs ?? []).map((row) => ({
    kind: "organization",
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string | null) ?? null,
    schoolName: "URInvolved",
    ownerUsername: null,
    ownerDisplayName: null,
    isFrozen: false,
    imported: true,
  }));

  return [...campusResults, ...externalResults].slice(0, RESULT_LIMIT);
}

async function searchEvents(
  admin: ReturnType<typeof createAdminClient>,
  query: string,
): Promise<AdminSearchEventResult[]> {
  let campusQuery = admin
    .from("campus_events")
    .select("id, title, starts_at, is_removed_by_moderation, host_organization_id, host_user_id, student_organizations(name)")
    .order("starts_at", { ascending: false })
    .limit(RESULT_LIMIT);
  if (isUuid(query)) campusQuery = campusQuery.eq("id", query);
  else if (query) campusQuery = campusQuery.ilike("title", ilikeNeedle(query));

  let externalQuery = admin
    .from("external_events")
    .select("id, title, starts_at, organization_name, is_active")
    .eq("source", "urinvolved")
    .order("starts_at", { ascending: false })
    .limit(RESULT_LIMIT);
  if (isUuid(query)) externalQuery = externalQuery.eq("id", query);
  else if (query) externalQuery = externalQuery.or(`title.ilike.${ilikeNeedle(query)},organization_name.ilike.${ilikeNeedle(query)}`);

  const [{ data: campusEvents }, { data: externalEvents }] = await Promise.all([campusQuery, externalQuery]);

  const hostIds = Array.from(new Set((campusEvents ?? []).map((row) => row.host_user_id).filter(Boolean) as string[]));
  const { data: hostProfiles } = hostIds.length
    ? await admin.from("profiles").select("id, username, display_name").in("id", hostIds)
    : { data: [] };
  const hostMap = new Map((hostProfiles ?? []).map((row) => [row.id, row]));

  const campusResults: AdminSearchEventResult[] = (campusEvents ?? []).map((row) => {
    const org = row.student_organizations as { name?: string } | { name?: string }[] | null;
    const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
    const host = row.host_user_id ? hostMap.get(row.host_user_id as string) : null;
    return {
      kind: "event",
      id: row.id as string,
      title: row.title as string,
      startsAt: (row.starts_at as string | null) ?? null,
      organizer: orgName ?? profileLabel(host),
      imported: false,
      removed: Boolean(row.is_removed_by_moderation),
    };
  });

  const externalResults: AdminSearchEventResult[] = (externalEvents ?? []).map((row) => ({
    kind: "event",
    id: row.id as string,
    title: row.title as string,
    startsAt: (row.starts_at as string | null) ?? null,
    organizer: (row.organization_name as string | null) ?? null,
    imported: true,
    removed: !row.is_active,
  }));

  return [...campusResults, ...externalResults].slice(0, RESULT_LIMIT);
}

async function searchReports(
  admin: ReturnType<typeof createAdminClient>,
  query: string,
): Promise<AdminSearchReportResult[]> {
  const openOnly = query.toLowerCase() === "open";

  const [{ data: messageReports }, { data: eventReports }, { data: orgReports }] = await Promise.all([
    (() => {
      let q = admin
        .from("message_reports")
        .select("id, reason, status, created_at, reporter_id, reported_user_id")
        .order("created_at", { ascending: false })
        .limit(RESULT_LIMIT);
      if (isUuid(query)) q = q.eq("id", query);
      else if (openOnly) q = q.in("status", ["open", "reviewing"]);
      else if (query) q = q.or(`reason.ilike.${ilikeNeedle(query)},status.ilike.${ilikeNeedle(query)}`);
      return q;
    })(),
    (() => {
      let q = admin
        .from("campus_event_reports")
        .select("id, reason, status, created_at, reporter_id, event_id")
        .order("created_at", { ascending: false })
        .limit(RESULT_LIMIT);
      if (isUuid(query)) q = q.eq("id", query);
      else if (openOnly) q = q.eq("status", "open");
      else if (query) q = q.or(`reason.ilike.${ilikeNeedle(query)},status.ilike.${ilikeNeedle(query)}`);
      return q;
    })(),
    (() => {
      let q = admin
        .from("organization_reports")
        .select("id, reason, status, created_at, reporter_id, organization_id")
        .order("created_at", { ascending: false })
        .limit(RESULT_LIMIT);
      if (isUuid(query)) q = q.eq("id", query);
      else if (openOnly) q = q.eq("status", "open");
      else if (query) q = q.or(`reason.ilike.${ilikeNeedle(query)},status.ilike.${ilikeNeedle(query)}`);
      return q;
    })(),
  ]);

  const profileIds = Array.from(
    new Set(
      [
        ...(messageReports ?? []).flatMap((row) => [row.reporter_id, row.reported_user_id]),
        ...(eventReports ?? []).map((row) => row.reporter_id),
        ...(orgReports ?? []).map((row) => row.reporter_id),
      ].filter(Boolean) as string[],
    ),
  );
  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id, username, display_name").in("id", profileIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((row) => [row.id, row]));

  const messageResults: AdminSearchReportResult[] = (messageReports ?? []).map((row) => ({
    kind: "report",
    id: row.id as string,
    reportType: "message",
    reason: row.reason as string,
    status: row.status as string,
    reporterLabel: profileLabel(profileMap.get(row.reporter_id as string)),
    reportedLabel: profileLabel(profileMap.get(row.reported_user_id as string)),
    createdAt: row.created_at as string,
  }));

  const eventResults: AdminSearchReportResult[] = (eventReports ?? []).map((row) => ({
    kind: "report",
    id: row.id as string,
    reportType: "event",
    reason: row.reason as string,
    status: row.status as string,
    reporterLabel: profileLabel(profileMap.get(row.reporter_id as string)),
    reportedLabel: `Event ${String(row.event_id).slice(0, 8)}…`,
    createdAt: row.created_at as string,
  }));

  const orgResults: AdminSearchReportResult[] = (orgReports ?? []).map((row) => ({
    kind: "report",
    id: row.id as string,
    reportType: "organization",
    reason: row.reason as string,
    status: row.status as string,
    reporterLabel: profileLabel(profileMap.get(row.reporter_id as string)),
    reportedLabel: `Org ${String(row.organization_id).slice(0, 8)}…`,
    createdAt: row.created_at as string,
  }));

  return [...messageResults, ...eventResults, ...orgResults]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RESULT_LIMIT);
}

async function searchMessages(
  admin: ReturnType<typeof createAdminClient>,
  query: string,
): Promise<AdminSearchMessageResult[]> {
  if (!query && !isUuid(query)) return [];
  let q = admin
    .from("direct_messages")
    .select("id, content, created_at, sender_id, recipient_id")
    .order("created_at", { ascending: false })
    .limit(RESULT_LIMIT);
  if (isUuid(query)) q = q.eq("id", query);
  else q = q.ilike("content", ilikeNeedle(query));

  const { data: rows, error } = await q;
  if (error) throw error;

  const profileIds = Array.from(
    new Set((rows ?? []).flatMap((row) => [row.sender_id, row.recipient_id]).filter(Boolean) as string[]),
  );
  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id, username, display_name").in("id", profileIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((row) => [row.id, row]));

  return (rows ?? []).map((row) => ({
    kind: "message",
    id: row.id as string,
    contentPreview: (row.content as string).slice(0, 140),
    senderLabel: profileLabel(profileMap.get(row.sender_id as string)),
    recipientLabel: profileLabel(profileMap.get(row.recipient_id as string)),
    createdAt: row.created_at as string,
  }));
}

async function searchAuditLogs(
  admin: ReturnType<typeof createAdminClient>,
  query: string,
): Promise<AdminSearchAuditResult[]> {
  let q = admin
    .from("admin_audit_logs")
    .select("id, action_type, admin_email, target_user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(RESULT_LIMIT);
  if (isUuid(query)) q = q.or(`id.eq.${query},target_user_id.eq.${query}`);
  else if (query) q = q.or(`action_type.ilike.${ilikeNeedle(query)},admin_email.ilike.${ilikeNeedle(query)}`);

  const { data: rows, error } = await q;
  if (error) throw error;

  const targetIds = Array.from(new Set((rows ?? []).map((row) => row.target_user_id).filter(Boolean) as string[]));
  const { data: profiles } = targetIds.length
    ? await admin.from("profiles").select("id, username, display_name").in("id", targetIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((row) => [row.id, row]));

  return (rows ?? []).map((row) => ({
    kind: "audit",
    id: row.id as string,
    actionType: row.action_type as string,
    adminLabel: (row.admin_email as string | null) ?? null,
    targetLabel: profileLabel(profileMap.get(row.target_user_id as string)),
    createdAt: row.created_at as string,
  }));
}

export async function runAdminGlobalSearch(args: {
  query: string;
  scope: AdminSearchScope;
}): Promise<AdminGlobalSearchResults> {
  const admin = createAdminClient();
  const query = args.query.trim();
  const emailNeedle = args.scope === "users" && query.includes("@");

  const empty: AdminGlobalSearchResults = {
    users: [],
    organizations: [],
    events: [],
    reports: [],
    messages: [],
    auditLogs: [],
  };

  if (query.length < 2 && !isUuid(query)) return empty;

  const scope = args.scope;
  const searchAll = scope === "all";

  const [users, organizations, events, reports, messages, auditLogs] = await Promise.all([
    searchAll || scope === "users" ? searchUsers(admin, query, emailNeedle) : Promise.resolve([]),
    searchAll || scope === "organizations" ? searchOrganizations(admin, query) : Promise.resolve([]),
    searchAll || scope === "events" ? searchEvents(admin, query) : Promise.resolve([]),
    searchAll || scope === "reports" ? searchReports(admin, query) : Promise.resolve([]),
    searchAll || scope === "messages" ? searchMessages(admin, query) : Promise.resolve([]),
    searchAll || scope === "audit" ? searchAuditLogs(admin, query) : Promise.resolve([]),
  ]);

  return { users, organizations, events, reports, messages, auditLogs };
}
