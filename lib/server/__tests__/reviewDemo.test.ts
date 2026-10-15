import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => {
    throw new Error("tests must pass an explicit client");
  },
}));

import {
  isMissingReviewDemoColumnError,
  isReviewDemoViewerProfile,
  reviewDemoRowVisibleUnderRls,
  runExcludingReviewDemo,
  viewerCanSeeReviewDemo,
} from "@/lib/server/reviewDemo";
import { listAnalyticsExcludedUserIds, listHiddenUserIds } from "@/lib/server/qaTestAccount";

type Row = Record<string, unknown>;

const rows: Row[] = [
  { id: "student-1", role: "student", is_hidden: false, is_test_user: false, is_review_demo: false },
  { id: "qa-1", role: "qa", is_hidden: true, is_test_user: true, is_review_demo: false },
  { id: "demo-1", role: "student", is_hidden: false, is_test_user: false, is_review_demo: true },
];

/** Profiles stub that evaluates PostgREST `or` filters of the form `col.eq.value`. */
function profilesClient(args: { viewerCanSeeDemo: boolean | "error"; demoColumnMissing?: boolean }) {
  const matches = (row: Row, filter: string) =>
    filter.split(",").some((clause) => {
      const [col, , value] = clause.split(".");
      return String(row[col]) === value;
    });
  return {
    rpc: vi.fn(async () =>
      args.viewerCanSeeDemo === "error"
        ? { data: null, error: { message: "boom" } }
        : { data: args.viewerCanSeeDemo, error: null },
    ),
    from: () => ({
      select: () => ({
        or: async (filter: string) => {
          if (args.demoColumnMissing && filter.includes("is_review_demo")) {
            return { data: null, error: { code: "42703", message: "column profiles.is_review_demo does not exist" } };
          }
          return { data: rows.filter((row) => matches(row, filter)), error: null };
        },
        eq: async (col: string, value: unknown) => ({ data: rows.filter((row) => row[col] === value), error: null }),
      }),
    }),
  } as never;
}

describe("review demo viewer rule", () => {
  it("allows only QA test accounts that are not demo profiles themselves", () => {
    expect(isReviewDemoViewerProfile({ role: "qa", is_test_user: true, is_review_demo: false })).toBe(true);
    expect(isReviewDemoViewerProfile({ role: "qa", is_test_user: false })).toBe(false);
    expect(isReviewDemoViewerProfile({ role: "student", is_test_user: true })).toBe(false);
    expect(isReviewDemoViewerProfile({ role: "qa", is_test_user: true, is_review_demo: true })).toBe(false);
    expect(isReviewDemoViewerProfile(null)).toBe(false);
  });

  it("fails closed when the viewer RPC errors or the client has no rpc", async () => {
    expect(await viewerCanSeeReviewDemo(profilesClient({ viewerCanSeeDemo: "error" }))).toBe(false);
    expect(await viewerCanSeeReviewDemo({} as never)).toBe(false);
    expect(await viewerCanSeeReviewDemo(null)).toBe(false);
  });
});

describe("restrictive RLS: students cannot read demo rows by id", () => {
  const demoPost = { is_review_demo: true };
  const publicPost = { is_review_demo: false };
  const student = { role: "student", is_test_user: false, is_review_demo: false };
  const faculty = { role: "faculty_staff", is_test_user: false, is_review_demo: false };
  const reviewer = { role: "qa", is_test_user: true, is_review_demo: false };
  const demoPersona = { role: "student", is_test_user: false, is_review_demo: true };

  it("hides demo rows from students, faculty, anonymous sessions, and demo personas", () => {
    expect(reviewDemoRowVisibleUnderRls(demoPost, student)).toBe(false);
    expect(reviewDemoRowVisibleUnderRls(demoPost, faculty)).toBe(false);
    expect(reviewDemoRowVisibleUnderRls(demoPost, null)).toBe(false);
    expect(reviewDemoRowVisibleUnderRls(demoPost, demoPersona)).toBe(false);
  });

  it("shows demo rows only to the designated QA reviewer session", () => {
    expect(reviewDemoRowVisibleUnderRls(demoPost, reviewer)).toBe(true);
  });

  it("does not hide ordinary campus rows from students", () => {
    expect(reviewDemoRowVisibleUnderRls(publicPost, student)).toBe(true);
    expect(reviewDemoRowVisibleUnderRls({ is_review_demo: null }, student)).toBe(true);
  });
});

