import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { isAdminEmail } from "@/lib/server/adminAuth";
import { ApiError } from "@/lib/server/http";
import { createNotificationsBulk, createNotification } from "@/lib/server/notifications";
import { requestOrganizationJoin, setOrganizationFollow } from "@/lib/server/organizationManagement";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export async function listEvents(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  filters: {
    category?: string;
    organizationId?: string;
    isPaid?: boolean;
    location?: string;
    timeframe?: "today" | "this_week";
  };
}) {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, filters } = args;
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
  const query = userClient
    .from("campus_events")
    .select(
      "id, title, description, category, location_name, starts_at, ends_at, is_paid, ticket_link, host_organization_id, created_by, is_cancelled, created_at, school_name, school_domain, student_organizations(id, name, logo_url)",
    )
    .eq("school_domain", school.schoolDomain)
    .order("starts_at", { ascending: true });

  if (filters.category) query.eq("category", filters.category);
  if (filters.organizationId) query.eq("host_organization_id", filters.organizationId);
  if (typeof filters.isPaid === "boolean") query.eq("is_paid", filters.isPaid);
  if (filters.location) query.ilike("location_name", `%${filters.location}%`);
  if (filters.timeframe === "today") {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    query.gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString());
  } else if (filters.timeframe === "this_week") {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    query.gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString());
  }

  const { data: events, error } = await query;
  if (error) throw new ApiError(400, error.message, "EVENTS_FETCH_FAILED");
  const eventRows = events ?? [];
  const eventIds = eventRows.map((row: any) => row.id);
  const [{ data: rsvps, error: rsvpError }, { data: myRsvps, error: myRsvpError }] = await Promise.all([
    eventIds.length > 0
      ? userClient.from("event_rsvps").select("event_id, status").in("event_id", eventIds)
      : Promise.resolve({ data: [] as any[], error: null as any }),
    eventIds.length > 0
      ? userClient.from("event_rsvps").select("event_id, status").in("event_id", eventIds).eq("user_id", userId)
      : Promise.resolve({ data: [] as any[], error: null as any }),
  ]);
  if (rsvpError) throw new ApiError(400, rsvpError.message, "EVENT_RSVP_COUNTS_FAILED");
  if (myRsvpError) throw new ApiError(400, myRsvpError.message, "EVENT_RSVP_STATUS_FAILED");

  const counts = new Map<string, number>();
  for (const row of rsvps ?? []) {
    if (row.status === "going") counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  }
  const myMap = new Map<string, "going" | "interested" | "not_going">();
  for (const row of myRsvps ?? []) {
    myMap.set(row.event_id, row.status);
  }

  return eventRows.map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isPaid: Boolean(row.is_paid),
    ticketLink: row.ticket_link,
    isCancelled: Boolean(row.is_cancelled),
    createdBy: row.created_by,
    hostOrganization: Array.isArray(row.student_organizations) ? row.student_organizations[0] ?? null : row.student_organizations ?? null,
    rsvpCount: counts.get(row.id) ?? 0,
    myRsvpStatus: myMap.get(row.id) ?? null,
  }));
}

export async function getEventDetails(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  eventId: string;
}) {
  const list = await listEvents({
    userClient: args.userClient,
    userId: args.userId,
    userEmail: args.userEmail,
    emailConfirmedAt: args.emailConfirmedAt,
    confirmedAt: args.confirmedAt,
    filters: {},
  });
  const found = list.find((event) => event.id === args.eventId);
  if (!found) throw new ApiError(404, "Event not found.", "EVENT_NOT_FOUND");
  return found;
}

