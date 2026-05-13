import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError } from "@/lib/server/http";
import { createNotificationsBulk } from "@/lib/server/notifications";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;
type OrganizationRole = "owner" | "admin" | "member";

function normalizeRole(value: string | null | undefined): OrganizationRole {
  if (value === "owner" || value === "admin" || value === "member") return value;
  if (value === "manager") return "admin";
  return "member";
}

async function getMembershipRow(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
}) {
  const { userClient, organizationId, userId } = args;
  const { data, error } = await userClient
    .from("organization_members")
    .select("id, org_role, role, membership_kind, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "ORGANIZATION_MEMBERSHIP_LOOKUP_FAILED");
  if (!data) return null;
  return {
    id: data.id as string,
    orgRole: normalizeRole((data as any).org_role ?? (data as any).role),
    membershipKind: ((data as any).membership_kind as "member" | "follower" | null) ?? "member",
    status: ((data as any).status as "pending" | "approved" | "denied" | null) ?? "approved",
  };
}

export async function assertOrganizationAdmin(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
}) {
  const membership = await getMembershipRow(args);
  if (!membership || membership.status !== "approved" || (membership.orgRole !== "owner" && membership.orgRole !== "admin")) {
    throw new ApiError(403, "Organization admin access required.", "ORGANIZATION_ADMIN_REQUIRED");
  }
  return membership;
}

export async function assertOrganizationOwner(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
}) {
  const membership = await getMembershipRow(args);
  if (!membership || membership.status !== "approved" || membership.orgRole !== "owner") {
    throw new ApiError(403, "Organization owner access required.", "ORGANIZATION_OWNER_REQUIRED");
  }
  return membership;
}

export async function listOrganizationAdminDashboard(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
}) {
  const { userClient, organizationId, userId } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationAdmin({ userClient, organizationId, userId });

  const [{ data: org, error: orgError }, { data: members, error: membersError }, { data: requests, error: requestsError }] =
    await Promise.all([
      userClient
        .from("student_organizations")
        .select("id, name, description, category, logo_url, school_name, contact_link, require_join_approval, is_frozen, frozen_reason, is_removed_by_moderation")
        .eq("id", organizationId)
        .maybeSingle(),
      userClient
        .from("organization_members")
        .select("id, user_id, org_role, role, membership_kind, status, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      userClient
        .from("organization_join_requests")
        .select("id, requester_id, status, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");
  if (membersError) throw new ApiError(400, membersError.message, "ORGANIZATION_MEMBERS_FETCH_FAILED");
  if (requestsError) throw new ApiError(400, requestsError.message, "ORGANIZATION_REQUESTS_FETCH_FAILED");

  const memberRows = members ?? [];
  const requestRows = requests ?? [];
  const involvedUserIds = Array.from(
    new Set([
      ...memberRows.map((row: any) => row.user_id as string),
      ...requestRows.map((row: any) => row.requester_id as string),
    ]),
  );

  const { data: profiles, error: profilesError } = involvedUserIds.length
    ? await userClient
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", involvedUserIds)
    : { data: [], error: null as any };
  if (profilesError) throw new ApiError(400, profilesError.message, "ORGANIZATION_MEMBER_PROFILES_FAILED");
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));

  const { data: events, error: eventsError } = await userClient
    .from("campus_events")
    .select("id, title, starts_at, is_cancelled")
    .eq("host_organization_id", organizationId)
    .order("starts_at", { ascending: true });
  if (eventsError) throw new ApiError(400, eventsError.message, "ORGANIZATION_EVENTS_FETCH_FAILED");
  const eventRows = events ?? [];
  const eventIds = eventRows.map((row: any) => row.id);
  const { data: rsvps, error: rsvpsError } = eventIds.length
    ? await userClient
        .from("event_rsvps")
        .select("event_id, status")
        .in("event_id", eventIds)
    : { data: [], error: null as any };
  if (rsvpsError) throw new ApiError(400, rsvpsError.message, "ORGANIZATION_EVENT_RSVPS_FAILED");
  const attendanceByEvent = new Map<string, number>();
  for (const row of rsvps ?? []) {
    if (row.status === "going") {
      attendanceByEvent.set(row.event_id, (attendanceByEvent.get(row.event_id) ?? 0) + 1);
    }
  }

  const { data: announcements, error: announcementsError } = await userClient
    .from("organization_announcements")
    .select("id, title, message, created_by, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (announcementsError) throw new ApiError(400, announcementsError.message, "ORGANIZATION_ANNOUNCEMENTS_FETCH_FAILED");

  const approvedMembers = memberRows.filter((row: any) => (row.status ?? "approved") === "approved");
  const memberCount = approvedMembers.filter((row: any) => ((row.membership_kind ?? "member") === "member")).length;
  const followerCount = approvedMembers.filter((row: any) => ((row.membership_kind ?? "member") === "follower")).length;
  const eventAttendance = Array.from(attendanceByEvent.values()).reduce((sum, count) => sum + count, 0);
  const engagementActivity = eventAttendance + (announcements?.length ?? 0);

  const myMembership = await getMembershipRow({ userClient, organizationId, userId });

  return {
    organization: {
      id: org.id,
      name: org.name,
      description: org.description,
      category: org.category,
      logoUrl: org.logo_url,
      schoolName: org.school_name,
      contactLink: org.contact_link,
      requireJoinApproval: Boolean((org as any).require_join_approval),
      isFrozen: Boolean((org as any).is_frozen),
      frozenReason: (org as any).frozen_reason ?? null,
      isRemovedByModeration: Boolean((org as any).is_removed_by_moderation),
    },
    myRole: myMembership?.orgRole ?? "member",
    members: memberRows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      role: normalizeRole(row.org_role ?? row.role),
      membershipKind: row.membership_kind ?? "member",
      status: row.status ?? "approved",
      createdAt: row.created_at,
      profile: profileMap.get(row.user_id) ?? null,
    })),
    joinRequests: requestRows
      .filter((row: any) => row.status === "pending")
      .map((row: any) => ({
        id: row.id,
        requesterId: row.requester_id,
        status: row.status,
        createdAt: row.created_at,
        profile: profileMap.get(row.requester_id) ?? null,
      })),
    events: eventRows.map((row: any) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      isCancelled: Boolean(row.is_cancelled),
      attendance: attendanceByEvent.get(row.id) ?? 0,
    })),
    announcements: (announcements ?? []).map((row: any) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      createdBy: row.created_by,
      createdAt: row.created_at,
    })),
    analytics: {
      followerCount,
      memberCount,
      eventAttendance,
      engagementActivity,
    },
  };
}

