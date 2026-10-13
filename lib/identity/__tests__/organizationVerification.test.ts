import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/accountSafety", () => ({ assertAccountCanSocialize: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/schoolVerification", () => ({ requireVerifiedSchoolForCoreAccess: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/notifications", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/verificationMail", () => ({ notifyVerificationAdmins: vi.fn(async () => ({ sent: false })) }));
vi.mock("@/lib/server/audit", () => ({ logAdminAuditAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: vi.fn(() => {
    throw new Error("tests must inject an admin client");
  }),
}));
import {
  composeOrganizationRequestNotes,
  escapeIlikeExact,
  isOrganizationManagerRow,
  ORG_ALREADY_VERIFIED_MESSAGE,
  ORG_REQUEST_PENDING_MESSAGE,
  ORG_VERIFICATION_CAMPUS,
  resolveOrganizationAvailability,
} from "@/lib/identity/organizationVerification";
import { submitVerificationRequestSchema } from "@/lib/identity/schemas";
import { getOrganizationAvailability, submitVerificationRequest } from "@/lib/server/verificationRequests";
import { OrgVerificationCtaView, pendingOrgRequestsForVariant } from "@/components/quad/OrgVerificationCta";
import type { VerificationRequestSummary } from "@/lib/identity/types";

type Filter = [op: string, column: string, value: unknown];
type TableHandler = (filters: Filter[]) => unknown[];

/** Minimal chainable stand-in for the Supabase query builder. */
function fakeClient(tables: Record<string, TableHandler>, inserts: Array<{ table: string; row: unknown }> = []) {
  return {
    from(table: string) {
      const filters: Filter[] = [];
      const run = () => ({ data: (tables[table] ?? (() => []))(filters), error: null });
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push(["eq", column, value]), builder),
        in: (column: string, value: unknown) => (filters.push(["in", column, value]), builder),
        ilike: (column: string, value: unknown) => (filters.push(["ilike", column, value]), builder),
        order: () => builder,
        limit: () => builder,
        insert: (row: unknown) => {
          inserts.push({ table, row });
          return builder;
        },
        single: async () => ({ data: { id: "req-new" }, error: null }),
        maybeSingle: async () => ({ data: (run().data as unknown[])[0] ?? null, error: null }),
        then: (resolve: (value: ReturnType<typeof run>) => unknown) => resolve(run()),
      };
      return builder;
    },
  } as never;
}

const has = (filters: Filter[], op: string, column: string, value?: unknown) =>
  filters.some(([o, c, v]) => o === op && c === column && (value === undefined || v === value));

function orgDb(opts: { approvedOrgNamed?: string; managed?: boolean; openRequestNamed?: string }) {
  return fakeClient({
    student_organizations: (filters) =>
      opts.approvedOrgNamed && has(filters, "ilike", "name", opts.approvedOrgNamed) ? [{ id: "org-1" }] : [],
    organization_members: () =>
      opts.managed ? [{ org_role: "owner", role: "manager", status: "approved" }] : [{ org_role: "member", role: "member", status: "approved" }],
    verification_requests: (filters) =>
      opts.openRequestNamed && has(filters, "ilike", "name", opts.openRequestNamed)
        ? [{ id: "req-1", status: "pending_review" }]
        : [],
  });
}

describe("organization verification helpers", () => {
  it("stores Greek and advisor details as a labeled block for admins", () => {
    const notes = composeOrganizationRequestNotes({
      reasonForAccess: "I'm chapter president.",
      campus: ORG_VERIFICATION_CAMPUS,
      variant: "greek",
      greekType: "sorority",
      nationalAffiliation: "Alpha Chi Omega",
      advisorName: "Dana Smith",
      advisorEmail: "dana@uri.edu",
    });
    expect(notes).toBe(
      "Request details\nCampus: University of Rhode Island\nGreek organization: Sorority\nNational organization: Alpha Chi Omega\nChapter advisor: Dana Smith <dana@uri.edu>\n\nI'm chapter president.",
    );
  });

  it("omits Greek lines for general organizations and keeps the column limit", () => {
    const notes = composeOrganizationRequestNotes({
      campus: ORG_VERIFICATION_CAMPUS,
      variant: "general",
      greekType: "fraternity",
      nationalAffiliation: "Should not appear",
      reasonForAccess: "x".repeat(2000),
    });
    expect(notes).not.toContain("Greek organization");
    expect(notes).not.toContain("Should not appear");
    expect(notes!.length).toBeLessThanOrEqual(1000);
  });

  it("escapes ilike wildcards so name checks are exact", () => {
    expect(escapeIlikeExact("  100%_Club\\ ")).toBe("100\\%\\_Club\\\\");
  });

  it("treats only approved owners, admins and managers as page managers", () => {
    expect(isOrganizationManagerRow({ org_role: "owner", status: "approved" })).toBe(true);
    expect(isOrganizationManagerRow({ role: "manager", status: null })).toBe(true);
    expect(isOrganizationManagerRow({ org_role: "member", role: "member" })).toBe(false);
    expect(isOrganizationManagerRow({ org_role: "owner", status: "pending" })).toBe(false);
    expect(resolveOrganizationAvailability({ hasManagedOrganization: true, hasOpenRequest: true })).toBe("verified");
    expect(resolveOrganizationAvailability({ hasManagedOrganization: false, hasOpenRequest: true })).toBe("pending");
  });
});

