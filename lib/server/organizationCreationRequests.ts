import { assertAccountCanSocialize } from "@/lib/server/accountSafety";
import { ApiError } from "@/lib/server/http";
import { ORGANIZATION_REQUEST_CATEGORIES } from "@/lib/organizationRequestCategories";
import { createNotification } from "@/lib/server/notifications";
import { requireVerifiedSchoolForCoreAccess } from "@/lib/server/schoolVerification";
import { createAdminClient } from "@/lib/server/supabase";

type SupabaseClientLike = ReturnType<typeof createAdminClient>;

export type OrgCreationRequestStatus = "pending" | "approved" | "denied";

function mapRequestRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    requesterId: row.requester_id as string,
    schoolName: row.school_name as string,
    schoolDomain: row.school_domain as string,
    requestedName: row.requested_name as string,
    requestedCategory: row.requested_category as string,
    contactLink: (row.contact_link as string | null) ?? null,
    logoUrl: (row.logo_url as string | null) ?? null,
    description: row.description as string,
    status: row.status as OrgCreationRequestStatus,
    adminReason: (row.admin_reason as string | null) ?? null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    createdOrganizationId: (row.created_organization_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function submitOrganizationCreationRequest(args: {
  userClient: SupabaseClientLike;
  userId: string;
  userEmail?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  input: {
    requestedName: string;
    requestedCategory: string;
    description: string;
    contactLink?: string | null;
    logoUrl?: string | null;
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

  if (!school.schoolDomain || !school.schoolName) {
    throw new ApiError(403, "Complete campus verification before requesting an organization.", "SCHOOL_VERIFICATION_REQUIRED");
  }

  const requestedName = input.requestedName.trim();
  const requestedCategory = input.requestedCategory.trim();
  if (!ORGANIZATION_REQUEST_CATEGORIES.includes(requestedCategory as (typeof ORGANIZATION_REQUEST_CATEGORIES)[number])) {
    throw new ApiError(400, "Choose a category from the list.", "INVALID_ORG_CATEGORY");
  }

  const description = input.description.trim();
  if (description.length < 1 || description.length > 2000) {
    throw new ApiError(400, "Description must be 1–2000 characters.", "INVALID_DESCRIPTION");
  }

  const { data, error } = await userClient
    .from("organization_creation_requests")
    .insert({
      requester_id: userId,
      school_name: school.schoolName.trim(),
      school_domain: school.schoolDomain.trim().toLowerCase(),
      requested_name: requestedName,
      requested_category: requestedCategory,
      contact_link: input.contactLink?.trim() ? input.contactLink.trim().slice(0, 2048) : null,
      logo_url: input.logoUrl?.trim() ? input.logoUrl.trim().slice(0, 2048) : null,
      description,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, "You already have a pending request with this organization name.", "ORG_REQUEST_DUPLICATE_PENDING");
    }
    throw new ApiError(400, error.message, "ORG_REQUEST_CREATE_FAILED");
  }

  await createNotification({
    userId,
    type: "organization_request_submitted",
    title: "Organization request received",
    body: `We'll review "${requestedName}" before it appears on CampusQuest.`,
    relatedEntityType: "organization_creation_request",
    relatedEntityId: data.id,
  });

  return { id: data.id };
}

export async function listMyOrganizationCreationRequests(args: {
  userClient: SupabaseClientLike;
  userId: string;
}) {
  const { data, error } = await args.userClient
    .from("organization_creation_requests")
    .select(
      "id, requester_id, school_name, school_domain, requested_name, requested_category, contact_link, logo_url, description, status, admin_reason, reviewed_by, reviewed_at, created_organization_id, created_at, updated_at",
    )
    .eq("requester_id", args.userId)
    .order("created_at", { ascending: false });

  if (error) throw new ApiError(400, error.message, "ORG_REQUESTS_LIST_FAILED");
  return (data ?? []).map((row: Record<string, unknown>) => mapRequestRow(row));
}

export async function listOrganizationCreationRequestsAdmin() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("organization_creation_requests")
    .select(
      "id, requester_id, school_name, school_domain, requested_name, requested_category, contact_link, logo_url, description, status, admin_reason, reviewed_by, reviewed_at, created_organization_id, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw new ApiError(400, error.message, "ADMIN_ORG_REQUESTS_LIST_FAILED");

  const list = rows ?? [];
  const requesterIds = Array.from(new Set(list.map((r: { requester_id: string }) => r.requester_id)));
  const profileById = new Map<string, { username: string | null; display_name: string | null }>();
  if (requesterIds.length > 0) {
    const { data: profs, error: pErr } = await admin.from("profiles").select("id, username, display_name").in("id", requesterIds);
    if (pErr) throw new ApiError(400, pErr.message, "ADMIN_ORG_REQUESTS_PROFILES_FAILED");
    for (const p of profs ?? []) {
      profileById.set(p.id as string, { username: (p as any).username ?? null, display_name: (p as any).display_name ?? null });
    }
  }

  return list.map((row: Record<string, unknown>) => {
    const prof = profileById.get(row.requester_id as string);
    return {
      ...mapRequestRow(row),
      requesterUsername: prof?.username ?? null,
      requesterDisplayName: prof?.display_name ?? null,
    };
  });
}

export async function approveOrganizationCreationRequestAdmin(args: { requestId: string; reviewerUserId: string }) {
  const admin = createAdminClient();
  const { data: orgId, error } = await admin.rpc("approve_organization_creation_request", {
    p_request_id: args.requestId,
    p_reviewer_id: args.reviewerUserId,
  });

  if (error) {
    const msg = error.message ?? "Could not approve request.";
    if (msg.includes("ORG_REQUEST_NOT_FOUND")) {
      throw new ApiError(404, "Request not found.", "ORG_REQUEST_NOT_FOUND");
    }
    if (msg.includes("ORG_REQUEST_NOT_PENDING")) {
      throw new ApiError(409, "This request has already been processed.", "ORG_REQUEST_NOT_PENDING");
    }
    throw new ApiError(400, msg, "ORG_REQUEST_APPROVE_FAILED");
  }

  const id = typeof orgId === "string" ? orgId : Array.isArray(orgId) ? orgId[0] : String(orgId ?? "");
  if (!id) throw new ApiError(500, "Approve did not return organization id.", "ORG_REQUEST_APPROVE_INCOMPLETE");

  const { data: reqRow } = await admin.from("organization_creation_requests").select("requester_id, requested_name").eq("id", args.requestId).maybeSingle();
  const requesterId = reqRow?.requester_id as string | undefined;
  if (requesterId) {
    await createNotification({
      userId: requesterId,
      type: "organization_request_approved",
      title: "Organization approved",
      body: "Your organization request was approved. Your organization has been created.",
      relatedEntityType: "student_organization",
      relatedEntityId: id,
    });
  }

  return { organizationId: id };
}

export async function denyOrganizationCreationRequestAdmin(args: {
  requestId: string;
  reviewerUserId: string;
  reason?: string | null;
}) {
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("organization_creation_requests")
    .select("id, status, requester_id, requested_name")
    .eq("id", args.requestId)
    .maybeSingle();

  if (fetchError) throw new ApiError(400, fetchError.message, "ORG_REQUEST_FETCH_FAILED");
  if (!existing) throw new ApiError(404, "Request not found.", "ORG_REQUEST_NOT_FOUND");
  if (existing.status !== "pending") {
    throw new ApiError(409, "This request has already been processed.", "ORG_REQUEST_NOT_PENDING");
  }

  const adminReason = args.reason?.trim() ? args.reason.trim().slice(0, 1000) : null;

  const { error: updateError } = await admin
    .from("organization_creation_requests")
    .update({
      status: "denied",
      reviewed_by: args.reviewerUserId,
      reviewed_at: new Date().toISOString(),
      admin_reason: adminReason,
    })
    .eq("id", args.requestId)
    .eq("status", "pending");

  if (updateError) throw new ApiError(400, updateError.message, "ORG_REQUEST_DENY_FAILED");

  let body = "Not approved — review the feedback and submit again if appropriate.";
  if (adminReason) {
    body = `${body}\n\n${adminReason}`;
  }
  await createNotification({
    userId: existing.requester_id as string,
    type: "organization_request_denied",
    title: "Organization request declined",
    body,
    relatedEntityType: "organization_creation_request",
    relatedEntityId: args.requestId,
  });

  return { ok: true };
}
