import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { createNotification } from "@/lib/server/notifications";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import { logAdminAuditAction } from "@/lib/server/audit";
import { notifyVerificationAdmins } from "@/lib/server/verificationMail";
import { ORGANIZATION_REQUEST_CATEGORIES } from "@/lib/organizationRequestCategories";
import {
  approvalAction,
  isBusinessVerificationCategory,
  marketplaceCategoryForBusinessVerification,
  normalizeInstagramInput,
  normalizeOptionalHttpUrl,
  offeringForBusinessVerification,
  rankOrganizationClaimMatches,
  slugifyBusinessHandle,
  verificationDecisionCopy,
  verificationSubmittedCopy,
} from "@/lib/identity/policy";
import type {
  OrganizationClaimMatch,
  VerificationIdentityType,
  VerificationRequestDetail,
  VerificationRequestSummary,
  VerificationStatus,
} from "@/lib/identity/types";
import { isVerificationIdentityType, isVerificationStatus } from "@/lib/identity/policy";

type UserClient = ReturnType<typeof createAdminClient>;

function mapSummary(row: Record<string, unknown>): VerificationRequestSummary {
  return {
    id: String(row.id),
    identityType: isVerificationIdentityType(String(row.identity_type))
      ? (row.identity_type as VerificationIdentityType)
      : "student_business",
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    status: isVerificationStatus(String(row.status)) ? (row.status as VerificationStatus) : "pending_review",
    createdAt: String(row.created_at),
    submittedAt: (row.submitted_at as string | null) ?? (row.created_at as string | null),
    requestedIdentityId: (row.requested_identity_id as string | null) ?? null,
  };
}

function mapDetail(
  row: Record<string, unknown>,
  applicant: VerificationRequestDetail["applicant"],
): VerificationRequestDetail {
  return {
    ...mapSummary(row),
    description: String(row.description ?? ""),
    websiteUrl: (row.website_url as string | null) ?? null,
    socialUrl: (row.social_url as string | null) ?? null,
    organizationEmail: (row.organization_email as string | null) ?? null,
    urinvolvedUrl: (row.urinvolved_url as string | null) ?? null,
    applicantRole: (row.applicant_role as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    reasonForAccess: (row.reason_for_access as string | null) ?? null,
    applicantConfirmation: row.applicant_confirmation === true,
    adminInternalNotes: (row.admin_internal_notes as string | null) ?? null,
    applicantStatusMessage: (row.applicant_status_message as string | null) ?? null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    updatedAt: String(row.updated_at ?? row.created_at),
    applicant,
  };
}

const REQUEST_SELECT =
  "id, applicant_user_id, identity_type, requested_identity_id, name, category, description, website_url, social_url, organization_email, urinvolved_url, applicant_role, logo_url, image_url, reason_for_access, applicant_confirmation, status, admin_internal_notes, applicant_status_message, reviewed_by, reviewed_at, submitted_at, created_at, updated_at";

export async function searchOrganizationsForClaim(args: {
  userClient: UserClient;
  query: string;
}): Promise<OrganizationClaimMatch[]> {
  const needle = args.query.trim();
  const { data, error } = await args.userClient
    .from("student_organizations")
    .select("id, name, category, logo_url, description, source")
    .eq("is_approved", true)
    .ilike("name", `%${needle}%`)
    .limit(12);
  if (error) {
    const fallback = await args.userClient
      .from("student_organizations")
      .select("id, name, category, logo_url, description")
      .eq("is_approved", true)
      .ilike("name", `%${needle}%`)
      .limit(12);
    if (fallback.error) throw new ApiError(400, "Could not search organizations.", "ORG_SEARCH_FAILED");
    return rankOrganizationClaimMatches({
      requestedName: needle,
      organizations: (fallback.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        category: String(row.category ?? ""),
        logoUrl: (row.logo_url as string | null) ?? null,
        description: String(row.description ?? ""),
        source: null,
      })),
    });
  }
  return rankOrganizationClaimMatches({
    requestedName: needle,
    organizations: (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      category: String(row.category ?? ""),
      logoUrl: (row.logo_url as string | null) ?? null,
      description: String(row.description ?? ""),
      source: typeof (row as { source?: string }).source === "string" ? (row as { source?: string }).source ?? null : null,
    })),
  });
}