describe("organization verification request schema", () => {
  const base = {
    identityType: "organization" as const,
    name: "Alpha Chi Omega",
    category: "greek_life",
    description: "Sorority chapter at URI.",
    applicantConfirmation: true as const,
  };

  it("never accepts a requester-supplied status or verified flag", () => {
    const parsed = submitVerificationRequestSchema.parse({ ...base, status: "approved", verified: true, reviewedBy: "me" });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("verified");
    expect(parsed).not.toHaveProperty("reviewedBy");
  });

  it("requires the authorization confirmation", () => {
    expect(() => submitVerificationRequestSchema.parse({ ...base, applicantConfirmation: false })).toThrow();
  });

  it("requires fraternity/sorority and national affiliation for Greek requests", () => {
    expect(() => submitVerificationRequestSchema.parse({ ...base, organizationVariant: "greek" })).toThrow(
      /fraternity or sorority/,
    );
    expect(() =>
      submitVerificationRequestSchema.parse({ ...base, organizationVariant: "greek", greekType: "sorority" }),
    ).toThrow(/national organization/i);
    expect(() =>
      submitVerificationRequestSchema.parse({
        ...base,
        category: "social",
        organizationVariant: "greek",
        greekType: "sorority",
        nationalAffiliation: "Local",
      }),
    ).toThrow(/Greek Life/);
    expect(
      submitVerificationRequestSchema.parse({
        ...base,
        organizationVariant: "greek",
        greekType: "sorority",
        nationalAffiliation: "Local",
      }).greekType,
    ).toBe("sorority");
  });

  it("validates advisor and organization emails", () => {
    expect(() => submitVerificationRequestSchema.parse({ ...base, advisorEmail: "not-an-email" })).toThrow(/advisor/i);
    expect(() => submitVerificationRequestSchema.parse({ ...base, organizationEmail: "nope" })).toThrow();
    expect(submitVerificationRequestSchema.parse({ ...base, advisorEmail: "" }).advisorEmail).toBeNull();
  });
});

describe("organization availability", () => {
  it("reports verified when an approved org with that name has a manager", async () => {
    const admin = orgDb({ approvedOrgNamed: "Alpha Chi Omega", managed: true });
    await expect(getOrganizationAvailability({ admin, name: "Alpha Chi Omega" })).resolves.toBe("verified");
  });

  it("does not treat an imported org without managers as verified", async () => {
    const admin = orgDb({ approvedOrgNamed: "Alpha Chi Omega", managed: false });
    await expect(getOrganizationAvailability({ admin, name: "Alpha Chi Omega" })).resolves.toBe("available");
  });

  it("reports pending when any student has an open request for that name", async () => {
    const admin = orgDb({ openRequestNamed: "Rhody Robotics" });
    await expect(getOrganizationAvailability({ admin, name: "Rhody Robotics" })).resolves.toBe("pending");
    await expect(getOrganizationAvailability({ admin, name: "Chess Club" })).resolves.toBe("available");
  });
});

