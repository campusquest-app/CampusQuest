import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAccountTypeUpdate } from "@/lib/server/accountType";
import { isAllowedSignupEmail } from "@/lib/signupEmailPolicy";
import { normalizeProfileRole, roleAtLeast } from "@/lib/server/permissions";
import { hasValidRoleSelection, isLocalBusiness, isStudent } from "@/lib/roles";
import { resolveProfileRoute } from "@/lib/client/appShellRoute";
import { localBusinessPostDenial } from "@/lib/quad/localBusinessFeed";
import {
  DAISY_PARTNER_ID,
  DAISY_PREFERRED_USERNAME,
  SANDBAR_PARTNER_ID,
  SANDBAR_PREFERRED_USERNAME,
  STUDENT_PRIVACY_MESSAGE,
  buildLocalBusinessProfilePatch,
  businessCanOpenFeed,
  canManagePartner,
  localBusinessAssignmentsError,
  localBusinessProvisionError,
  postsForPartner,
  resolveActivePartnerId,
  studentFeedDenial,
} from "@/lib/localBusiness/access";
import { activeOfferCount, businessPostFields, mergePartnerProfile, weeklyHoursFromEditor } from "@/lib/localBusiness/profile";
import { resolveBusinessLoginPassword } from "@/lib/localBusiness/loginPassword";
import { findPartnerById } from "@/lib/partners/partnerDirectory";

describe("local business account role", () => {
  it("keeps businesses distinct from verified students and admins", () => {
    expect(isLocalBusiness({ role: "local_business" })).toBe(true);
    expect(isStudent({ role: "local_business" })).toBe(false);
    expect(normalizeProfileRole("local_business")).toBe("local_business");
    expect(normalizeProfileRole("student")).toBe("student");
    expect(roleAtLeast("local_business", "admin")).toBe(false);
    expect(roleAtLeast("local_business", "student")).toBe(false);
    expect(hasValidRoleSelection({ role: "local_business" })).toBe(true);
  });

  it("does not let a business account switch itself to a student", () => {
    expect(resolveAccountTypeUpdate({ role: "local_business" }, "student").kind).toBe("role_locked");
    expect(resolveAccountTypeUpdate({ role: "admin" }, "student").kind).toBe("admin_locked");
    expect(resolveAccountTypeUpdate({ role: "student" }, "faculty_staff").kind).toBe("update");
  });

  it("opens the app without campus email verification and without a public non-URI signup", () => {
    expect(
      resolveProfileRoute({
        role: "local_business",
        onboarding_completed: true,
        campus_email_verified_at: null,
        display_name: "Daisy's Chicken & Ice Cream",
      }),
    ).toBe("app");
    expect(isAllowedSignupEmail("owner@gmail.com")).toBe(false);
    expect(isAllowedSignupEmail("student@uri.edu")).toBe(true);
  });
});

describe("local business feed privacy and posting", () => {
  it("allows only the Local Businesses feed", () => {
    for (const feed of ["public", "trending", "friends", "greek_life", "athletics", "student_organizations", "organizations", "market"]) {
      expect(businessCanOpenFeed(feed)).toBe(false);
      expect(studentFeedDenial(true, feed)).toBe(STUDENT_PRIVACY_MESSAGE);
    }
    expect(businessCanOpenFeed("local_businesses")).toBe(true);
    expect(studentFeedDenial(true, "local_businesses")).toBeNull();
    expect(studentFeedDenial(false, "public")).toBeNull();
  });

  it("lets an approved business post only to Local Businesses and leaves student posting unchanged", () => {
    expect(
      localBusinessPostDenial({
        feedDestination: "local_businesses",
        postedAsType: "personal",
        postedAsVerified: false,
        actorIsApprovedLocalBusiness: true,
      }),
    ).toBeNull();
    expect(
      localBusinessPostDenial({
        feedDestination: "campus",
        postedAsType: "personal",
        postedAsVerified: false,
        actorIsApprovedLocalBusiness: true,
      }),
    ).toMatch(/Local Businesses feed/);
    expect(
      localBusinessPostDenial({
        feedDestination: "organizations",
        postedAsType: "personal",
        postedAsVerified: false,
        actorIsApprovedLocalBusiness: true,
      }),
    ).toMatch(/Local Businesses feed/);
    expect(
      localBusinessPostDenial({
        feedDestination: "local_businesses",
        postedAsType: "personal",
        postedAsVerified: false,
      }),
    ).toMatch(/verified business/i);
    expect(
      localBusinessPostDenial({
        feedDestination: "campus",
        postedAsType: "personal",
        postedAsVerified: false,
      }),
    ).toBeNull();
  });
});

describe("Daisy's listing stays the source profile", () => {
  const daisy = findPartnerById(DAISY_PARTNER_ID)!;

  it("reuses the existing listing, logo, and live offer", () => {
    expect(daisy.name).toMatch(/Daisy/);
    expect(daisy.logoUrl).toBe("/partners/daisys/logo.jpg");
    expect(daisy.address).toMatch(/Narragansett/);
    expect(activeOfferCount(daisy, new Date("2026-10-12T17:00:00Z"))).toBe(1);
    expect(localBusinessProvisionError({
      email: "owner@example.com",
      partnerId: DAISY_PARTNER_ID,
      username: DAISY_PREFERRED_USERNAME,
    })).toBeNull();
    const patch = buildLocalBusinessProfilePatch(daisy, `@${DAISY_PREFERRED_USERNAME}`);
    expect(patch.role).toBe("local_business");
    expect(patch.username).toBe(DAISY_PREFERRED_USERNAME);
    expect(patch.campus_email_verified_at).toBeNull();
    expect(patch.avatar_url).toBe(daisy.logoUrl);
  });

  it("merges owner edits over the listing without replacing the offer", () => {
    const merged = mergePartnerProfile(daisy, {
      description: "Updated hours note lives with the listing.",
      websiteUrl: "https://daisysnarragansett.com/",
    });
    expect(merged.description).toMatch(/Updated hours/);
    expect(merged.discountValue).toBe(daisy.discountValue);
    expect(merged.logoUrl).toBe(daisy.logoUrl);
    expect(weeklyHoursFromEditor("12:00", "22:00")?.weekly).toHaveLength(7);
    expect(weeklyHoursFromEditor("12:00", "")).toBeNull();
  });
});

