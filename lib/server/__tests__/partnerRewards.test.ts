import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { definePartner, PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import { REWARD_ERROR_CODES, REWARD_PASS_TTL_SECONDS } from "@/lib/partners/rewardAccess";
import { ApiError } from "@/lib/server/http";
import { REVIEW_DEMO_PARTNER } from "@/lib/partners/reviewDemoPartner";
import {
  generatePassId,
  issueReviewDemoRewardPass,
  issueStudentRewardPass,
  passDisplayName,
} from "@/lib/server/partnerRewards";

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function mockAdmin(tables: Partial<Record<string, Result>>) {
  const reads: string[] = [];
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const builder = {
        select() {
          reads.push(table);
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return tables[table] ?? { data: null, error: null };
        },
        async insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return { error: null };
        },
      };
      return builder;
    },
  };
  return { client: client as never, reads, inserts };
}

const NOW = new Date("2026-10-12T17:00:00Z");
const STUDENT = { id: "11111111-1111-1111-1111-111111111111", email: "student@uri.edu" };
const DAISYS = "daisys-chicken-ice-cream";

const verifiedProfile: Result = {
  data: {
    role: "student",
    student_status: "current_student",
    campus_email_verified_at: "2026-09-01T00:00:00Z",
    display_name: "Nick Lockhart",
    username: "nick",
  },
  error: null,
};

async function issue(tables: Partial<Record<string, Result>>, overrides: Partial<Parameters<typeof issueStudentRewardPass>[0]> = {}) {
  const admin = mockAdmin(tables);
  const run = issueStudentRewardPass({ admin: admin.client, user: STUDENT, partnerId: DAISYS, now: NOW, ...overrides });
  return { admin, run };
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  expect((error as ApiError).code).toBe(code);
}

const added: string[] = [];
afterEach(() => {
  while (added.length) {
    const id = added.pop();
    const index = PARTNER_DIRECTORY.findIndex((p) => p.id === id);
    if (index >= 0) PARTNER_DIRECTORY.splice(index, 1);
  }
});

