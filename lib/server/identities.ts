import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";
import {
  canSwitchToIdentity,
  isVerificationIdentityType,
  isVerificationStatus,
  personalIdentityRef,
} from "@/lib/identity/policy";
import type {
  ActiveCampusIdentity,
  CampusIdentity,
  IdentityManagerRole,
  VerificationApplicantSnapshot,
  VerificationRequestSummary,
} from "@/lib/identity/types";

type UserClient = ReturnType<typeof createAdminClient>;

type ProfileLite = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
};

function mapRequestSummary(row: Record<string, unknown>): VerificationRequestSummary {
  const rawType = String(row.identity_type);
  const identityType = isVerificationIdentityType(rawType) ? rawType : "student_business";
  const rawStatus = String(row.status);
  const status = isVerificationStatus(rawStatus) ? rawStatus : "pending_review";
  return {
    id: String(row.id),
    identityType,
    name: String(row.name ?? ""),
    category: String(row.category ?? ""),
    status,
    createdAt: String(row.created_at),
    submittedAt: (row.submitted_at as string | null) ?? (row.created_at as string | null),
    requestedIdentityId: (row.requested_identity_id as string | null) ?? null,
  };
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function orgManagerRole(row: { org_role?: string | null; role?: string | null }): IdentityManagerRole | null {
  const orgRole = row.org_role ?? "";
  if (orgRole === "owner" || orgRole === "admin") return orgRole;
  if (orgRole === "manager") return "manager";
  const legacy = row.role ?? "";
  if (legacy === "owner" || legacy === "admin" || legacy === "manager") return legacy;
  return null;
}

export async function listCampusIdentities(args: {
  userClient: UserClient;
  userId: string;
  email?: string | null;
}): Promise<{
  identities: CampusIdentity[];
  active: ActiveCampusIdentity;
  pendingRequests: VerificationRequestSummary[];
  applicant: VerificationApplicantSnapshot;
}> {
  const { userClient, userId } = args;
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("id, display_name, username, avatar_url, bio, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    throw new ApiError(404, "Profile not found.", "PROFILE_NOT_FOUND");
  }
  const personal: CampusIdentity = {
    id: userId,
    type: "personal",
    displayName: (profile.display_name as string | null)?.trim() || "Student",
    username: ((profile.username as string | null) ?? "student").trim().toLowerCase(),
    avatarUrl: (profile.avatar_url as string | null) ?? null,
    bio: (profile.bio as string | null) ?? "",
    verified: false,
    verificationLabel: null,
    managerRole: "self",
    createdAt: String(profile.created_at ?? new Date().toISOString()),
  };

  const identities: CampusIdentity[] = [personal];

  const { data: businessRows } = await userClient
    .from("student_business_members")
    .select(
      "role, business:student_businesses(id, name, handle, logo_url, bio, verification_status, status, created_at)",
    )
    .eq("user_id", userId);

  for (const row of businessRows ?? []) {
    const business = firstRelated(
      (row as { business?: Record<string, unknown> | Record<string, unknown>[] | null }).business,
    );
    if (!business) continue;
    if (business.status !== "active") continue;
    if (business.verification_status !== "verified") continue;
    const role = (row as { role?: string }).role === "admin" ? "admin" : "owner";
    identities.push({
      id: String(business.id),
      type: "student_business",
      displayName: String(business.name ?? "Student Business"),
      username: String(business.handle ?? "business"),
      avatarUrl: (business.logo_url as string | null) ?? null,
      bio: String(business.bio ?? ""),
      verified: true,
      verificationLabel: "Verified Student Business",
      managerRole: role,
      createdAt: String(business.created_at ?? new Date().toISOString()),
    });
  }

  const { data: orgRows } = await userClient
    .from("organization_members")
    .select(
      "org_role, role, status, organization:student_organizations(id, name, description, logo_url, is_approved, created_at)",
    )
    .eq("user_id", userId);

  for (const row of orgRows ?? []) {
    const member = row as {
      org_role?: string | null;
      role?: string | null;
      status?: string | null;
      organization?: Record<string, unknown> | Record<string, unknown>[] | null;
    };
    if (member.status && member.status !== "approved") continue;
    const role = orgManagerRole(member);
    if (!role) continue;
    const org = firstRelated(member.organization);
    if (!org || org.is_approved !== true) continue;
    identities.push({
      id: String(org.id),
      type: "organization",
      displayName: String(org.name ?? "Organization"),
      username: String(org.name ?? "org")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 24) || "org",
      avatarUrl: (org.logo_url as string | null) ?? null,
      bio: String(org.description ?? ""),
      verified: true,
      verificationLabel: "Verified Organization",
      managerRole: role,
      createdAt: String(org.created_at ?? new Date().toISOString()),
    });
  }

  const { data: requestRows } = await userClient
    .from("verification_requests")
    .select(
      "id, identity_type, name, category, status, created_at, submitted_at, requested_identity_id",
    )
    .eq("applicant_user_id", userId)
    .order("created_at", { ascending: false });

  const pendingRequests = (requestRows ?? [])
    .map((row) => mapRequestSummary(row as Record<string, unknown>))
    .filter((row) => row.status !== "approved");

  const { data: activeRow } = await userClient
    .from("user_active_identities")
    .select("identity_type, identity_id")
    .eq("user_id", userId)
    .maybeSingle();

  let active = personalIdentityRef(userId);
  if (activeRow?.identity_type && activeRow.identity_id) {
    const candidate = {
      type: activeRow.identity_type as ActiveCampusIdentity["type"],
      id: String(activeRow.identity_id),
    };
    if (canSwitchToIdentity({ identities, target: candidate })) {
      active = candidate;
    } else {
      await userClient.from("user_active_identities").upsert({
        user_id: userId,
        identity_type: "personal",
        identity_id: userId,
      });
    }
  }

  return {
    identities,
    active,
    pendingRequests,
    applicant: {
      userId,
      displayName: personal.displayName,
      username: personal.username,
      email: args.email ?? null,
    },
  };
}