describe("submitting an organization verification request", () => {
  const input = {
    identityType: "organization" as const,
    name: "Rhody Robotics",
    category: "technology",
    description: "Robotics club.",
    organizationVariant: "general" as const,
    advisorName: "Prof. Lee",
    applicantConfirmation: true as const,
  };
  let inserts: Array<{ table: string; row: unknown }>;
  let userClient: ReturnType<typeof fakeClient>;

  beforeEach(() => {
    inserts = [];
    userClient = fakeClient({ profiles: () => [{ display_name: "Sam" }] }, inserts);
  });

  it("creates a pending_review request only, with details for admins", async () => {
    const result = await submitVerificationRequest({
      userClient,
      userId: "user-1",
      userEmail: "sam@uri.edu",
      input,
      adminClient: orgDb({}),
    });
    expect(result.request.status).toBe("pending_review");
    const row = inserts.find((entry) => entry.table === "verification_requests")?.row as Record<string, unknown>;
    expect(row.status).toBe("pending_review");
    expect(row.applicant_user_id).toBe("user-1");
    expect(row).not.toHaveProperty("verified");
    expect(row).not.toHaveProperty("reviewed_by");
    expect(String(row.reason_for_access)).toContain("Campus: University of Rhode Island");
    expect(String(row.reason_for_access)).toContain("Advisor: Prof. Lee");
    expect(inserts.some((entry) => entry.table === "student_organizations")).toBe(false);
    expect(inserts.some((entry) => entry.table === "organization_members")).toBe(false);
  });

  it("blocks a second request while one is under review", async () => {
    await expect(
      submitVerificationRequest({ userClient, userId: "user-2", input, adminClient: orgDb({ openRequestNamed: "Rhody Robotics" }) }),
    ).rejects.toMatchObject({ status: 409, message: ORG_REQUEST_PENDING_MESSAGE });
    expect(inserts).toHaveLength(0);
  });

  it("blocks requests for an organization that already has a verified page", async () => {
    await expect(
      submitVerificationRequest({
        userClient,
        userId: "user-2",
        input,
        adminClient: orgDb({ approvedOrgNamed: "Rhody Robotics", managed: true }),
      }),
    ).rejects.toMatchObject({ status: 409, message: ORG_ALREADY_VERIFIED_MESSAGE });
    expect(inserts).toHaveLength(0);
  });
});

describe("feed registration CTA", () => {
  const request = (partial: Partial<VerificationRequestSummary>): VerificationRequestSummary => ({
    id: "r",
    identityType: "organization",
    name: "Org",
    category: "technology",
    status: "pending_review",
    createdAt: "2026-10-01T00:00:00.000Z",
    submittedAt: null,
    requestedIdentityId: null,
    ...partial,
  });

  it("renders the Organizations copy", () => {
    const html = renderToStaticMarkup(
      createElement(OrgVerificationCtaView, { variant: "general", pending: [], onRequest: () => undefined }),
    );
    expect(html).toContain("Register your organization");
    expect(html).toContain("Create a verified CampusQuest page for your club or student organization.");
    expect(html).toContain("Request Verification");
  });

  it("renders the Greek Life copy and a pending line", () => {
    const html = renderToStaticMarkup(
      createElement(OrgVerificationCtaView, {
        variant: "greek",
        pending: [request({ name: "Alpha Chi Omega", category: "greek_life" })],
        onRequest: () => undefined,
      }),
    );
    expect(html).toContain("Register your Greek organization");
    expect(html).toContain("Request a verified CampusQuest page for your fraternity or sorority.");
    expect(html).toContain("Alpha Chi Omega: ");
    expect(html).toContain("under review");
  });

  it("splits pending requests between the Organizations and Greek Life feeds", () => {
    const rows = [
      request({ id: "a", category: "greek_life" }),
      request({ id: "b", category: "technology" }),
      request({ id: "c", category: "technology", status: "approved" }),
      request({ id: "d", identityType: "student_business", category: "food" }),
    ];
    expect(pendingOrgRequestsForVariant(rows, "greek").map((r) => r.id)).toEqual(["a"]);
    expect(pendingOrgRequestsForVariant(rows, "general").map((r) => r.id)).toEqual(["b"]);
  });

  it("is mounted above both feeds regardless of loading or empty state", () => {
    const quad = readFileSync(join(process.cwd(), "components/TheQuad.tsx"), "utf8");
    expect(quad).toContain('if (tab === "student_organizations") return "general";');
    expect(quad).toContain('if (tab === "greek_life") return "greek";');
    const ctaIndex = quad.indexOf("<OrgVerificationCta variant={orgCtaVariant} />");
    expect(ctaIndex).toBeGreaterThan(-1);
    expect(ctaIndex).toBeLessThan(quad.indexOf("<QuadFeedSkeleton label={feedLoadingLabel} />"));
    expect(ctaIndex).toBeLessThan(quad.indexOf('<ScreenDataState variant="empty"'));
  });
});