export async function requestOrganizationJoin(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
}) {
  const { userClient, organizationId, userId } = args;
  await assertAccountCanSocialize(userClient, userId);
  const { data: org, error: orgError } = await userClient
    .from("student_organizations")
    .select("id, require_join_approval, is_frozen")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");
  if (Boolean((org as any).is_frozen)) {
    throw new ApiError(403, "Organization activity is currently frozen.", "ORGANIZATION_FROZEN");
  }

  if ((org as any).require_join_approval) {
    const { data, error } = await userClient
      .from("organization_join_requests")
      .upsert(
        {
          organization_id: organizationId,
          requester_id: userId,
          status: "pending",
          reviewed_by: null,
          review_note: null,
        },
        { onConflict: "organization_id,requester_id" },
      )
      .select("id, status")
      .single();
    if (error || !data) throw new ApiError(400, error?.message ?? "Could not create join request.", "ORGANIZATION_JOIN_REQUEST_FAILED");
    return { id: data.id, status: data.status, pendingApproval: true };
  }

  const { data, error } = await userClient
    .from("organization_members")
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        org_role: "member",
        membership_kind: "member",
        status: "approved",
      },
      { onConflict: "organization_id,user_id" },
    )
    .select("id, status")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not join organization.", "ORGANIZATION_JOIN_FAILED");
  return { id: data.id, status: data.status, pendingApproval: false };
}

export async function setOrganizationFollow(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
}) {
  const { userClient, organizationId, userId } = args;
  await assertAccountCanSocialize(userClient, userId);
  const { data: org, error: orgError } = await userClient
    .from("student_organizations")
    .select("id, is_frozen")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");
  if (Boolean((org as any).is_frozen)) {
    throw new ApiError(403, "Organization activity is currently frozen.", "ORGANIZATION_FROZEN");
  }
  const { data, error } = await userClient
    .from("organization_members")
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        org_role: "member",
        membership_kind: "follower",
        status: "approved",
      },
      { onConflict: "organization_id,user_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not follow organization.", "ORGANIZATION_FOLLOW_FAILED");
  return { id: data.id, role: "follower" as const };
}

