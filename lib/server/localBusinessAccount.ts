import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/server/http";
import { fetchProfileRole, userHasPlatformAdminAccess } from "@/lib/server/permissions";
import { createAdminClient } from "@/lib/server/supabase";
import {
  STUDENT_PRIVACY_MESSAGE,
  canManagePartner,
  isLocalBusinessRole,
  studentFeedDenial,
  type BusinessGrant,
} from "@/lib/localBusiness/access";
import { findPartnerById } from "@/lib/partners/partnerDirectory";
import { businessPostFields, mergePartnerProfile, type PartnerProfileOverride } from "@/lib/localBusiness/profile";
import type { Partner, PartnerHours } from "@/lib/partners/types";
import type { User } from "@supabase/supabase-js";

export type BusinessMembership = {
  partnerId: string;
  approved: boolean;
  revoked: boolean;
};

export type LocalBusinessActor = {
  restricted: boolean;
  memberships: BusinessMembership[];
  canPost: boolean;
  mustResetPassword: boolean;
  revoked: boolean;
};

const OPEN_ACTOR: LocalBusinessActor = {
  restricted: false,
  memberships: [],
  canPost: false,
  mustResetPassword: false,
  revoked: false,
};

export function actorManagesPartner(actor: LocalBusinessActor, partnerId: string | null | undefined): boolean {
  if (!actor.restricted || actor.revoked || !partnerId) return false;
  const grants: BusinessGrant[] = actor.memberships.map((membership) => ({
    partnerId: membership.partnerId,
    approved: membership.approved,
    revoked: membership.revoked,
  }));
  return canManagePartner(grants, partnerId);
}

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || /does not exist/i.test(error.message ?? "");
}

export async function loadLocalBusinessActor(
  userClient: SupabaseClient,
  userId: string,
): Promise<LocalBusinessActor> {
  const role = await fetchProfileRole(userClient, userId);
  if (!isLocalBusinessRole(role)) return OPEN_ACTOR;
  const [{ data: account, error: accountError }, { data: membershipRows, error: membershipError }] = await Promise.all([
    userClient
      .from("local_business_accounts")
      .select("must_reset_password, revoked_at")
      .eq("user_id", userId)
      .maybeSingle(),
    userClient
      .from("local_business_memberships")
      .select("partner_id, approved, revoked_at")
      .eq("user_id", userId),
  ]);
  if (accountError || membershipError) {
    const error = accountError ?? membershipError;
    if (missingRelation(error)) {
      return { ...OPEN_ACTOR, restricted: true };
    }
    throw new ApiError(400, "Could not load the business account.", "LOCAL_BUSINESS_LOOKUP_FAILED");
  }
  const accountRow = account as { must_reset_password?: boolean; revoked_at?: string | null } | null;
  const revoked = Boolean(accountRow?.revoked_at);
  const memberships = ((membershipRows ?? []) as {
    partner_id?: string;
    approved?: boolean;
    revoked_at?: string | null;
  }[])
    .filter((row) => typeof row.partner_id === "string" && row.partner_id.length > 0)
    .map((row) => ({
      partnerId: row.partner_id as string,
      approved: row.approved === true,
      revoked: Boolean(row.revoked_at),
    }));
  return {
    restricted: true,
    memberships,
    canPost: !revoked && memberships.some((membership) => membership.approved && !membership.revoked),
    mustResetPassword: accountRow?.must_reset_password === true,
    revoked,
  };
}

export function assertBusinessCanReadFeed(actor: LocalBusinessActor, feed: string | null | undefined): void {
  const denial = studentFeedDenial(actor.restricted, feed);
  if (denial) throw new ApiError(403, denial, "STUDENT_FEED_PRIVATE");
}

export function assertBusinessCanReadAuthor(actor: LocalBusinessActor, authorId: string, viewerId: string): void {
  if (!actor.restricted) return;
  if (authorId !== viewerId) {
    throw new ApiError(403, STUDENT_PRIVACY_MESSAGE, "STUDENT_FEED_PRIVATE");
  }
}

