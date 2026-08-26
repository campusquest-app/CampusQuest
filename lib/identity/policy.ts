import type { MarketplaceCategory, MarketplaceListingKind } from "@/lib/marketplace/policy";
import type { FieldNote } from "@/lib/types";
import type { MarketplaceListing } from "@/lib/marketplace/types";
import {
  BUSINESS_VERIFICATION_CATEGORY_IDS,
  CAMPUS_IDENTITY_TYPES,
  VERIFICATION_IDENTITY_TYPES,
  VERIFICATION_STATUSES,
  type ActiveCampusIdentity,
  type BusinessVerificationCategoryId,
  type CampusIdentity,
  type CampusIdentityType,
  type OrganizationClaimMatch,
  type VerificationIdentityType,
  type VerificationStatus,
} from "@/lib/identity/types";

export const BUSINESS_VERIFICATION_CATEGORIES: Array<{
  id: BusinessVerificationCategoryId;
  label: string;
  marketplaceCategory: MarketplaceCategory;
  offering: "products" | "services" | "both";
}> = [
  { id: "clothing_fashion", label: "Clothing & Fashion", marketplaceCategory: "clothing", offering: "products" },
  { id: "food", label: "Food", marketplaceCategory: "other", offering: "products" },
  { id: "art_creative", label: "Art & Creative", marketplaceCategory: "other", offering: "products" },
  { id: "photography", label: "Photography", marketplaceCategory: "services", offering: "services" },
  { id: "beauty", label: "Beauty", marketplaceCategory: "services", offering: "services" },
  { id: "tutoring", label: "Tutoring", marketplaceCategory: "services", offering: "services" },
  { id: "technology", label: "Technology", marketplaceCategory: "electronics", offering: "both" },
  { id: "services", label: "Services", marketplaceCategory: "services", offering: "services" },
  { id: "media", label: "Media", marketplaceCategory: "other", offering: "both" },
  { id: "other", label: "Other", marketplaceCategory: "other", offering: "both" },
];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  needs_info: "Needs Information",
  approved: "Approved",
  rejected: "Rejected",
};

export const IDENTITY_TYPE_LABELS: Record<CampusIdentityType, string> = {
  personal: "Personal Account",
  student_business: "Student Business",
  organization: "Campus Organization",
};

const STUDENT_WRITABLE_VERIFICATION_STATUSES: VerificationStatus[] = ["draft", "pending_review", "needs_info"];

export function isCampusIdentityType(value: string | null | undefined): value is CampusIdentityType {
  return Boolean(value && (CAMPUS_IDENTITY_TYPES as readonly string[]).includes(value));
}

export function isVerificationIdentityType(value: string | null | undefined): value is VerificationIdentityType {
  return Boolean(value && (VERIFICATION_IDENTITY_TYPES as readonly string[]).includes(value));
}

export function isVerificationStatus(value: string | null | undefined): value is VerificationStatus {
  return Boolean(value && (VERIFICATION_STATUSES as readonly string[]).includes(value));
}

export function isBusinessVerificationCategory(
  value: string | null | undefined,
): value is BusinessVerificationCategoryId {
  return Boolean(value && (BUSINESS_VERIFICATION_CATEGORY_IDS as readonly string[]).includes(value));
}

export function businessVerificationCategoryLabel(id: string): string {
  return BUSINESS_VERIFICATION_CATEGORIES.find((row) => row.id === id)?.label ?? id;
}

export function marketplaceCategoryForBusinessVerification(
  id: BusinessVerificationCategoryId,
): MarketplaceCategory {
  return BUSINESS_VERIFICATION_CATEGORIES.find((row) => row.id === id)?.marketplaceCategory ?? "other";
}

export function offeringForBusinessVerification(
  id: BusinessVerificationCategoryId,
): "products" | "services" | "both" {
  return BUSINESS_VERIFICATION_CATEGORIES.find((row) => row.id === id)?.offering ?? "both";
}

export function personalIdentityRef(userId: string): ActiveCampusIdentity {
  return { type: "personal", id: userId };
}