export async function removeOrganizationFollowerMembership(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
}) {
  const { userClient, organizationId, userId } = args;
  await assertAccountCanSocialize(userClient, userId);
  const { data: row, error } = await userClient
    .from("organization_members")
    .select("id, membership_kind, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "ORGANIZATION_MEMBERSHIP_LOOKUP_FAILED");
  if (!row) throw new ApiError(404, "You are not following this organization.", "ORGANIZATION_NOT_FOLLOWING");
  const status = row.status ?? "approved";
  if (status !== "approved") {
    throw new ApiError(400, "Organization membership is not active.", "ORGANIZATION_MEMBERSHIP_INACTIVE");
  }
  if ((row.membership_kind ?? "member") !== "follower") {
    throw new ApiError(
      400,
      "You are a member of this organization. Leave from your member tools if available.",
      "ORGANIZATION_UNFOLLOW_NOT_FOLLOWER",
    );
  }
  const { error: deleteError } = await userClient
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (deleteError) throw new ApiError(400, deleteError.message, "ORGANIZATION_UNFOLLOW_FAILED");
  return { unfollowed: true as const };
}

export async function reviewJoinRequest(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
  requestId: string;
  action: "approve" | "deny";
}) {
  const { userClient, organizationId, userId, requestId, action } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationAdmin({ userClient, organizationId, userId });
  const { data: request, error: requestError } = await userClient
    .from("organization_join_requests")
    .select("id, requester_id, status")
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (requestError) throw new ApiError(400, requestError.message, "ORGANIZATION_JOIN_REQUEST_LOOKUP_FAILED");
  if (!request) throw new ApiError(404, "Join request not found.", "ORGANIZATION_JOIN_REQUEST_NOT_FOUND");

  const nextStatus = action === "approve" ? "approved" : "denied";
  const { error: updateError } = await userClient
    .from("organization_join_requests")
    .update({
      status: nextStatus,
      reviewed_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id);
  if (updateError) throw new ApiError(400, updateError.message, "ORGANIZATION_JOIN_REQUEST_UPDATE_FAILED");

  if (action === "approve") {
    const admin = createAdminClient();
    const { error: membershipError } = await admin.from("organization_members").upsert(
      {
        organization_id: organizationId,
        user_id: request.requester_id,
        org_role: "member",
        membership_kind: "member",
        status: "approved",
      },
      { onConflict: "organization_id,user_id" },
    );
    if (membershipError) throw new ApiError(400, membershipError.message, "ORGANIZATION_JOIN_MEMBER_UPSERT_FAILED");
  }

  return { id: request.id, status: nextStatus };
}

export async function updateMemberRole(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
  memberUserId: string;
  role: OrganizationRole;
}) {
  const { userClient, organizationId, userId, memberUserId, role } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationOwner({ userClient, organizationId, userId });
  const { data, error } = await userClient
    .from("organization_members")
    .update({ org_role: role, membership_kind: "member", status: "approved" })
    .eq("organization_id", organizationId)
    .eq("user_id", memberUserId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "ORGANIZATION_MEMBER_ROLE_UPDATE_FAILED");
  if (!data) throw new ApiError(404, "Member not found.", "ORGANIZATION_MEMBER_NOT_FOUND");
  return { id: data.id, role };
}

export async function removeOrganizationMember(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
  memberUserId: string;
}) {
  const { userClient, organizationId, userId, memberUserId } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationAdmin({ userClient, organizationId, userId });
  if (memberUserId === userId) throw new ApiError(400, "Use transfer ownership before removing yourself.", "VALIDATION_ERROR");
  const { error } = await userClient
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", memberUserId);
  if (error) throw new ApiError(400, error.message, "ORGANIZATION_MEMBER_REMOVE_FAILED");
  return { removed: true };
}