describe("one login can manage Daisy's and Sandbar separately", () => {
  const grants = [
    { partnerId: DAISY_PARTNER_ID, approved: true },
    { partnerId: SANDBAR_PARTNER_ID, approved: true },
  ];

  it("selects only an assigned business and remembers the last authorized one", () => {
    expect(canManagePartner(grants, DAISY_PARTNER_ID)).toBe(true);
    expect(canManagePartner(grants, SANDBAR_PARTNER_ID)).toBe(true);
    expect(canManagePartner(grants, "international-pocket-cafe")).toBe(false);
    expect(canManagePartner([{ partnerId: DAISY_PARTNER_ID, approved: true, revoked: true }], DAISY_PARTNER_ID)).toBe(false);
    expect(resolveActivePartnerId(grants, SANDBAR_PARTNER_ID, DAISY_PARTNER_ID)).toBe(SANDBAR_PARTNER_ID);
    expect(resolveActivePartnerId(grants, "international-pocket-cafe", SANDBAR_PARTNER_ID)).toBe(SANDBAR_PARTNER_ID);
    expect(resolveActivePartnerId(grants, null, null)).toBe(DAISY_PARTNER_ID);
  });

  it("keeps posts, offers, and public names on the business that published them", () => {
    const daisy = findPartnerById(DAISY_PARTNER_ID)!;
    const sandbar = findPartnerById(SANDBAR_PARTNER_ID)!;
    const posts = [
      { id: "daisy-post", businessPartnerId: DAISY_PARTNER_ID },
      { id: "sandbar-post", businessPartnerId: SANDBAR_PARTNER_ID },
    ];
    expect(postsForPartner(posts, DAISY_PARTNER_ID).map((post) => post.id)).toEqual(["daisy-post"]);
    expect(postsForPartner(posts, SANDBAR_PARTNER_ID).map((post) => post.id)).toEqual(["sandbar-post"]);
    expect(businessPostFields(daisy, { username: DAISY_PREFERRED_USERNAME }).posted_as_display_name).toMatch(/Daisy/);
    expect(businessPostFields(sandbar, { username: SANDBAR_PREFERRED_USERNAME }).posted_as_display_name).toMatch(/Sandbar/);
    expect(businessPostFields(daisy, { username: DAISY_PREFERRED_USERNAME }).posted_as_username).not.toBe(
      businessPostFields(sandbar, { username: SANDBAR_PREFERRED_USERNAME }).posted_as_username,
    );
    expect(activeOfferCount(daisy)).toBe(1);
    expect(activeOfferCount(sandbar)).toBe(0);
    expect(daisy.logoUrl).not.toBe(sandbar.logoUrl);
    expect(localBusinessAssignmentsError([
      { partnerId: DAISY_PARTNER_ID, username: DAISY_PREFERRED_USERNAME },
      { partnerId: SANDBAR_PARTNER_ID, username: SANDBAR_PREFERRED_USERNAME },
    ])).toBeNull();
    expect(localBusinessAssignmentsError([
      { partnerId: DAISY_PARTNER_ID, username: DAISY_PREFERRED_USERNAME },
      { partnerId: DAISY_PARTNER_ID, username: "daisysother" },
    ])).toMatch(/once/);
  });
});

describe("operator-chosen business password", () => {
  it("keeps a typed password out of the returned temporary password", () => {
    const chosen = resolveBusinessLoginPassword("Horse-battery-1!");
    expect(chosen.temporaryPassword).toBeNull();
    expect(chosen.mustResetPassword).toBe(false);
    expect(chosen.password).toBe("Horse-battery-1!");
    const generated = resolveBusinessLoginPassword();
    expect(generated.temporaryPassword).toBe(generated.password);
    expect(generated.mustResetPassword).toBe(true);
    expect(() => resolveBusinessLoginPassword("short")).toThrow("PASSWORD_REQUIREMENTS");
  });
});

describe("local business database policy", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261111170000_local_business_accounts.sql"),
    "utf8",
  );

  it("restricts business reads and writes at the database", () => {
    expect(sql).toContain("as restrictive");
    expect(sql).toContain("STUDENT_FEED_POST_FORBIDDEN");
    expect(sql).toContain("p.role = 'local_business'");
    expect(sql).toContain("revoked_at is null");
    expect(sql).toContain("local_business_memberships");
    expect(sql).toContain("primary key (user_id, partner_id)");
    expect(sql).toContain("business_partner_id");
    expect(sql).not.toContain("local_business_accounts_one_active_partner");
    expect(sql).not.toMatch(/insert into public\.local_business_accounts/i);
    expect(sql).not.toMatch(/daisyschicken@/i);
  });
});