export async function createEvent(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  input: {
    title: string;
    description: string;
    category: string;
    locationName: string;
    startsAt: string;
    endsAt?: string;
    isPaid?: boolean;
    ticketLink?: string;
    hostOrganizationId?: string;
  };
}) {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, input } = args;
  await assertAccountCanSocialize(userClient, userId);
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
  if (input.hostOrganizationId) {
    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("org_role, role, status")
      .eq("organization_id", input.hostOrganizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw new ApiError(400, membershipError.message, "ORG_MEMBERSHIP_CHECK_FAILED");
    const { data: org, error: orgError } = await userClient
      .from("student_organizations")
      .select("created_by, name, is_frozen")
      .eq("id", input.hostOrganizationId)
      .maybeSingle();
    if (orgError) throw new ApiError(400, orgError.message, "ORG_LOOKUP_FAILED");
    if (!org) throw new ApiError(404, "Host organization not found.", "ORG_NOT_FOUND");
    if (Boolean((org as any).is_frozen)) {
      throw new ApiError(403, "Organization activity is currently frozen.", "ORGANIZATION_FROZEN");
    }
    const normalizedRole = membership ? ((membership as any).org_role ?? (membership as any).role ?? "member") : null;
    const isOrgAdmin = Boolean(membership && (membership as any).status !== "denied" && (normalizedRole === "owner" || normalizedRole === "admin" || normalizedRole === "manager"));
    if (org.created_by !== userId && !isOrgAdmin) {
      throw new ApiError(403, "Only organization owners/managers can host org events.", "ORG_EVENT_FORBIDDEN");
    }
  }

  const { data, error } = await userClient
    .from("campus_events")
    .insert({
      title: input.title,
      description: input.description,
      category: input.category,
      location_name: input.locationName,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      is_paid: Boolean(input.isPaid),
      ticket_link: input.ticketLink ?? null,
      host_organization_id: input.hostOrganizationId ?? null,
      created_by: userId,
      school_name: school.schoolName,
      school_domain: school.schoolDomain,
    })
    .select("id, host_organization_id, title")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not create event.", "EVENT_CREATE_FAILED");

  if (data.host_organization_id) {
    const [{ data: members, error: membersError }, { data: org, error: orgError }] = await Promise.all([
      userClient
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", data.host_organization_id),
      userClient.from("student_organizations").select("name").eq("id", data.host_organization_id).maybeSingle(),
    ]);
    if (!membersError && !orgError) {
      const targets = (members ?? []).map((row) => row.user_id).filter((id) => id !== userId);
      if (targets.length > 0) {
        await createNotificationsBulk({
          userIds: targets,
          type: "organization_event_announcement",
          title: `${org?.name ?? "Organization"} posted a new event`,
          body: data.title,
          relatedEntityType: "event",
          relatedEntityId: data.id,
        });
      }
    }
  }
  return data;
}