export async function listMyVerificationRequests(args: {
  userClient: UserClient;
  userId: string;
}): Promise<VerificationRequestSummary[]> {
  const { data, error } = await args.userClient
    .from("verification_requests")
    .select(REQUEST_SELECT)
    .eq("applicant_user_id", args.userId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(400, "Could not load verification requests.", "VERIFICATION_LIST_FAILED");
  return (data ?? []).map((row) => mapSummary(row as Record<string, unknown>));
}

export async function submitVerificationRequest(args: {
  userClient: UserClient;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  displayName?: string | null;
  input: {
    identityType: VerificationIdentityType;
    name: string;
    category: string;
    description: string;
    websiteUrl?: string | null;
    socialUrl?: string | null;
    organizationEmail?: string | null;
    urinvolvedUrl?: string | null;
    applicantRole?: string | null;
    logoUrl?: string | null;
    imageUrl?: string | null;
    reasonForAccess?: string | null;
    requestedIdentityId?: string | null;
    applicantConfirmation: true;
  };
}): Promise<{ request: VerificationRequestSummary; emailQueued: boolean }> {
  await assertAccountCanSocialize(args.userClient, args.userId);
  await requireVerifiedSchoolForCoreAccess({
    userClient: args.userClient,
    user: {
      id: args.userId,
      email: args.userEmail ?? null,
      email_confirmed_at: args.emailConfirmedAt ?? null,
      confirmed_at: args.confirmedAt ?? null,
    },
  });

  if (args.input.identityType === "student_business" && !isBusinessVerificationCategory(args.input.category)) {
    throw new ApiError(400, "Choose a business category.", "INVALID_BUSINESS_CATEGORY");
  }
  if (
    args.input.identityType === "organization" &&
    !(ORGANIZATION_REQUEST_CATEGORIES as readonly string[]).includes(args.input.category)
  ) {
    throw new ApiError(400, "Choose an organization category.", "INVALID_ORG_CATEGORY");
  }

  if (args.input.requestedIdentityId && args.input.identityType === "organization") {
    const matches = await searchOrganizationsForClaim({
      userClient: args.userClient,
      query: args.input.name,
    });
    if (!matches.some((row) => row.id === args.input.requestedIdentityId)) {
      throw new ApiError(400, "That organization match is no longer available.", "ORG_CLAIM_MISMATCH");
    }
  }

  const insert = {
    applicant_user_id: args.userId,
    identity_type: args.input.identityType,
    requested_identity_id: args.input.requestedIdentityId ?? null,
    name: args.input.name.trim(),
    category: args.input.category.trim(),
    description: args.input.description.trim(),
    website_url: normalizeOptionalHttpUrl(args.input.websiteUrl),
    social_url:
      args.input.identityType === "student_business"
        ? normalizeInstagramInput(args.input.socialUrl)
        : normalizeOptionalHttpUrl(args.input.socialUrl),
    organization_email: args.input.organizationEmail?.trim() || null,
    urinvolved_url: normalizeOptionalHttpUrl(args.input.urinvolvedUrl),
    applicant_role: args.input.applicantRole?.trim() || null,
    logo_url: args.input.logoUrl?.trim() || null,
    image_url: args.input.imageUrl?.trim() || null,
    reason_for_access: args.input.reasonForAccess?.trim() || null,
    applicant_confirmation: true,
    status: "pending_review",
    submitted_at: new Date().toISOString(),
  };

  const { data, error } = await args.userClient.from("verification_requests").insert(insert).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") {
      throw new ApiError(409, "You already have an open request for this name.", "VERIFICATION_DUPLICATE");
    }
    throw new ApiError(400, "Could not submit this request.", "VERIFICATION_SUBMIT_FAILED");
  }

  const notice = verificationSubmittedCopy(args.input.identityType);
  await createNotification({
    userId: args.userId,
    type: "verification_request_submitted",
    title: notice.title,
    body: notice.body,
    relatedEntityType: "verification_request",
    relatedEntityId: data.id,
  });

  const submittedAt = insert.submitted_at;
  const { data: profile } = await args.userClient
    .from("profiles")
    .select("display_name")
    .eq("id", args.userId)
    .maybeSingle();
  const applicantName =
    (typeof profile?.display_name === "string" && profile.display_name.trim()) ||
    args.displayName?.trim() ||
    "CampusQuest student";

  const emailResult = await notifyVerificationAdmins({
    requestId: data.id,
    applicantName,
    applicantEmail: args.userEmail ?? "unknown",
    identityType: args.input.identityType,
    requestedName: insert.name,
    submittedAt,
    description: insert.description,
  });

  return {
    request: {
      id: data.id,
      identityType: args.input.identityType,
      name: insert.name,
      category: insert.category,
      status: "pending_review",
      createdAt: submittedAt,
      submittedAt,
      requestedIdentityId: insert.requested_identity_id,
    },
    emailQueued: emailResult.sent,
  };
}