export async function createOrganizationAnnouncement(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
  title: string;
  message: string;
}) {
  const { userClient, organizationId, userId, title, message } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationAdmin({ userClient, organizationId, userId });

  const { data: created, error } = await userClient
    .from("organization_announcements")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      title: title.trim().slice(0, 180),
      message: message.trim().slice(0, 2000),
    })
    .select("id, title, message, created_at")
    .single();
  if (error || !created) {
    throw new ApiError(400, error?.message ?? "Could not create announcement.", "ORGANIZATION_ANNOUNCEMENT_CREATE_FAILED");
  }

  const { data: orgMembers, error: memberError } = await userClient
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "approved");
  if (!memberError) {
    await createNotificationsBulk({
      userIds: (orgMembers ?? []).map((row) => row.user_id).filter((id) => id !== userId),
      type: "organization_event_announcement",
      title: title.trim().slice(0, 120),
      body: message.trim().slice(0, 200),
      relatedEntityType: "organization_announcement",
      relatedEntityId: created.id,
    });
  }

  return {
    id: created.id,
    title: created.title,
    message: created.message,
    createdAt: created.created_at,
  };
}

export async function updateOrganizationSettings(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  userId: string;
  input: {
    name?: string;
    description?: string;
    category?: string;
    logoUrl?: string | null;
    contactLink?: string | null;
    requireJoinApproval?: boolean;
  };
}) {
  const { userClient, organizationId, userId, input } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationAdmin({ userClient, organizationId, userId });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_organizations")
    .update({
      name: input.name,
      description: input.description,
      category: input.category,
      logo_url: input.logoUrl,
      contact_link: input.contactLink,
      require_join_approval: input.requireJoinApproval,
    })
    .eq("id", organizationId)
    .select("id")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not update organization.", "ORGANIZATION_SETTINGS_UPDATE_FAILED");
  return { id: data.id };
}

export async function listOrganizationEventAttendees(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  eventId: string;
  userId: string;
}) {
  const { userClient, organizationId, eventId, userId } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationAdmin({ userClient, organizationId, userId });
  const { data: event, error: eventError } = await userClient
    .from("campus_events")
    .select("id")
    .eq("id", eventId)
    .eq("host_organization_id", organizationId)
    .maybeSingle();
  if (eventError) throw new ApiError(400, eventError.message, "EVENT_LOOKUP_FAILED");
  if (!event) throw new ApiError(404, "Event not found for organization.", "EVENT_NOT_FOUND");

  const { data: rsvps, error: rsvpError } = await userClient
    .from("event_rsvps")
    .select("user_id, status, updated_at")
    .eq("event_id", eventId)
    .order("updated_at", { ascending: false });
  if (rsvpError) throw new ApiError(400, rsvpError.message, "EVENT_ATTENDEES_FETCH_FAILED");
  const userIds = Array.from(new Set((rsvps ?? []).map((row) => row.user_id)));
  const { data: profiles, error: profileError } = userIds.length
    ? await userClient.from("profiles").select("id, username, display_name").in("id", userIds)
    : { data: [], error: null as any };
  if (profileError) throw new ApiError(400, profileError.message, "EVENT_ATTENDEES_PROFILE_FETCH_FAILED");
  const profileMap = new Map((profiles ?? []).map((row: any) => [row.id, row]));

  return (rsvps ?? []).map((row) => ({
    userId: row.user_id,
    status: row.status,
    updatedAt: row.updated_at,
    profile: profileMap.get(row.user_id) ?? null,
  }));
}

export async function createOrganizationEventManaged(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
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
  };
}) {
  const { userClient, organizationId, userId, userEmail, emailConfirmedAt, confirmedAt, input } = args;
  await assertAccountCanSocialize(userClient, userId);
  await assertOrganizationAdmin({ userClient, organizationId, userId });
  const school = await requireVerifiedSchoolForCoreAccess({
    userClient,
    user: {
      id: userId,
      email: userEmail ?? null,
      email_confirmed_at: emailConfirmedAt ?? null,
      confirmed_at: confirmedAt ?? null,
    },
  });
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
      host_organization_id: organizationId,
      created_by: userId,
      school_name: school.schoolName,
      school_domain: school.schoolDomain,
    })
    .select("id, title, starts_at")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not create event.", "ORGANIZATION_EVENT_CREATE_FAILED");
  return { id: data.id, title: data.title, startsAt: data.starts_at };
}