export async function assertBusinessPostIsVisible(
  actor: LocalBusinessActor,
  post: { feed_destination?: string | null } | null,
): Promise<void> {
  if (!actor.restricted) return;
  if (!post || post.feed_destination !== "local_businesses") {
    throw new ApiError(403, STUDENT_PRIVACY_MESSAGE, "STUDENT_FEED_PRIVATE");
  }
}

type OverrideRow = {
  partner_id: string;
  username: string | null;
  description: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  hours: PartnerHours | null;
  logo_url: string | null;
  cover_image_url: string | null;
  photos: string[] | null;
};

function overrideFromRow(row: OverrideRow | null): PartnerProfileOverride | null {
  if (!row) return null;
  return {
    username: row.username,
    description: row.description,
    websiteUrl: row.website_url,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    hours: row.hours,
    logoUrl: row.logo_url,
    coverImageUrl: row.cover_image_url,
    photos: Array.isArray(row.photos) ? row.photos.filter((photo) => typeof photo === "string") : [],
  };
}

export async function loadPartnerOverride(partnerId: string): Promise<PartnerProfileOverride | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("partner_profile_overrides")
    .select("partner_id, username, description, website_url, contact_email, contact_phone, hours, logo_url, cover_image_url, photos")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (error) {
    if (missingRelation(error)) return null;
    throw new ApiError(400, "Could not load the business profile.", "BUSINESS_PROFILE_LOOKUP_FAILED");
  }
  return overrideFromRow(data as OverrideRow | null);
}

export async function loadMergedPartner(partnerId: string): Promise<{ partner: Partner; override: PartnerProfileOverride | null } | null> {
  const base = findPartnerById(partnerId);
  if (!base) return null;
  const override = await loadPartnerOverride(partnerId);
  return { partner: mergePartnerProfile(base, override), override };
}

export async function assertCanEditPartner(args: {
  userClient: SupabaseClient;
  user: User;
  partnerId: string;
}): Promise<void> {
  const role = await fetchProfileRole(args.userClient, args.user.id, { email: args.user.email });
  if (userHasPlatformAdminAccess(args.user, role)) return;
  const actor = await loadLocalBusinessActor(args.userClient, args.user.id);
  if (actorManagesPartner(actor, args.partnerId)) return;
  throw new ApiError(403, "Only an authorized manager can edit this business.", "BUSINESS_PROFILE_FORBIDDEN");
}

export async function attachBusinessPartnerIdentity<T extends { id: string }>(posts: T[]): Promise<T[]> {
  if (posts.length === 0) return posts;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quad_posts")
    .select("id, business_partner_id")
    .in("id", posts.map((post) => post.id));
  if (error || !data) return posts;
  const partnerByPost = new Map(
    (data as { id: string; business_partner_id?: string | null }[])
      .filter((row) => row.business_partner_id)
      .map((row) => [row.id, row.business_partner_id as string]),
  );
  if (partnerByPost.size === 0) return posts;
  const partnerIds = Array.from(new Set(partnerByPost.values()));
  const { data: overrides } = await admin
    .from("partner_profile_overrides")
    .select("partner_id, username, logo_url")
    .in("partner_id", partnerIds);
  const overrideByPartner = new Map(
    ((overrides ?? []) as { partner_id: string; username?: string | null; logo_url?: string | null }[]).map((row) => [
      row.partner_id,
      row,
    ]),
  );
  return posts.map((post) => {
    const partnerId = partnerByPost.get(post.id);
    const partner = partnerId ? findPartnerById(partnerId) : null;
    if (!partnerId || !partner) return post;
    const override = overrideByPartner.get(partnerId);
    return {
      ...post,
      business_partner_id: partnerId,
      ...businessPostFields(partner, { username: override?.username, logoUrl: override?.logo_url }),
    };
  });
}