export async function updateEvent(args: {
  userClient: SupabaseClientLike;
  userId: string;
  eventId: string;
  input: {
    title?: string;
    description?: string;
    category?: string;
    locationName?: string;
    startsAt?: string;
    endsAt?: string | null;
    isPaid?: boolean;
    ticketLink?: string | null;
    hostOrganizationId?: string | null;
    isCancelled?: boolean;
  };
}) {
  const { userClient, userId, eventId, input } = args;
  const admin = createAdminClient();
  await assertAccountCanSocialize(userClient, userId);
  const { data: existing, error: existingError } = await userClient
    .from("campus_events")
    .select("id, created_by, host_organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (existingError) throw new ApiError(400, existingError.message, "EVENT_LOOKUP_FAILED");
  if (!existing) throw new ApiError(404, "Event not found.", "EVENT_NOT_FOUND");
  let canEdit = existing.created_by === userId;
  if (!canEdit && existing.host_organization_id) {
    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("org_role, role, status")
      .eq("organization_id", existing.host_organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw new ApiError(400, membershipError.message, "ORG_MEMBERSHIP_CHECK_FAILED");
    const normalizedRole = membership ? ((membership as any).org_role ?? membership.role) : null;
    const isOrgAdmin =
      Boolean(membership && (membership as any).status !== "denied" && (normalizedRole === "owner" || normalizedRole === "admin" || normalizedRole === "manager"));
    if (isOrgAdmin) {
      const { data: org, error: orgError } = await userClient
        .from("student_organizations")
        .select("id, is_frozen")
        .eq("id", existing.host_organization_id)
        .maybeSingle();
      if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
      if (org && !Boolean((org as any).is_frozen)) canEdit = true;
    }
  }
  if (!canEdit) throw new ApiError(403, "Only event creators or organization admins can edit events.", "EVENT_EDIT_FORBIDDEN");

  const { data, error } = await admin
    .from("campus_events")
    .update({
      title: input.title,
      description: input.description,
      category: input.category,
      location_name: input.locationName,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      is_paid: input.isPaid,
      ticket_link: input.ticketLink,
      host_organization_id: input.hostOrganizationId,
      is_cancelled: input.isCancelled,
    })
    .eq("id", eventId)
    .select("id")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not update event.", "EVENT_UPDATE_FAILED");
  return data;
}

export async function deleteEvent(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  eventId: string;
}) {
  const { userClient, userId, userEmail, eventId } = args;
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await userClient
    .from("campus_events")
    .select("id, created_by, host_organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (existingError) throw new ApiError(400, existingError.message, "EVENT_LOOKUP_FAILED");
  if (!existing) throw new ApiError(404, "Event not found.", "EVENT_NOT_FOUND");
  const adminAllowed = Boolean(userEmail && isAdminEmail(userEmail));
  let orgAdminAllowed = false;
  if (existing.host_organization_id && !adminAllowed && existing.created_by !== userId) {
    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("org_role, role, status")
      .eq("organization_id", existing.host_organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw new ApiError(400, membershipError.message, "ORG_MEMBERSHIP_CHECK_FAILED");
    const normalizedRole = membership ? ((membership as any).org_role ?? membership.role) : null;
    orgAdminAllowed = Boolean(
      membership &&
        (membership as any).status !== "denied" &&
        (normalizedRole === "owner" || normalizedRole === "admin" || normalizedRole === "manager"),
    );
  }
  if (existing.created_by !== userId && !adminAllowed && !orgAdminAllowed) {
    throw new ApiError(403, "You do not have permission to remove this event.", "EVENT_DELETE_FORBIDDEN");
  }
  const { error } = await (adminAllowed ? admin : userClient).from("campus_events").delete().eq("id", eventId);
  if (error) throw new ApiError(400, error.message, "EVENT_DELETE_FAILED");
  return { deleted: true };
}

export async function setEventRsvp(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  eventId: string;
  status: "going" | "interested" | "not_going";
}) {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, eventId, status } = args;
  await assertAccountCanSocialize(userClient, userId);
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
  const { data: event, error: eventError } = await userClient
    .from("campus_events")
    .select("id, title, school_domain, host_organization_id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw new ApiError(400, eventError.message, "EVENT_LOOKUP_FAILED");
  if (!event) throw new ApiError(404, "Event not found.", "EVENT_NOT_FOUND");
  if (event.school_domain !== school.schoolDomain) {
    throw new ApiError(403, "This event is outside your campus community.", "CAMPUS_SCOPE_RESTRICTED");
  }
  if (event.host_organization_id) {
    const { data: org, error: orgError } = await userClient
      .from("student_organizations")
      .select("id, is_frozen")
      .eq("id", event.host_organization_id)
      .maybeSingle();
    if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
    if (org && Boolean((org as any).is_frozen)) {
      throw new ApiError(403, "Organization activity is currently frozen.", "ORGANIZATION_FROZEN");
    }
  }

  const { data, error } = await userClient
    .from("event_rsvps")
    .upsert(
      {
        event_id: eventId,
        user_id: userId,
        status,
      },
      { onConflict: "event_id,user_id" },
    )
    .select("id, status, updated_at")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not save RSVP.", "EVENT_RSVP_FAILED");

  if (status === "going") {
    await createNotification({
      userId,
      type: "event_rsvp_reminder",
      title: "RSVP saved",
      body: `You're marked as going to ${event.title}.`,
      relatedEntityType: "event",
      relatedEntityId: eventId,
    });
  }

  return {
    id: data.id,
    status: data.status,
    updatedAt: data.updated_at,
  };
}

export async function listOrganizations(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  filters: { category?: string; schoolName?: string; query?: string };
}) {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, filters } = args;
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
  const query = userClient
    .from("student_organizations")
    .select(
      "id, name, description, category, logo_url, school_name, school_domain, contact_link, created_by, is_approved, created_at, require_join_approval, is_frozen",
    )
    .eq("is_approved", true)
    .eq("school_domain", school.schoolDomain)
    .order("created_at", { ascending: false });
  if (filters.category) query.eq("category", filters.category);
  if (filters.schoolName) query.ilike("school_name", `%${filters.schoolName}%`);
  if (filters.query) query.or(`name.ilike.%${filters.query}%,description.ilike.%${filters.query}%`);

  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message, "ORGANIZATIONS_FETCH_FAILED");
  const orgRows = data ?? [];
  const orgIds = orgRows.map((row: any) => row.id);

  const [{ data: members, error: membersError }, { data: events, error: eventsError }] = await Promise.all([
    orgIds.length > 0
      ? userClient
          .from("organization_members")
          .select("organization_id, user_id, status, membership_kind, org_role, role")
          .in("organization_id", orgIds)
      : Promise.resolve({ data: [] as any[], error: null as any }),
    orgIds.length > 0
      ? userClient
          .from("campus_events")
          .select("id, host_organization_id, title, starts_at, location_name")
          .in("host_organization_id", orgIds)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null as any }),
  ]);
  if (membersError) throw new ApiError(400, membersError.message, "ORGANIZATION_MEMBERS_FETCH_FAILED");
  if (eventsError) throw new ApiError(400, eventsError.message, "ORGANIZATION_EVENTS_FETCH_FAILED");

  const memberCounts = new Map<string, number>();
  const followerCounts = new Map<string, number>();
  const membershipMap = new Map<string, boolean>();
  const myRoleByOrg = new Map<string, string>();
  const myMembershipStatusByOrg = new Map<string, string>();
  for (const row of members ?? []) {
    const status = row.status ?? "approved";
    if (status === "approved") {
      if ((row.membership_kind ?? "member") === "follower") {
        followerCounts.set(row.organization_id, (followerCounts.get(row.organization_id) ?? 0) + 1);
      } else {
        memberCounts.set(row.organization_id, (memberCounts.get(row.organization_id) ?? 0) + 1);
      }
    }
    if (row.user_id === userId) {
      membershipMap.set(row.organization_id, status === "approved");
      myRoleByOrg.set(row.organization_id, row.org_role ?? row.role ?? "member");
      myMembershipStatusByOrg.set(row.organization_id, status);
    }
  }
  const eventsByOrg = new Map<string, any[]>();
  for (const row of events ?? []) {
    const list = eventsByOrg.get(row.host_organization_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      location: row.location_name,
    });
    eventsByOrg.set(row.host_organization_id, list);
  }

  return orgRows.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    logoUrl: row.logo_url,
    schoolName: row.school_name,
    contactLink: row.contact_link,
    createdBy: row.created_by,
    memberCount: memberCounts.get(row.id) ?? 0,
    followerCount: followerCounts.get(row.id) ?? 0,
    isFollowing: Boolean(membershipMap.get(row.id)),
    myRole: myRoleByOrg.get(row.id) ?? null,
    myMembershipStatus: myMembershipStatusByOrg.get(row.id) ?? null,
    requiresApproval: Boolean((row as any).require_join_approval),
    isFrozen: Boolean((row as any).is_frozen),
    upcomingEvents: eventsByOrg.get(row.id) ?? [],
  }));
}

