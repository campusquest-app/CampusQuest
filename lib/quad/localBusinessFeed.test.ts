import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canManageAuthoredPost,
  canManageOrganizationPost,
  canOfferLocalBusinessComposer,
  canOfferOrganizationComposer,
  localBusinessPostDenial,
  organizationPostDenial,
  postBelongsInFeed,
} from "@/lib/quad/localBusinessFeed";
import { QUAD_FEED_OPTIONS } from "@/lib/client/quadFeedOptions";

const root = process.cwd();

describe("Local Businesses feed membership", () => {
  it("keeps local business posts out of campus, following, and community feeds", () => {
    expect(postBelongsInFeed("local_businesses", "local_businesses")).toBe(true);
    expect(postBelongsInFeed("local_businesses", "campus")).toBe(false);
    expect(postBelongsInFeed("local_businesses", "other")).toBe(false);
    expect(postBelongsInFeed("campus", "campus")).toBe(true);
    expect(postBelongsInFeed("campus", "other")).toBe(true);
    expect(postBelongsInFeed("campus", "local_businesses")).toBe(false);
    expect(postBelongsInFeed(null, "local_businesses")).toBe(false);
    expect(postBelongsInFeed(undefined, "campus")).toBe(true);
    expect(postBelongsInFeed("organizations", "organizations")).toBe(true);
    expect(postBelongsInFeed("organizations", "campus")).toBe(true);
    expect(postBelongsInFeed("organizations", "local_businesses")).toBe(false);
    expect(postBelongsInFeed("organizations", "other")).toBe(false);
    expect(postBelongsInFeed("local_businesses", "organizations")).toBe(false);
    expect(postBelongsInFeed("campus", "organizations")).toBe(false);
  });

  it("places Local Businesses directly under The Market", () => {
    expect(QUAD_FEED_OPTIONS.map((row) => row.tab)).toEqual([
      "public",
      "trending",
      "friends",
      "student_organizations",
      "market",
      "local_businesses",
      "greek_life",
      "athletics",
    ]);
    const option = QUAD_FEED_OPTIONS.find((row) => row.tab === "local_businesses");
    expect(option?.label).toBe("Local Businesses");
    expect(option?.hint).toBe("Deals, updates, and posts from nearby businesses");
  });
});

describe("Local Businesses posting permission", () => {
  const verifiedBusiness = { postedAsType: "student_business", postedAsVerified: true };
  const unverifiedBusiness = { postedAsType: "student_business", postedAsVerified: false };

  it("lets everyone view and only a verified business create", () => {
    expect(localBusinessPostDenial({ feedDestination: "campus", ...verifiedBusiness })).toBeNull();
    expect(localBusinessPostDenial({ feedDestination: "local_businesses", ...verifiedBusiness })).toBeNull();
    expect(
      localBusinessPostDenial({
        feedDestination: "local_businesses",
        postedAsType: "personal",
        postedAsVerified: false,
      }),
    ).toMatch(/verified business/i);
    expect(localBusinessPostDenial({ feedDestination: "local_businesses", ...unverifiedBusiness })).toMatch(
      /verified business/i,
    );
    expect(
      localBusinessPostDenial({
        feedDestination: "local_businesses",
        postedAsType: "organization",
        postedAsVerified: true,
      }),
    ).toMatch(/verified business/i);
  });

  it("offers the composer only to verified businesses and keeps edits on the author", () => {
    expect(canOfferLocalBusinessComposer([{ type: "personal", verified: false }])).toBe(false);
    expect(canOfferLocalBusinessComposer([{ type: "student_business", verified: false }])).toBe(false);
    expect(canOfferLocalBusinessComposer([{ type: "organization", verified: true }])).toBe(false);
    expect(
      canOfferLocalBusinessComposer([
        { type: "personal", verified: false },
        { type: "student_business", verified: true },
      ]),
    ).toBe(true);
    expect(canManageAuthoredPost({ actorUserId: "biz-user", postUserId: "biz-user" })).toBe(true);
    expect(canManageAuthoredPost({ actorUserId: "other-biz", postUserId: "biz-user" })).toBe(false);
    expect(canManageAuthoredPost({ actorUserId: "student", postUserId: "biz-user" })).toBe(false);
  });
});