export async function countPendingVerificationRequests(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("verification_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");
  if (error) throw new ApiError(400, "Could not count verification requests.", "VERIFICATION_COUNT_FAILED");
  return count ?? 0;
}

export async function listVerificationRequestsAdmin(status?: VerificationStatus) {
  const admin = createAdminClient();
  let query = admin.from("verification_requests").select(REQUEST_SELECT).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new ApiError(400, "Could not load verification requests.", "ADMIN_VERIFICATION_LIST_FAILED");
  const rows = data ?? [];
  const applicantIds = Array.from(new Set(rows.map((row: { applicant_user_id: string }) => row.applicant_user_id)));
  const profileById = new Map<string, { display_name: string | null; username: string | null }>();
  if (applicantIds.length > 0) {
    const { data: profiles } = await admin.from("profiles").select("id, display_name, username").in("id", applicantIds);
    for (const profile of profiles ?? []) {
      profileById.set(String(profile.id), {
        display_name: (profile.display_name as string | null) ?? null,
        username: (profile.username as string | null) ?? null,
      });
    }
  }
  return rows.map((row: Record<string, unknown>) => {
    const profile = profileById.get(String(row.applicant_user_id));
    return mapDetail(row, {
      userId: String(row.applicant_user_id),
      displayName: profile?.display_name ?? null,
      username: profile?.username ?? null,
      email: null,
    });
  });
}

export async function getVerificationRequestAdmin(requestId: string): Promise<VerificationRequestDetail> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("verification_requests").select(REQUEST_SELECT).eq("id", requestId).maybeSingle();
  if (error || !data) throw new ApiError(404, "Request not found.", "VERIFICATION_NOT_FOUND");
  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, username")
    .eq("id", data.applicant_user_id)
    .maybeSingle();
  let email: string | null = null;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(String(data.applicant_user_id));
    email = authUser.user?.email ?? null;
  } catch {
    email = null;
  }
  return mapDetail(data as Record<string, unknown>, {
    userId: String(data.applicant_user_id),
    displayName: (profile?.display_name as string | null) ?? null,
    username: (profile?.username as string | null) ?? null,
    email,
  });
}