export async function getOrganizationDetails(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  organizationId: string;
}) {
  const list = await listOrganizations({
    userClient: args.userClient,
    userId: args.userId,
    userEmail: args.userEmail,
    emailConfirmedAt: args.emailConfirmedAt,
    confirmedAt: args.confirmedAt,
    filters: {},
  });
  const found = list.find((org) => org.id === args.organizationId);
  if (!found) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");
  return found;
}

export async function createOrganization(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  input: {
    name: string;
    description: string;
    category: string;
    logoUrl?: string;
    schoolName?: string;
    contactLink?: string;
  };
}) {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, input } = args;
  await assertAccountCanSocialize(userClient, userId);
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_organizations")
    .insert({
      name: input.name,
      description: input.description,
      category: input.category,
      logo_url: input.logoUrl ?? null,
      school_name: school.schoolName,
      school_domain: school.schoolDomain ? school.schoolDomain.toLowerCase() : null,
      contact_link: input.contactLink ?? null,
      created_by: userId,
      is_approved: true,
    })
    .select("id, name")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not create organization.", "ORGANIZATION_CREATE_FAILED");

  const { error: memberError } = await admin.from("organization_members").upsert(
    {
      organization_id: data.id,
      user_id: userId,
      role: "manager",
      org_role: "owner",
      membership_kind: "member",
      status: "approved",
    },
    { onConflict: "organization_id,user_id" },
  );
  if (memberError) throw new ApiError(400, memberError.message, "ORGANIZATION_MEMBER_CREATE_FAILED");
  return data;
}