describe("issueStudentRewardPass", () => {
  it("issues a 60-second pass with the configured Daisy's offer for a verified student", async () => {
    const { admin, run } = await issue({ profiles: verifiedProfile });
    const pass = await run;
    expect(pass).toMatchObject({
      partnerId: DAISYS,
      partnerName: "Daisy\u2019s Chicken & Ice Cream",
      discountValue: "20% OFF",
      offerTitle: "Go on a quest for 20% OFF at Daisy\u2019s",
      verifiedLabel: "Verified URI Student",
      studentName: "Nick L.",
      issuedAt: NOW.toISOString(),
      serverNow: NOW.toISOString(),
    });
    expect(Date.parse(pass.expiresAt) - Date.parse(pass.issuedAt)).toBe(REWARD_PASS_TTL_SECONDS * 1000);
    expect(pass.passId).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(JSON.stringify(pass)).not.toContain(STUDENT.id);
    expect(JSON.stringify(pass)).not.toContain(STUDENT.email);
    expect(admin.inserts).toEqual([
      {
        table: "partner_engagement_events",
        row: { user_id: STUDENT.id, partner_id: DAISYS, event_type: "reward_pass_authorized" },
      },
    ]);
  });

  it("re-checks eligibility on refresh without counting another authorization", async () => {
    const { admin, run } = await issue({ profiles: verifiedProfile }, { refresh: true });
    await run;
    expect(admin.reads).toEqual(expect.arrayContaining(["profiles", "user_active_identities", "user_account_safety"]));
    expect(admin.inserts).toEqual([]);
  });

  it("denies an unverified student", async () => {
    const profile = { data: { ...(verifiedProfile.data as object), campus_email_verified_at: null }, error: null };
    const { admin, run } = await issue({ profiles: profile });
    await expectApiError(run, 403, REWARD_ERROR_CODES.verificationRequired);
    expect(admin.inserts).toEqual([]);
  });

  it("denies a verified account whose session email is not on the pilot domain", async () => {
    const { run } = await issue({ profiles: verifiedProfile }, { user: { id: STUDENT.id, email: "x@gmail.com" } });
    await expectApiError(run, 403, REWARD_ERROR_CODES.verificationRequired);
  });

  it("denies faculty/staff accounts", async () => {
    const profile = { data: { ...(verifiedProfile.data as object), role: "faculty_staff" }, error: null };
    const { run } = await issue({ profiles: profile });
    await expectApiError(run, 403, REWARD_ERROR_CODES.ineligible);
  });

  it("issues a watermarked admin preview pass without logging production engagement", async () => {
    for (const role of ["admin", "super_admin"] as const) {
      const profile = {
        data: {
          role,
          student_status: "not_student",
          campus_email_verified_at: null,
          display_name: "Ops Admin",
          username: "ops",
        },
        error: null,
      };
      const { admin, run } = await issue(
        { profiles: profile },
        { user: { id: STUDENT.id, email: "ops@gmail.com" } },
      );
      const pass = await run;
      expect(pass.demo).toBe(true);
      expect(pass.verifiedLabel).toMatch(/admin preview/i);
      expect(pass.verifiedLabel).toMatch(/not valid for redemption/i);
      expect(pass.passId.startsWith("ADMIN-")).toBe(true);
      expect(pass.studentName).toBe("Ops A.");
      expect(pass.partnerId).toBe(DAISYS);
      expect(admin.inserts).toEqual([]);
    }
  });

  it("denies accounts with no profile row or no chosen role", async () => {
    await expectApiError((await issue({ profiles: { data: null, error: null } })).run, 403, REWARD_ERROR_CODES.ineligible);
    const noRole = { data: { ...(verifiedProfile.data as object), role: null }, error: null };
    await expectApiError((await issue({ profiles: noRole })).run, 403, REWARD_ERROR_CODES.ineligible);
  });

  it("denies a student acting as a business profile", async () => {
    const { run } = await issue({
      profiles: verifiedProfile,
      user_active_identities: { data: { identity_type: "business" }, error: null },
    });
    await expectApiError(run, 403, REWARD_ERROR_CODES.businessProfile);
  });

  it("denies banned accounts", async () => {
    const { run } = await issue({
      profiles: verifiedProfile,
      user_account_safety: { data: { status: "banned", suspended_until: null }, error: null },
    });
    await expectApiError(run, 403, REWARD_ERROR_CODES.restricted);
  });

  it("fails closed when a verification lookup errors", async () => {
    const { run } = await issue({ profiles: verifiedProfile, user_account_safety: { data: null, error: { message: "boom" } } });
    await expectApiError(run, 500, "REWARD_VERIFICATION_FAILED");
  });

  it("returns coming soon for Sandbar without touching the database", async () => {
    const { admin, run } = await issue({ profiles: verifiedProfile }, { partnerId: "the-sandbar-cafe" });
    await expectApiError(run, 409, REWARD_ERROR_CODES.comingSoon);
    expect(admin.reads).toEqual([]);
  });

  it("refuses reward passes for free local business listings", async () => {
    const { admin, run } = await issue(
      { profiles: verifiedProfile },
      { partnerId: "international-pocket-cafe" },
    );
    await expectApiError(run, 409, REWARD_ERROR_CODES.comingSoon);
    expect(admin.reads).toEqual([]);
  });

  it("returns expired and temporarily unavailable from the offer configuration", async () => {
    PARTNER_DIRECTORY.push(
      definePartner({ id: "test-expired", slug: "test-expired", name: "Old", discountValue: "10% OFF", endsAt: "2026-10-01T00:00:00Z" }),
      definePartner({ id: "test-paused", slug: "test-paused", name: "Paused", discountValue: "10% OFF", rewardPaused: true }),
    );
    added.push("test-expired", "test-paused");
    await expectApiError((await issue({ profiles: verifiedProfile }, { partnerId: "test-expired" })).run, 410, REWARD_ERROR_CODES.expired);
    await expectApiError(
      (await issue({ profiles: verifiedProfile }, { partnerId: "test-paused" })).run,
      409,
      REWARD_ERROR_CODES.unavailable,
    );
  });

  it("returns not found for unknown or inactive partners", async () => {
    await expectApiError((await issue({}, { partnerId: "nope" })).run, 404, REWARD_ERROR_CODES.partnerNotFound);
    PARTNER_DIRECTORY.push(
      definePartner({ id: "test-inactive", slug: "test-inactive", name: "Gone", discountValue: "5%", isActive: false }),
    );
    added.push("test-inactive");
    await expectApiError((await issue({}, { partnerId: "test-inactive" })).run, 404, REWARD_ERROR_CODES.partnerNotFound);
  });
});