export function identitiesEqual(a: ActiveCampusIdentity | null | undefined, b: ActiveCampusIdentity | null | undefined) {
  if (!a || !b) return false;
  return a.type === b.type && a.id === b.id;
}

export function findIdentity(
  identities: CampusIdentity[],
  active: ActiveCampusIdentity | null | undefined,
): CampusIdentity | null {
  if (!active) return identities.find((row) => row.type === "personal") ?? null;
  return identities.find((row) => row.type === active.type && row.id === active.id) ?? null;
}

export function canSwitchToIdentity(args: {
  identities: CampusIdentity[];
  target: ActiveCampusIdentity;
}): boolean {
  if (args.target.type === "personal") return args.identities.some((row) => row.type === "personal");
  const match = findIdentity(args.identities, args.target);
  return Boolean(match && match.verified);
}

export function studentCanWriteVerificationStatus(status: VerificationStatus): boolean {
  return STUDENT_WRITABLE_VERIFICATION_STATUSES.includes(status);
}

export function studentPayloadCannotSelfApprove(payload: Record<string, unknown>): boolean {
  const status = typeof payload.status === "string" ? payload.status : null;
  if (status === "approved" || status === "rejected") return false;
  if ("reviewed_by" in payload && payload.reviewed_by) return false;
  if ("reviewed_at" in payload && payload.reviewed_at) return false;
  if ("admin_internal_notes" in payload && payload.admin_internal_notes) return false;
  return true;
}

export function approvalAction(args: {
  currentStatus: VerificationStatus;
  existingIdentityId: string | null;
}): "already_approved" | "create_identity" {
  if (args.currentStatus === "approved" && args.existingIdentityId) return "already_approved";
  return "create_identity";
}

export function canCreatePersonalMarketListing(listingKind: MarketplaceListingKind): boolean {
  return listingKind === "item";
}

export function canCreateBusinessMarketListing(args: {
  listingKind: MarketplaceListingKind;
  business: { verificationStatus: "verified" | "unverified"; isManager: boolean; status?: "active" | "inactive" } | null;
}): boolean {
  if (args.listingKind !== "service" && args.listingKind !== "business_post") return false;
  if (!args.business) return false;
  if (!args.business.isManager) return false;
  if (args.business.status === "inactive") return false;
  return args.business.verificationStatus === "verified";
}

export function assertMarketplaceListingIdentity(args: {
  listingKind: MarketplaceListingKind;
  business: { verificationStatus: "verified" | "unverified"; isManager: boolean; status?: "active" | "inactive" } | null;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (args.listingKind === "item") {
    return { ok: true };
  }
  if (canCreateBusinessMarketListing(args)) return { ok: true };
  if (!args.business) {
    return {
      ok: false,
      code: "MARKETPLACE_VERIFIED_BUSINESS_REQUIRED",
      message: "Business and service posts need a verified Student Business.",
    };
  }
  if (!args.business.isManager) {
    return {
      ok: false,
      code: "MARKETPLACE_BUSINESS_FORBIDDEN",
      message: "You cannot post for this business.",
    };
  }
  return {
    ok: false,
    code: "MARKETPLACE_BUSINESS_UNVERIFIED",
    message: "Verify your Student Business before posting a business or service listing.",
  };
}

export function assertCanPostAsIdentity(args: {
  actorUserId: string;
  requested: ActiveCampusIdentity;
  identities: CampusIdentity[];
}): { ok: true; identity: CampusIdentity } | { ok: false; code: string; message: string } {
  if (args.requested.type === "personal") {
    if (args.requested.id !== args.actorUserId) {
      return { ok: false, code: "IDENTITY_FORBIDDEN", message: "You can only post as yourself." };
    }
    const personal = args.identities.find((row) => row.type === "personal" && row.id === args.actorUserId);
    if (!personal) {
      return { ok: false, code: "IDENTITY_NOT_FOUND", message: "Personal identity was not found." };
    }
    return { ok: true, identity: personal };
  }
  const match = findIdentity(args.identities, args.requested);
  if (!match) {
    return { ok: false, code: "IDENTITY_FORBIDDEN", message: "You cannot post as that profile." };
  }
  if (!match.verified) {
    return { ok: false, code: "IDENTITY_UNVERIFIED", message: "That profile is not verified yet." };
  }
  return { ok: true, identity: match };
}

export function slugifyBusinessHandle(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return slug.length >= 3 ? slug : `biz_${slug}cq`.slice(0, 24);
}

export function normalizeOptionalHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 2048);
  return `https://${trimmed}`.slice(0, 2048);
}