export async function updateOrganizationEventManaged(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  eventId: string;
  userId: string;
  input: {
    title?: string;
    description?: string;
    category?: string;
    locationName?: string;
    startsAt?: string;
    endsAt?: string | null;
    isPaid?: boolean;
    ticketLink?: string | null;
    isCancelled?: boolean;
  };
}) {
  const { userClient, organizationId, eventId, userId, input } = args;
  await assertOrganizationAdmin({ userClient, organizationId, userId });
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await userClient
    .from("campus_events")
    .select("id")
    .eq("id", eventId)
    .eq("host_organization_id", organizationId)
    .maybeSingle();
  if (existingError) throw new ApiError(400, existingError.message, "ORGANIZATION_EVENT_LOOKUP_FAILED");
  if (!existing) throw new ApiError(404, "Event not found.", "EVENT_NOT_FOUND");
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
      is_cancelled: input.isCancelled,
    })
    .eq("id", eventId)
    .eq("host_organization_id", organizationId)
    .select("id")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not update event.", "ORGANIZATION_EVENT_UPDATE_FAILED");
  return { id: data.id };
}

export async function deleteOrganizationEventManaged(args: {
  userClient: SupabaseClientLike;
  organizationId: string;
  eventId: string;
  userId: string;
}) {
  const { userClient, organizationId, eventId, userId } = args;
  await assertOrganizationAdmin({ userClient, organizationId, userId });
  const admin = createAdminClient();
  const { error } = await admin
    .from("campus_events")
    .delete()
    .eq("id", eventId)
    .eq("host_organization_id", organizationId);
  if (error) throw new ApiError(400, error.message, "ORGANIZATION_EVENT_DELETE_FAILED");
  return { deleted: true };
}

export async function setOrganizationFreeze(args: {
  organizationId: string;
  frozen: boolean;
  reason?: string;
  adminUserId?: string | null;
}) {
  const { organizationId, frozen, reason, adminUserId } = args;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_organizations")
    .update({
      is_frozen: frozen,
      frozen_reason: frozen ? reason?.trim().slice(0, 500) ?? null : null,
      frozen_by: frozen ? adminUserId ?? null : null,
      frozen_at: frozen ? new Date().toISOString() : null,
    })
    .eq("id", organizationId)
    .select("id, is_frozen")
    .single();
  if (error || !data) throw new ApiError(400, error?.message ?? "Could not update freeze status.", "ORGANIZATION_FREEZE_FAILED");
  return { id: data.id, isFrozen: data.is_frozen };
}

export async function transferOrganizationOwnership(args: {
  organizationId: string;
  newOwnerUserId: string;
}) {
  const { organizationId, newOwnerUserId } = args;
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: org, error: orgError } = await admin
    .from("student_organizations")
    .select("id, created_by")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new ApiError(400, orgError.message, "ORGANIZATION_LOOKUP_FAILED");
  if (!org) throw new ApiError(404, "Organization not found.", "ORGANIZATION_NOT_FOUND");

  const { error: promoteError } = await admin.from("organization_members").upsert(
    {
      organization_id: organizationId,
      user_id: newOwnerUserId,
      org_role: "owner",
      membership_kind: "member",
      status: "approved",
      updated_at: nowIso,
    },
    { onConflict: "organization_id,user_id" },
  );
  if (promoteError) throw new ApiError(400, promoteError.message, "ORGANIZATION_OWNER_TRANSFER_FAILED");

  if (org.created_by && org.created_by !== newOwnerUserId) {
    await admin
      .from("organization_members")
      .update({ org_role: "admin", membership_kind: "member", status: "approved", updated_at: nowIso })
      .eq("organization_id", organizationId)
      .eq("user_id", org.created_by);
  }

  const { error: updateOrgError } = await admin
    .from("student_organizations")
    .update({ created_by: newOwnerUserId })
    .eq("id", organizationId);
  if (updateOrgError) throw new ApiError(400, updateOrgError.message, "ORGANIZATION_OWNER_TRANSFER_FAILED");

  return { organizationId, newOwnerUserId };
}
