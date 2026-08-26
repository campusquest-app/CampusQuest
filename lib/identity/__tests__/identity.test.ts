import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  approvalAction,
  assertCanPostAsIdentity,
  assertMarketplaceListingIdentity,
  canCreateBusinessMarketListing,
  canCreatePersonalMarketListing,
  canSwitchToIdentity,
  interleaveMarketIntoCampusFeed,
  isLikelyOrganizationNameMatch,
  parseAdminVerificationEmails,
  personalIdentityRef,
  rankOrganizationClaimMatches,
  studentPayloadCannotSelfApprove,
  verificationDecisionCopy,
  verificationSubmittedCopy,
} from "@/lib/identity/policy";
import { reviewVerificationRequestSchema, submitVerificationRequestSchema } from "@/lib/identity/schemas";
import type { CampusIdentity } from "@/lib/identity/types";
import type { FieldNote } from "@/lib/types";
import type { MarketplaceListing } from "@/lib/marketplace/types";

const root = process.cwd();

function identity(partial: Partial<CampusIdentity> & Pick<CampusIdentity, "id" | "type">): CampusIdentity {
  return {
    displayName: "Identity",
    username: "identity",
    avatarUrl: null,
    bio: "",
    verified: partial.type === "personal" ? false : true,
    verificationLabel: null,
    managerRole: partial.type === "personal" ? "self" : "owner",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
}

function note(id: string, createdAt: number): FieldNote {
  return {
    id,
    authorId: "user-1",
    authorName: "Nick",
    authorUsername: "nick",
    authorAvatar: "",
    body: "Campus post",
    ramMarks: [],
    nodCount: 0,
    vouchCount: 0,
    nodByUserIds: [],
    vouchByUserIds: [],
    createdAt,
  } as unknown as FieldNote;
}

function listing(id: string, createdAt: string): MarketplaceListing {
  return {
    id,
    sellerId: "user-1",
    businessId: null,
    listingKind: "item",
    title: "URI hoodie",
    description: "Like new",
    priceCents: 2500,
    startingPrice: false,
    category: "clothing",
    condition: "like_new",
    meetupArea: "memorial_union",
    availabilityNote: null,
    status: "active",
    soldAt: null,
    favoriteCount: 0,
    favorited: false,
    isOwner: false,
    createdAt,
    updatedAt: createdAt,
    seller: {
      id: "user-1",
      username: "nick",
      displayName: "Nick",
      avatarUrl: null,
      campusVerified: true,
    },
    business: null,
    media: [],
  };
}

describe("identity policy", () => {
  it("parses comma-separated admin verification emails", () => {
    expect(parseAdminVerificationEmails(" admin1@x.com ,Admin2@X.com,,bad")).toEqual([
      "admin1@x.com",
      "admin2@x.com",
    ]);
  });

  it("blocks students from self-approving verification payloads", () => {
    expect(studentPayloadCannotSelfApprove({ status: "pending_review" })).toBe(true);
    expect(studentPayloadCannotSelfApprove({ status: "approved" })).toBe(false);
    expect(studentPayloadCannotSelfApprove({ reviewed_by: "admin" })).toBe(false);
  });

  it("makes approval identity creation idempotent", () => {
    expect(approvalAction({ currentStatus: "approved", existingIdentityId: "biz-1" })).toBe("already_approved");
    expect(approvalAction({ currentStatus: "pending_review", existingIdentityId: null })).toBe("create_identity");
    expect(approvalAction({ currentStatus: "approved", existingIdentityId: null })).toBe("create_identity");
  });

  it("lets every student create personal Market listings and locks Business/Service until verified", () => {
    expect(canCreatePersonalMarketListing("item")).toBe(true);
    expect(canCreatePersonalMarketListing("service")).toBe(false);
    expect(assertMarketplaceListingIdentity({ listingKind: "item", business: null }).ok).toBe(true);
    expect(assertMarketplaceListingIdentity({ listingKind: "service", business: null }).ok).toBe(false);
    expect(
      canCreateBusinessMarketListing({
        listingKind: "service",
        business: { verificationStatus: "unverified", isManager: true },
      }),
    ).toBe(false);
    expect(
      assertMarketplaceListingIdentity({
        listingKind: "business_post",
        business: { verificationStatus: "verified", isManager: true, status: "active" },
      }).ok,
    ).toBe(true);
    const denied = assertMarketplaceListingIdentity({
      listingKind: "service",
      business: { verificationStatus: "verified", isManager: false },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("MARKETPLACE_BUSINESS_FORBIDDEN");
  });

  it("prevents posting as another user's identity", () => {
    const identities = [
      identity({ id: "user-1", type: "personal", displayName: "Nick" }),
      identity({ id: "biz-1", type: "student_business", displayName: "Rhody Threads", verified: true }),
    ];
    expect(
      assertCanPostAsIdentity({
        actorUserId: "user-1",
        requested: { type: "personal", id: "user-2" },
        identities,
      }).ok,
    ).toBe(false);
    expect(
      assertCanPostAsIdentity({
        actorUserId: "user-1",
        requested: { type: "student_business", id: "biz-2" },
        identities,
      }).ok,
    ).toBe(false);
    expect(
      assertCanPostAsIdentity({
        actorUserId: "user-1",
        requested: { type: "student_business", id: "biz-1" },
        identities,
      }).ok,
    ).toBe(true);
  });

  it("only switches onto verified managed identities", () => {
    const identities = [
      identity({ id: "user-1", type: "personal" }),
      identity({ id: "biz-1", type: "student_business", verified: true }),
    ];
    expect(canSwitchToIdentity({ identities, target: personalIdentityRef("user-1") })).toBe(true);
    expect(canSwitchToIdentity({ identities, target: { type: "student_business", id: "biz-1" } })).toBe(true);
    expect(canSwitchToIdentity({ identities, target: { type: "organization", id: "org-1" } })).toBe(false);
  });

  it("ranks likely organization matches instead of creating duplicates", () => {
    expect(isLikelyOrganizationNameMatch("URI Entrepreneurship Club", "URI Entrepreneurship Club")).toBe(true);
    const ranked = rankOrganizationClaimMatches({
      requestedName: "Entrepreneurship Club",
      organizations: [
        { id: "a", name: "Chess Club", category: "academic", logoUrl: null, description: "", source: "urinvolved" },
        { id: "b", name: "URI Entrepreneurship Club", category: "professional", logoUrl: null, description: "", source: "urinvolved" },
      ],
    });
    expect(ranked.map((row) => row.id)).toEqual(["b"]);
  });

  it("interleaves Market listings into Campus Feed without duplicating posts", () => {
    const items = interleaveMarketIntoCampusFeed(
      [note("p1", Date.parse("2026-08-25T12:00:00.000Z")), note("p2", Date.parse("2026-08-25T10:00:00.000Z"))],
      [listing("m1", "2026-08-25T11:00:00.000Z")],
    );
    expect(items.map((item) => item.id)).toEqual(["p1", "market:m1", "p2"]);
    expect(items.filter((item) => item.kind === "post")).toHaveLength(2);
    expect(items.filter((item) => item.kind === "market")).toHaveLength(1);
  });

  it("uses respectful verification copy", () => {
    expect(verificationSubmittedCopy("student_business").title).toBe("Verification request received");
    expect(verificationDecisionCopy({ identityType: "student_business", status: "approved", name: "Rhody Threads" }).title).toBe(
      "Your business is verified",
    );
    expect(verificationDecisionCopy({ identityType: "organization", status: "approved", name: "URI Club" }).title).toBe(
      "Your organization is verified",
    );
    expect(verificationDecisionCopy({ identityType: "student_business", status: "needs_info", name: "X" }).title).toMatch(
      /more information/i,
    );
    expect(verificationDecisionCopy({ identityType: "student_business", status: "rejected", name: "X" }).body).not.toMatch(
      /internal/i,
    );
  });
});

describe("verification request schemas", () => {
  it("requires confirmation and cannot carry an approved status", () => {
    const parsed = submitVerificationRequestSchema.parse({
      identityType: "student_business",
      name: "Rhody Threads",
      category: "clothing_fashion",
      description: "Campus streetwear.",
      applicantConfirmation: true,
      status: "approved",
    });
    expect(parsed).not.toHaveProperty("status");
    expect(() =>
      submitVerificationRequestSchema.parse({
        identityType: "student_business",
        name: "Rhody Threads",
        category: "clothing_fashion",
        description: "Campus streetwear.",
        applicantConfirmation: false,
      }),
    ).toThrow();
  });

  it("requires a missing-info message and lets reject stay optional", () => {
    expect(() =>
      reviewVerificationRequestSchema.parse({ action: "needs_info", applicantStatusMessage: "" }),
    ).toThrow(/missing/i);
    expect(reviewVerificationRequestSchema.parse({ action: "reject" }).action).toBe("reject");
    expect(reviewVerificationRequestSchema.parse({ action: "approve" }).action).toBe("approve");
  });
});

describe("identity verification source contracts", () => {
  const migration = readFileSync(join(root, "supabase/migrations/20260825200000_campusquest_identity_verification.sql"), "utf8");
  const quad = readFileSync(join(root, "components/TheQuad.tsx"), "utf8");
  const composer = readFileSync(join(root, "components/market/MarketSellComposer.tsx"), "utf8");
  const feed = readFileSync(join(root, "components/market/TheMarketFeed.tsx"), "utf8");
  const reviewRoute = readFileSync(
    join(root, "app/api/internal/admin/verification-requests/[requestId]/review/route.ts"),
    "utf8",
  );
  const submitRoute = readFileSync(join(root, "app/api/verification/requests/route.ts"), "utf8");
  const onboarding = readFileSync(join(root, "components/identity/VerificationOnboarding.tsx"), "utf8");
  const knight = readFileSync(join(root, "lib/onboarding/taxonomy.ts"), "utf8");
  const envExample = readFileSync(join(root, ".env.example"), "utf8");

  it("reuses membership tables instead of duplicating auth users", () => {
    expect(migration).toContain("create table if not exists public.user_active_identities");
    expect(migration).toContain("create table if not exists public.verification_requests");
    expect(migration).toContain("create or replace view public.identity_managers");
    expect(migration).toContain("prevent_verification_self_approve");
    expect(migration).toContain("Students cannot approve verification requests");
    expect(migration).toContain("show_in_campus_feed");
    expect(migration).toContain("enforce_quad_post_posted_as");
    expect(migration).toContain("is_verified_student_business_manager");
  });

  it("keeps The Market open to every student and surfaces listings in Campus Feed", () => {
    expect(quad).toContain("TheMarketFeed");
    expect(quad).toContain("campusFeed: true");
    expect(quad).toContain("interleaveMarketIntoCampusFeed");
    expect(feed).not.toContain("verificationStatus === \"verified\"");
    expect(composer).toContain("Sell an Item");
    expect(composer).toContain("Business / Service");
    expect(composer).toContain("openVerificationOnboarding");
    expect(composer).toContain("Promote a business, brand, product or service");
  });

  it("keeps approval on authenticated admin routes and reuses the Rhody Knight asset", () => {
    expect(reviewRoute).toContain("requireAdminUser");
    expect(submitRoute).toContain("requireAuthUser");
    expect(submitRoute).not.toContain("requireAdminUser");
    expect(onboarding).toContain("BRAND_KNIGHT");
    expect(onboarding).toContain("Create Your Campus Presence");
    expect(knight).toContain('/brand/knight/welcoming.png');
    expect(envExample).toContain("ADMIN_VERIFICATION_EMAILS");
    expect(envExample).not.toContain("NEXT_PUBLIC_ADMIN_VERIFICATION_EMAILS");
  });
});