export async function updateOrganization(args: {
  userClient: SupabaseClientLike;
  userId: string;
  organizationId: string;
  userEmail?: string | null;
  input: {
    name?: string;
    description?: string;
    category?: string;
    logoUrl?: string | null;
    schoolName?: string;
    contactLink?: string | null;
    isApproved?: boolean;
  };
}) {
  const { userClient, userId, organizationId, userEmail, input } = args;
  const admin = createAdminClient();
  await assertAccountCanSocialize(userClient, userId);
  const { data: org, error: orgError } = await userClient
    .from("student_organizations")
    .select("id, created_by")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");

  const { data: membership, error: memberError } = await userClient
    .from("organization_members")
    .select("role, org_role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) throw new ApiError(400, memberError.message, "ORGANIZATION_MEMBERSHIP_LOOKUP_FAILED");

  const isAdmin = Boolean(userEmail && isAdminEmail(userEmail));
  const normalizedRole = membership ? ((membership as any).org_role ?? membership.role) : null;
  const canEdit =
    org.created_by === userId ||
    ((membership as any)?.status !== "denied" && (normalizedRole === "owner" || normalizedRole === "admin" || normalizedRole === "manager")) ||
    isAdmin;
  if (!canEdit) throw new ApiError(403, "You do not have permission to edit this organization.", "ORGANIZATION_EDIT_FORBIDDEN");

  const { data, error } = await admin
    .from("student_organizations")
    .update({
      name: input.name,
      description: input.description,
      category: input.category,
      logo_url: input.logoUrl,
      school_name: input.schoolName,
      contact_link: input.contactLink,
      is_approved: input.isApproved,
    })
    .eq("id", organizationId)
    .select("id")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not update organization.", "ORGANIZATION_UPDATE_FAILED");
  return data;
}

export async function deleteOrganization(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  organizationId: string;
}) {
  const { userClient, userId, userEmail, organizationId } = args;
  const admin = createAdminClient();
  const { data: org, error: orgError } = await userClient
    .from("student_organizations")
    .select("id, created_by")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");
  const isAdmin = Boolean(userEmail && isAdminEmail(userEmail));
  if (org.created_by !== userId && !isAdmin) {
    throw new ApiError(403, "You do not have permission to remove this organization.", "ORGANIZATION_DELETE_FORBIDDEN");
  }
  const { error } = await ((isAdmin ? admin : userClient)).from("student_organizations").delete().eq("id", organizationId);
  if (error) throw new ApiError(400, error.message, "ORGANIZATION_DELETE_FAILED");
  return { deleted: true };
}

export async function followOrganization(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  organizationId: string;
  role: "follower" | "member";
}) {
  const { userClient, userId, userEmail, emailConfirmedAt, confirmedAt, organizationId, role } = args;
  await assertAccountCanSocialize(userClient, userId);
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
  const { data: org, error: orgError } = await userClient
    .from("student_organizations")
    .select("id, school_domain")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");
  if (org.school_domain !== school.schoolDomain) {
    throw new ApiError(403, "This organization is outside your campus community.", "CAMPUS_SCOPE_RESTRICTED");
  }

  if (role === "follower") {
    return setOrganizationFollow({ userClient, organizationId, userId });
  }
  return requestOrganizationJoin({ userClient, organizationId, userId });
}