describe("listHiddenUserIds with demo profiles", () => {
  it("hides demo profiles from non-reviewer and service-role clients", async () => {
    const ids = await listHiddenUserIds(profilesClient({ viewerCanSeeDemo: false }));
    expect(ids).toEqual(new Set(["qa-1", "demo-1"]));
  });

  it("keeps demo profiles visible for the reviewer's own session, still hiding QA accounts", async () => {
    const ids = await listHiddenUserIds(profilesClient({ viewerCanSeeDemo: true }));
    expect(ids).toEqual(new Set(["qa-1"]));
  });

  it("hides demo profiles when the viewer check fails", async () => {
    const ids = await listHiddenUserIds(profilesClient({ viewerCanSeeDemo: "error" }));
    expect(ids.has("demo-1")).toBe(true);
  });

  it("falls back to the legacy filter before the column exists", async () => {
    const ids = await listHiddenUserIds(profilesClient({ viewerCanSeeDemo: false, demoColumnMissing: true }));
    expect(ids).toEqual(new Set(["qa-1"]));
  });

  it("excludes demo profiles from analytics", async () => {
    const ids = await listAnalyticsExcludedUserIds(profilesClient({ viewerCanSeeDemo: true }));
    expect(ids.has("demo-1")).toBe(true);
    expect(ids.has("student-1")).toBe(false);
  });
});

describe("runExcludingReviewDemo", () => {
  it("applies the filter, retrying without it only for a missing column", async () => {
    const build = vi.fn(async (applyDemoFilter: boolean) =>
      applyDemoFilter
        ? { data: null, error: { code: "42703", message: "column campus_events.is_review_demo does not exist" } }
        : { data: [], error: null },
    );
    const result = await runExcludingReviewDemo(build);
    expect(build).toHaveBeenNthCalledWith(1, true);
    expect(build).toHaveBeenNthCalledWith(2, false);
    expect(result.error).toBeNull();
  });

  it("does not drop the filter for unrelated errors", async () => {
    const build = vi.fn(async () => ({ data: null, error: { code: "42501", message: "permission denied" } }));
    await runExcludingReviewDemo(build);
    expect(build).toHaveBeenCalledTimes(1);
    expect(isMissingReviewDemoColumnError({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

describe("service-role surfaces exclude demo rows", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it.each([
    "lib/server/groupedMapLocations.ts",
    "lib/server/entityTagSearch.ts",
    "lib/server/postTagService.ts",
    "lib/server/studentEngagementAnalytics.ts",
  ])("%s filters is_review_demo", (file) => {
    expect(read(file)).toMatch(/runExcludingReviewDemo/);
  });

  it("serves demo map pins only through the viewer-scoped route", () => {
    const route = read("app/api/quests/map-pins/review-demo/route.ts");
    expect(route).toMatch(/requireAuthUser/);
    expect(route).toMatch(/viewerCanSeeReviewDemo\(userClient\)/);
    expect(route).not.toMatch(/createAdminClient/);
  });

  it("migration keeps demo isolation restrictive and trigger-protected", () => {
    const sql = read("supabase/migrations/20261015120000_review_demo_isolation.sql");
    expect(sql.match(/as restrictive for select/g)?.length).toBe(4);
    expect(sql).toMatch(/trg_protect_is_review_demo/);
    expect(sql).toMatch(/cq_can_view_review_demo/);
    expect(sql).toContain("is_review_demo = false or (select public.cq_can_view_review_demo())");
    expect(sql).toMatch(/p\.role = 'qa' and p\.is_test_user is true and p\.is_review_demo is not true/);
    expect(sql).toMatch(/cq_is_trusted_writer\(\)/);
    expect(sql).toMatch(/add column if not exists is_review_demo boolean not null default false/);
    const executable = sql.replace(/--[^\n]*/g, "");
    expect(executable).not.toMatch(/disable\s+row level security/i);
    expect(executable).not.toMatch(/drop\s+table/i);
    expect(executable.match(/drop policy if exists "review demo rows visible to qa only"/g)?.length).toBe(4);
    expect(executable.replace(/drop policy if exists "review demo rows visible to qa only"/g, "")).not.toMatch(
      /drop\s+policy/i,
    );
  });

  it("social gates check the acting reviewer, not the banned demo target", () => {
    const safety = read("lib/server/accountSafety.ts");
    expect(safety).toMatch(
      /export async function assertAccountCanSocialize\(userClient: SupabaseClientLike, userId: string\)/,
    );
    expect(read("lib/server/messaging.ts")).toMatch(/await assertAccountCanSocialize\(userClient, userId\)/);
    expect(read("lib/reviewDemoSeed.ts")).not.toMatch(/\.from\(["']user_account_safety["']\)/);
  });

  it("does not leak demo map pins through the shared map-pins cache path", () => {
    const client = read("lib/client/mapLocationGroupsClient.ts");
    expect(client).toMatch(/\/api\/quests\/map-pins\/review-demo/);
    expect(read("lib/server/groupedMapLocations.ts")).toMatch(/listReviewDemoMapLocations/);
  });

  it("refetches onboarding preferences after role selection so the reviewer is not bounced", () => {
    const dashboard = read("components/Dashboard.tsx");
    expect(dashboard).toMatch(/destinationRoute === "role_selection"/);
    expect(dashboard).toMatch(/\/api\/me\/onboarding-preferences/);
  });
});