async function uniqueBusinessHandle(admin: UserClient, name: string): Promise<string> {
  const base = slugifyBusinessHandle(name);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const handle = attempt === 0 ? base : `${base.slice(0, 20)}${attempt}`.replace(/[^a-z0-9_]/g, "").slice(0, 24);
    const { data } = await admin.from("student_businesses").select("id").eq("handle", handle).maybeSingle();
    if (!data) return handle.length >= 3 ? handle : `biz${crypto.randomUUID().slice(0, 8)}`;
  }
  return `biz_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function activateStudentBusinessIdentity(args: {
  admin: UserClient;
  request: Record<string, unknown>;
}): Promise<string> {
  const existingId = typeof args.request.requested_identity_id === "string" ? args.request.requested_identity_id : null;
  if (existingId) {
    await args.admin
      .from("student_businesses")
      .update({
        verification_status: "verified",
        verified_at: new Date().toISOString(),
        status: "active",
        name: String(args.request.name),
        bio: String(args.request.description ?? "").slice(0, 400),
        logo_url: (args.request.logo_url as string | null) ?? (args.request.image_url as string | null),
        instagram_url: (args.request.social_url as string | null) ?? null,
        website_url: (args.request.website_url as string | null) ?? null,
      })
      .eq("id", existingId);
    await ensureBusinessOwner(args.admin, existingId, String(args.request.applicant_user_id));
    return existingId;
  }

  const category = isBusinessVerificationCategory(String(args.request.category))
    ? marketplaceCategoryForBusinessVerification(args.request.category as never)
    : "other";
  const offering = isBusinessVerificationCategory(String(args.request.category))
    ? offeringForBusinessVerification(args.request.category as never)
    : "both";
  const handle = await uniqueBusinessHandle(args.admin, String(args.request.name));
  const { data, error } = await args.admin
    .from("student_businesses")
    .insert({
      owner_id: args.request.applicant_user_id,
      name: String(args.request.name).trim(),
      handle,
      category,
      offering,
      bio: String(args.request.description ?? "").slice(0, 400),
      logo_url: (args.request.logo_url as string | null) ?? (args.request.image_url as string | null),
      instagram_url: (args.request.social_url as string | null) ?? null,
      website_url: (args.request.website_url as string | null) ?? null,
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) throw new ApiError(400, "Could not create the business identity.", "BUSINESS_IDENTITY_CREATE_FAILED");
  await ensureBusinessOwner(args.admin, data.id, String(args.request.applicant_user_id));
  return data.id;
}

async function ensureBusinessOwner(admin: UserClient, businessId: string, userId: string) {
  const { data } = await admin
    .from("student_business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return;
  const { error } = await admin.from("student_business_members").insert({
    business_id: businessId,
    user_id: userId,
    role: "owner",
  });
  if (error && error.code !== "23505") {
    throw new ApiError(400, "Could not assign business ownership.", "BUSINESS_MEMBER_FAILED");
  }
}

async function activateOrganizationIdentity(args: {
  admin: UserClient;
  request: Record<string, unknown>;
}): Promise<string> {
  const claimId = typeof args.request.requested_identity_id === "string" ? args.request.requested_identity_id : null;
  if (claimId) {
    const { data: existing } = await args.admin.from("student_organizations").select("id, name").eq("id", claimId).maybeSingle();
    if (!existing) throw new ApiError(404, "That organization no longer exists.", "ORG_NOT_FOUND");
    await ensureOrganizationManager(args.admin, claimId, String(args.request.applicant_user_id), "admin");
    return claimId;
  }

  const { data: nameMatch } = await args.admin
    .from("student_organizations")
    .select("id, name")
    .ilike("name", String(args.request.name).trim())
    .eq("is_approved", true)
    .limit(5);
  const ranked = rankOrganizationClaimMatches({
    requestedName: String(args.request.name),
    organizations: (nameMatch ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      category: "",
      logoUrl: null,
      description: "",
      source: null,
    })),
    limit: 1,
  });
  if (ranked[0] && ranked[0].name.trim().toLowerCase() === String(args.request.name).trim().toLowerCase()) {
    await ensureOrganizationManager(args.admin, ranked[0].id, String(args.request.applicant_user_id), "admin");
    return ranked[0].id;
  }

  const { data: created, error } = await args.admin
    .from("student_organizations")
    .insert({
      name: String(args.request.name).trim(),
      description: String(args.request.description ?? ""),
      category: String(args.request.category ?? "other"),
      logo_url: (args.request.logo_url as string | null) ?? (args.request.image_url as string | null),
      school_name: "University of Rhode Island",
      school_domain: "uri.edu",
      contact_link: (args.request.website_url as string | null) ?? (args.request.urinvolved_url as string | null),
      created_by: args.request.applicant_user_id,
      is_approved: true,
    })
    .select("id")
    .single();
  if (error || !created) throw new ApiError(400, "Could not create the organization identity.", "ORG_IDENTITY_CREATE_FAILED");
  await ensureOrganizationManager(args.admin, created.id, String(args.request.applicant_user_id), "owner");
  return created.id;
}

async function ensureOrganizationManager(
  admin: UserClient,
  organizationId: string,
  userId: string,
  role: "owner" | "admin",
) {
  const { data } = await admin
    .from("organization_members")
    .select("id, org_role, role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) {
    await admin
      .from("organization_members")
      .update({
        org_role: role,
        role: role === "owner" ? "manager" : "manager",
        membership_kind: "member",
        status: "approved",
      })
      .eq("id", data.id);
    return;
  }
  const { error } = await admin.from("organization_members").insert({
    organization_id: organizationId,
    user_id: userId,
    role: "manager",
    org_role: role,
    membership_kind: "member",
    status: "approved",
  });
  if (error && error.code !== "23505") {
    throw new ApiError(400, "Could not assign organization management.", "ORG_MEMBER_FAILED");
  }
}

export async function reviewVerificationRequestAdmin(args: {
  requestId: string;
  reviewerUserId: string;
  reviewerEmail?: string | null;
  action: "approve" | "reject" | "needs_info";
  adminInternalNotes?: string | null;
  applicantStatusMessage?: string | null;
}): Promise<{ request: VerificationRequestDetail; identityId: string | null; alreadyApproved: boolean }> {
  const admin = createAdminClient();
  const { data: existing, error } = await admin
    .from("verification_requests")
    .select(REQUEST_SELECT)
    .eq("id", args.requestId)
    .maybeSingle();
  if (error || !existing) throw new ApiError(404, "Request not found.", "VERIFICATION_NOT_FOUND");

  const currentStatus = isVerificationStatus(String(existing.status)) ? existing.status : "pending_review";
  if (args.action === "approve") {
    const mode = approvalAction({
      currentStatus,
      existingIdentityId: (existing.requested_identity_id as string | null) ?? null,
    });
    if (mode === "already_approved") {
      return {
        request: await getVerificationRequestAdmin(args.requestId),
        identityId: existing.requested_identity_id as string,
        alreadyApproved: true,
      };
    }

    if (currentStatus !== "pending_review" && currentStatus !== "needs_info") {
      throw new ApiError(409, "This request has already been processed.", "VERIFICATION_NOT_REVIEWABLE");
    }

    const { data: claimed, error: claimError } = await admin
      .from("verification_requests")
      .update({
        status: "approved",
        reviewed_by: args.reviewerUserId,
        reviewed_at: new Date().toISOString(),
        admin_internal_notes: args.adminInternalNotes?.trim() || existing.admin_internal_notes,
        applicant_status_message: args.applicantStatusMessage?.trim() || null,
      })
      .eq("id", args.requestId)
      .in("status", ["pending_review", "needs_info"])
      .select("id")
      .maybeSingle();
    if (claimError) throw new ApiError(400, "Could not approve this request.", "VERIFICATION_APPROVE_FAILED");
    if (!claimed) {
      const latest = await getVerificationRequestAdmin(args.requestId);
      return { request: latest, identityId: latest.requestedIdentityId, alreadyApproved: latest.status === "approved" };
    }

    try {
      const identityId =
        existing.identity_type === "student_business"
          ? await activateStudentBusinessIdentity({ admin, request: existing as Record<string, unknown> })
          : await activateOrganizationIdentity({ admin, request: existing as Record<string, unknown> });
      await admin.from("verification_requests").update({ requested_identity_id: identityId }).eq("id", args.requestId);
      await admin.from("verification_request_events").insert({
        request_id: args.requestId,
        actor_user_id: args.reviewerUserId,
        previous_status: currentStatus,
        new_status: "approved",
        internal_notes: args.adminInternalNotes?.trim() || null,
        applicant_message: args.applicantStatusMessage?.trim() || null,
      });
      await logAdminAuditAction({
        actionType: "verification_request_approved",
        targetUserId: String(existing.applicant_user_id),
        adminUserId: args.reviewerUserId,
        adminEmail: args.reviewerEmail ?? null,
        reason: args.adminInternalNotes ?? null,
        metadata: {
          requestId: args.requestId,
          identityType: existing.identity_type,
          previousStatus: currentStatus,
          newStatus: "approved",
          identityId,
        },
      });
      const copy = verificationDecisionCopy({
        identityType: existing.identity_type as VerificationIdentityType,
        status: "approved",
        name: String(existing.name),
      });
      await createNotification({
        userId: String(existing.applicant_user_id),
        type: "verification_request_approved",
        title: copy.title,
        body: copy.body,
        relatedEntityType: "verification_request",
        relatedEntityId: args.requestId,
      });
      return {
        request: await getVerificationRequestAdmin(args.requestId),
        identityId,
        alreadyApproved: false,
      };
    } catch (error) {
      await admin
        .from("verification_requests")
        .update({
          status: currentStatus,
          reviewed_by: null,
          reviewed_at: null,
        })
        .eq("id", args.requestId)
        .eq("status", "approved");
      throw error;
    }
  }

  if (currentStatus !== "pending_review" && currentStatus !== "needs_info") {
    throw new ApiError(409, "This request has already been processed.", "VERIFICATION_NOT_REVIEWABLE");
  }

  const nextStatus = args.action === "needs_info" ? "needs_info" : "rejected";
  if (nextStatus === "needs_info" && !args.applicantStatusMessage?.trim()) {
    throw new ApiError(400, "Explain what information is missing.", "VERIFICATION_INFO_REQUIRED");
  }

  const { error: updateError } = await admin
    .from("verification_requests")
    .update({
      status: nextStatus,
      reviewed_by: args.reviewerUserId,
      reviewed_at: new Date().toISOString(),
      admin_internal_notes: args.adminInternalNotes?.trim() || existing.admin_internal_notes,
      applicant_status_message: args.applicantStatusMessage?.trim() || null,
    })
    .eq("id", args.requestId)
    .in("status", ["pending_review", "needs_info"]);
  if (updateError) throw new ApiError(400, "Could not update this request.", "VERIFICATION_REVIEW_FAILED");

  await admin.from("verification_request_events").insert({
    request_id: args.requestId,
    actor_user_id: args.reviewerUserId,
    previous_status: currentStatus,
    new_status: nextStatus,
    internal_notes: args.adminInternalNotes?.trim() || null,
    applicant_message: args.applicantStatusMessage?.trim() || null,
  });
  await logAdminAuditAction({
    actionType: nextStatus === "needs_info" ? "verification_request_needs_info" : "verification_request_rejected",
    targetUserId: String(existing.applicant_user_id),
    adminUserId: args.reviewerUserId,
    adminEmail: args.reviewerEmail ?? null,
    reason: args.adminInternalNotes ?? args.applicantStatusMessage ?? null,
    metadata: {
      requestId: args.requestId,
      previousStatus: currentStatus,
      newStatus: nextStatus,
    },
  });
  const copy = verificationDecisionCopy({
    identityType: existing.identity_type as VerificationIdentityType,
    status: nextStatus,
    name: String(existing.name),
  });
  await createNotification({
    userId: String(existing.applicant_user_id),
    type: nextStatus === "needs_info" ? "verification_request_needs_info" : "verification_request_rejected",
    title: copy.title,
    body: args.applicantStatusMessage?.trim() || copy.body,
    relatedEntityType: "verification_request",
    relatedEntityId: args.requestId,
  });

  return {
    request: await getVerificationRequestAdmin(args.requestId),
    identityId: (existing.requested_identity_id as string | null) ?? null,
    alreadyApproved: false,
  };
}