export function normalizeInstagramInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 2048);
  const handle = trimmed.replace(/^@/, "").replace(/^instagram\.com\//i, "").replace(/\/+$/, "");
  if (!handle) return null;
  return `https://instagram.com/${handle}`.slice(0, 2048);
}

export function parseAdminVerificationEmails(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
}

export function normalizeOrgName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isLikelyOrganizationNameMatch(requestedName: string, existingName: string): boolean {
  const requested = normalizeOrgName(requestedName);
  const existing = normalizeOrgName(existingName);
  if (!requested || !existing) return false;
  if (requested === existing) return true;
  if (requested.length >= 4 && existing.includes(requested)) return true;
  if (existing.length >= 4 && requested.includes(existing)) return true;
  return false;
}

export function rankOrganizationClaimMatches(args: {
  requestedName: string;
  organizations: OrganizationClaimMatch[];
  limit?: number;
}): OrganizationClaimMatch[] {
  const requested = normalizeOrgName(args.requestedName);
  return args.organizations
    .filter((org) => isLikelyOrganizationNameMatch(args.requestedName, org.name))
    .sort((a, b) => {
      const aExact = normalizeOrgName(a.name) === requested ? 0 : 1;
      const bExact = normalizeOrgName(b.name) === requested ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.name.localeCompare(b.name);
    })
    .slice(0, args.limit ?? 5);
}

export type CampusFeedItem =
  | { kind: "post"; id: string; createdAt: number; note: FieldNote }
  | { kind: "market"; id: string; createdAt: number; listing: MarketplaceListing };

export function interleaveMarketIntoCampusFeed(
  posts: FieldNote[],
  listings: MarketplaceListing[],
): CampusFeedItem[] {
  const items: CampusFeedItem[] = posts.map((note) => ({
    kind: "post",
    id: note.id,
    createdAt: note.createdAt,
    note,
  }));
  const sortedListings = [...listings].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  for (const listing of sortedListings) {
    const createdAt = Date.parse(listing.createdAt);
    const timestamp = Number.isFinite(createdAt) ? createdAt : 0;
    let index = items.findIndex((item) => item.createdAt < timestamp);
    if (index < 0) index = items.length;
    items.splice(index, 0, {
      kind: "market",
      id: `market:${listing.id}`,
      createdAt: timestamp,
      listing,
    });
  }
  return items;
}

export function verificationSubmittedCopy(identityType: VerificationIdentityType): {
  title: string;
  body: string;
} {
  return {
    title: "Verification request received",
    body:
      identityType === "student_business"
        ? "We received your Student Business verification request."
        : "We received your organization verification request.",
  };
}

export function verificationDecisionCopy(args: {
  identityType: VerificationIdentityType;
  status: Extract<VerificationStatus, "approved" | "needs_info" | "rejected">;
  name: string;
}): { title: string; body: string } {
  if (args.status === "approved") {
    return args.identityType === "student_business"
      ? { title: "Your business is verified", body: `${args.name} is now a verified Student Business on CampusQuest.` }
      : { title: "Your organization is verified", body: `${args.name} is now a verified organization on CampusQuest.` };
  }
  if (args.status === "needs_info") {
    return {
      title: "We need more information to verify your request",
      body: "Open CampusQuest to see what the review team asked for.",
    };
  }
  return {
    title: "We could not verify this request",
    body: "You can keep using CampusQuest with your personal profile.",
  };
}