describe("Organizations posting permission", () => {
  const approvedOrg = { postedAsType: "organization", postedAsVerified: true };

  it("lets everyone view and only an approved organization representative create", () => {
    expect(organizationPostDenial({ feedDestination: "campus", ...approvedOrg })).toBeNull();
    expect(organizationPostDenial({ feedDestination: "organizations", ...approvedOrg })).toBeNull();
    expect(
      organizationPostDenial({
        feedDestination: "organizations",
        postedAsType: "personal",
        postedAsVerified: false,
      }),
    ).toMatch(/approved organization/i);
    expect(
      organizationPostDenial({
        feedDestination: "organizations",
        postedAsType: "organization",
        postedAsVerified: false,
      }),
    ).toMatch(/approved organization/i);
    expect(
      organizationPostDenial({
        feedDestination: "organizations",
        postedAsType: "student_business",
        postedAsVerified: true,
      }),
    ).toMatch(/approved organization/i);
    expect(localBusinessPostDenial({ feedDestination: "organizations", postedAsType: "student_business", postedAsVerified: true })).toBeNull();
  });

  it("offers the composer only to approved representatives and isolates each organization", () => {
    expect(canOfferOrganizationComposer([{ type: "personal", verified: false }])).toBe(false);
    expect(canOfferOrganizationComposer([{ type: "organization", verified: false }])).toBe(false);
    expect(canOfferOrganizationComposer([{ type: "student_business", verified: true }])).toBe(false);
    expect(
      canOfferOrganizationComposer([
        { type: "personal", verified: false },
        { type: "organization", verified: true },
      ]),
    ).toBe(true);
    expect(
      canManageOrganizationPost({
        actorUserId: "rep-a",
        postUserId: "rep-a",
        postDestination: "organizations",
        postedAsType: "organization",
        postedAsOrganizationId: "org-a",
        actorOrganizationIds: ["org-a"],
      }),
    ).toBe(true);
    expect(
      canManageOrganizationPost({
        actorUserId: "co-rep",
        postUserId: "rep-a",
        postDestination: "organizations",
        postedAsType: "organization",
        postedAsOrganizationId: "org-a",
        actorOrganizationIds: ["org-a", "org-b"],
      }),
    ).toBe(true);
    expect(
      canManageOrganizationPost({
        actorUserId: "rep-b",
        postUserId: "rep-a",
        postDestination: "organizations",
        postedAsType: "organization",
        postedAsOrganizationId: "org-a",
        actorOrganizationIds: ["org-b"],
      }),
    ).toBe(false);
    expect(
      canManageOrganizationPost({
        actorUserId: "student",
        postUserId: "rep-a",
        postDestination: "organizations",
        postedAsType: "organization",
        postedAsOrganizationId: "org-a",
        actorOrganizationIds: [],
      }),
    ).toBe(false);
  });
});

describe("Organizations database enforcement", () => {
  const migration = readFileSync(
    join(root, "supabase/migrations/20261005233000_organizations_feed.sql"),
    "utf8",
  );

  it("reuses approved organization representative checks in the database", () => {
    expect(migration).toContain("is_approved_organization_representative");
    expect(migration).toContain("o.is_approved = true");
    expect(migration).toContain("ORGANIZATION_FEED_FORBIDDEN");
    expect(migration).toContain("posted_as_type is distinct from 'organization'");
    expect(migration).toMatch(/org_role, ''\) in \('owner', 'admin'\)/);
    expect(migration).toContain("organizations");
  });
});

describe("Local Businesses database enforcement", () => {
  const migration = readFileSync(
    join(root, "supabase/migrations/20261005221500_local_businesses_feed.sql"),
    "utf8",
  );
  const route = readFileSync(join(root, "app/api/quad/posts/route.ts"), "utf8");

  it("rejects non-verified business inserts in the database", () => {
    expect(migration).toContain("feed_destination");
    expect(migration).toContain("local_businesses");
    expect(migration).toContain("is_verified_student_business_manager");
    expect(migration).toContain("LOCAL_BUSINESS_FEED_FORBIDDEN");
    expect(migration).toMatch(/posted_as_type is distinct from 'student_business'/);
    expect(migration).toContain("trg_enforce_local_business_feed");
  });

  it("checks the verified business rule in the post API before insert", () => {
    expect(route).toContain("localBusinessPostDenial");
    expect(route).toContain("organizationPostDenial");
    expect(route).toContain("LOCAL_BUSINESS_POST_FORBIDDEN");
    expect(route).toContain("ORGANIZATION_POST_FORBIDDEN");
    expect(route).toContain('feedParam === "local_businesses"');
    expect(route).toContain('feedParam === "organizations"');
  });
});
