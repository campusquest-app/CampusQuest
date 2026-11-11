import { findPartnerById } from "@/lib/partners/partnerDirectory";
import type { Partner } from "@/lib/partners/types";

export const LOCAL_BUSINESS_ROLE = "local_business" as const;

export const DAISY_PARTNER_ID = "daisys-chicken-ice-cream";
export const DAISY_PREFERRED_USERNAME = "daisyschicken";
export const SANDBAR_PARTNER_ID = "the-sandbar-cafe";
export const SANDBAR_PREFERRED_USERNAME = "sandbarcafe";

export type BusinessGrant = {
  partnerId: string;
  approved: boolean;
  revoked?: boolean;
};

/** Active management comes from an approved membership, never from a name or email. */
export function canManagePartner(grants: BusinessGrant[], partnerId: string | null | undefined): boolean {
  if (!partnerId) return false;
  return grants.some((grant) => grant.partnerId === partnerId && grant.approved && grant.revoked !== true);
}

/**
 * Requested id wins when it is still assigned. Otherwise the last selection wins
 * only if that assignment is still active. Otherwise the first active business.
 */
export function resolveActivePartnerId(
  grants: BusinessGrant[],
  requestedId: string | null | undefined,
  rememberedId: string | null | undefined,
): string | null {
  if (canManagePartner(grants, requestedId)) return requestedId ?? null;
  if (canManagePartner(grants, rememberedId)) return rememberedId ?? null;
  return grants.find((grant) => grant.approved && grant.revoked !== true)?.partnerId ?? null;
}

export function postsForPartner<T extends { businessPartnerId?: string | null }>(
  posts: T[],
  partnerId: string,
): T[] {
  return posts.filter((post) => post.businessPartnerId === partnerId);
}

export function activeBusinessStorageKey(userId: string): string {
  return `cq_active_business_partner:${userId}`;
}

export const STUDENT_PRIVACY_TITLE = "Student Privacy";
export const STUDENT_PRIVACY_MESSAGE =
  "To protect student privacy, local business accounts can only access the Local Businesses feed. Student-only feeds are reserved for verified campus members.";
export const STUDENT_PRIVACY_ACTION = "Go to Local Businesses";

export const LOCAL_BUSINESS_POST_DESTINATION_COPY = "Your post will appear in the Local Businesses feed.";

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function isLocalBusinessRole(role: string | null | undefined): boolean {
  return role === LOCAL_BUSINESS_ROLE;
}

/** Quad tabs a local business account is allowed to load. The Market and every student feed stay closed. */
export function businessCanOpenFeed(feedTab: string | null | undefined): boolean {
  return feedTab === "local_businesses";
}

export function studentFeedDenial(actorIsLocalBusiness: boolean, feed: string | null | undefined): string | null {
  if (!actorIsLocalBusiness) return null;
  if (businessCanOpenFeed(feed)) return null;
  return STUDENT_PRIVACY_MESSAGE;
}

export type LocalBusinessProvisionInput = {
  email: string;
  partnerId: string;
  username: string;
};

export function normalizeBusinessUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function localBusinessAssignmentError(input: { partnerId: string; username: string }): string | null {
  const username = normalizeBusinessUsername(input.username);
  if (!USERNAME_PATTERN.test(username)) {
    return "Usernames use 3 to 24 letters, numbers, or underscores.";
  }
  if (!findPartnerById(input.partnerId)) return "That business listing does not exist.";
  return null;
}

export function localBusinessAssignmentsError(
  assignments: { partnerId: string; username: string }[],
): string | null {
  if (assignments.length === 0) return "Assign at least one business.";
  const partners = new Set<string>();
  const names = new Set<string>();
  for (const assignment of assignments) {
    const error = localBusinessAssignmentError(assignment);
    if (error) return error;
    if (partners.has(assignment.partnerId)) return "Each business can only be assigned once.";
    partners.add(assignment.partnerId);
    const username = normalizeBusinessUsername(assignment.username);
    if (names.has(username)) return "Each business needs its own username.";
    names.add(username);
  }
  return null;
}

export function localBusinessProvisionError(input: LocalBusinessProvisionInput): string | null {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return localBusinessAssignmentError(input);
}

/**
 * Profile fields for a provisioned business. Campus email verification stays unset
 * so the account is never treated as a verified URI student.
 */
export function buildLocalBusinessProfilePatch(partner: Partner, username: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    username: normalizeBusinessUsername(username),
    display_name: partner.name.slice(0, 40),
    avatar_url: partner.logoUrl,
    bio: partner.description ?? "",
    role: LOCAL_BUSINESS_ROLE,
    campus_email_verified_at: null,
    onboarding_completed: true,
    onboarding_completed_at: now,
    onboarding_character_completed: true,
    display_name_changed_at: now,
  };
}