export async function switchActiveIdentity(args: {
  userClient: UserClient;
  userId: string;
  email?: string | null;
  target: ActiveCampusIdentity;
}): Promise<{ identities: CampusIdentity[]; active: ActiveCampusIdentity }> {
  const listed = await listCampusIdentities(args);
  if (!canSwitchToIdentity({ identities: listed.identities, target: args.target })) {
    throw new ApiError(403, "You cannot switch to that profile.", "IDENTITY_FORBIDDEN");
  }
  const { error } = await args.userClient.from("user_active_identities").upsert({
    user_id: args.userId,
    identity_type: args.target.type,
    identity_id: args.target.id,
  });
  if (error) throw new ApiError(400, "Could not switch profile.", "IDENTITY_SWITCH_FAILED");
  return { identities: listed.identities, active: args.target };
}

export async function resolvePostingIdentity(args: {
  userClient: UserClient;
  userId: string;
  requestedType?: string | null;
  requestedId?: string | null;
}): Promise<ActiveCampusIdentity> {
  const listed = await listCampusIdentities({ userClient: args.userClient, userId: args.userId });
  if (!args.requestedType || args.requestedType === "personal") {
    return personalIdentityRef(args.userId);
  }
  const target = {
    type: args.requestedType,
    id: args.requestedId || "",
  } as ActiveCampusIdentity;
  if (!canSwitchToIdentity({ identities: listed.identities, target })) {
    throw new ApiError(403, "You cannot post as that profile.", "IDENTITY_FORBIDDEN");
  }
  return target;
}

export function overlayPostedAsOnPost<T extends Record<string, unknown>>(
  post: T,
  identities: { businesses: Map<string, { name: string; handle: string; logoUrl: string | null }>; orgs: Map<string, { name: string; logoUrl: string | null }> },
): T {
  const type = String(post.posted_as_type ?? "personal");
  const id = typeof post.posted_as_id === "string" ? post.posted_as_id : null;
  if (type === "student_business" && id) {
    const business = identities.businesses.get(id);
    if (business) {
      return {
        ...post,
        posted_as_display_name: business.name,
        posted_as_username: business.handle,
        posted_as_avatar_url: business.logoUrl,
        posted_as_verified: true,
      };
    }
  }
  if (type === "organization" && id) {
    const org = identities.orgs.get(id);
    if (org) {
      return {
        ...post,
        posted_as_display_name: org.name,
        posted_as_username: org.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24),
        posted_as_avatar_url: org.logoUrl,
        posted_as_verified: true,
      };
    }
  }
  return post;
}

export async function loadPostedAsLookups(ids: { businessIds: string[]; orgIds: string[] }) {
  const admin = createAdminClient();
  const businesses = new Map<string, { name: string; handle: string; logoUrl: string | null }>();
  const orgs = new Map<string, { name: string; logoUrl: string | null }>();
  if (ids.businessIds.length > 0) {
    const { data } = await admin
      .from("student_businesses")
      .select("id, name, handle, logo_url")
      .in("id", ids.businessIds);
    for (const row of data ?? []) {
      businesses.set(String(row.id), {
        name: String(row.name ?? ""),
        handle: String(row.handle ?? ""),
        logoUrl: (row.logo_url as string | null) ?? null,
      });
    }
  }
  if (ids.orgIds.length > 0) {
    const { data } = await admin.from("student_organizations").select("id, name, logo_url").in("id", ids.orgIds);
    for (const row of data ?? []) {
      orgs.set(String(row.id), {
        name: String(row.name ?? ""),
        logoUrl: (row.logo_url as string | null) ?? null,
      });
    }
  }
  return { businesses, orgs };
}

export function collectPostedAsIds(posts: Array<Record<string, unknown>>): {
  businessIds: string[];
  orgIds: string[];
} {
  const businessIds = new Set<string>();
  const orgIds = new Set<string>();
  for (const post of posts) {
    const type = String(post.posted_as_type ?? "personal");
    const id = typeof post.posted_as_id === "string" ? post.posted_as_id : null;
    if (!id) continue;
    if (type === "student_business") businessIds.add(id);
    if (type === "organization") orgIds.add(id);
  }
  return { businessIds: Array.from(businessIds), orgIds: Array.from(orgIds) };
}

export async function enrichPostsWithPostedAs<T extends Record<string, unknown>>(posts: T[]): Promise<T[]> {
  const ids = collectPostedAsIds(posts);
  if (ids.businessIds.length === 0 && ids.orgIds.length === 0) return posts;
  const lookups = await loadPostedAsLookups(ids);
  return posts.map((post) => overlayPostedAsOnPost(post, lookups));
}

export type { ProfileLite };