describe("App Review demo partner", () => {
  it("is not a real directory partner, so the merchant flow never resolves it", async () => {
    expect(PARTNER_DIRECTORY.some((partner) => partner.id === REVIEW_DEMO_PARTNER.id)).toBe(false);
    await expectApiError(
      (await issue({ profiles: verifiedProfile }, { partnerId: REVIEW_DEMO_PARTNER.id })).run,
      404,
      REWARD_ERROR_CODES.partnerNotFound,
    );
  });

  it("issues a watermarked demo pass with no student identity", () => {
    const pass = issueReviewDemoRewardPass({ now: NOW });
    expect(pass.demo).toBe(true);
    expect(pass.partnerId).toBe(REVIEW_DEMO_PARTNER.id);
    expect(pass.verifiedLabel).toMatch(/not valid for redemption/i);
    expect(pass.studentName).toBeNull();
    expect(pass.passId.startsWith("DEMO-")).toBe(true);
    expect(REVIEW_DEMO_PARTNER.name).toContain("(Demo)");
    expect(REVIEW_DEMO_PARTNER.rewardTerms).toMatch(/not valid for redemption/i);
  });

  it("gates the demo pass and demo listing on the review demo viewer check, without logging", () => {
    const route = readFileSync(join(process.cwd(), "app/api/partners/[partnerId]/reward-pass/route.ts"), "utf8");
    expect(route).toMatch(/isReviewDemoPartnerId\(partnerId\)\) \{\s*if \(!\(await viewerCanSeeReviewDemo\(userClient\)\)\)/);
    const issuer = readFileSync(join(process.cwd(), "lib/server/partnerRewards.ts"), "utf8");
    const demoIssuer = issuer.slice(issuer.indexOf("export function issueReviewDemoRewardPass"), issuer.indexOf("export async function issueStudentRewardPass"));
    expect(demoIssuer).not.toMatch(/recordPartnerEngagement|\.from\(/);
    const list = readFileSync(join(process.cwd(), "app/api/partners/route.ts"), "utf8");
    expect(list).toMatch(/if \(await viewerCanSeeReviewDemo\(userClient\)\) partners\.push\(REVIEW_DEMO_PARTNER\)/);
  });
});

describe("pass helpers", () => {
  it("formats an unambiguous pass id", () => {
    expect(generatePassId(Buffer.from([0, 1, 2, 3, 4, 5]))).toBe("ABC-DEF");
    expect(generatePassId()).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
  });

  it("shows first name and last initial only", () => {
    expect(passDisplayName("Nick Lockhart", "nick")).toBe("Nick L.");
    expect(passDisplayName("Cher", null)).toBe("Cher");
    expect(passDisplayName("  ", "rhody")).toBe("rhody");
    expect(passDisplayName(null, null)).toBeNull();
  });
});

describe("reward pass route contract", () => {
  const route = readFileSync(join(process.cwd(), "app/api/partners/[partnerId]/reward-pass/route.ts"), "utf8");

  it("authenticates from the session and never reads identity or role from the request body", () => {
    expect(route).toContain("requireAuthUser(request)");
    expect(route).toContain("user: { id: user.id, email: user.email ?? null }");
    expect(route).not.toMatch(/body\??\.(userId|user_id|role|email)/);
    expect(route).toContain('"Cache-Control", "no-store"');
    expect(route).toContain("enforceRateLimit");
  });

  it("does not let clients record pass authorizations through the events route", () => {
    const events = readFileSync(join(process.cwd(), "app/api/partners/[partnerId]/events/route.ts"), "utf8");
    expect(events).toContain("isClientReportablePartnerEvent");
    const engagement = readFileSync(join(process.cwd(), "lib/server/partnerEngagement.ts"), "utf8");
    expect(engagement).toMatch(/CLIENT_REPORTABLE_PARTNER_EVENTS = \["profile_view", "reward_view"\]/);
  });
});
