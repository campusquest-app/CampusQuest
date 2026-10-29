import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  URI_HALLOWEEN_ANON_BATCH_ID,
  URI_HALLOWEEN_ANON_POSTS,
  anonymousBatchHostError,
  assertAnonymousBatchCopy,
  classifyAnonymousBatchFailure,
  runAnonymousBatch,
  type AnonymousBatchItem,
} from "@/lib/anonymousPostBatch";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("URI anonymous batch copy", () => {
  it("keeps ten unique posts inside the caption limit", () => {
    expect(URI_HALLOWEEN_ANON_POSTS).toHaveLength(10);
    assertAnonymousBatchCopy();
    for (const item of URI_HALLOWEEN_ANON_POSTS) {
      expect(item.body.length).toBeGreaterThan(0);
      expect(item.body.length).toBeLessThanOrEqual(300);
      expect(item.idempotencyKey.startsWith(`${URI_HALLOWEEN_ANON_BATCH_ID}:`)).toBe(true);
    }
    expect(URI_HALLOWEEN_ANON_POSTS[0]?.body).toContain("batman doesn\u2019t");
    expect(URI_HALLOWEEN_ANON_POSTS[3]?.body.startsWith("\u201cwhat are you supposed to be\u201d")).toBe(true);
    expect(URI_HALLOWEEN_ANON_POSTS[8]?.body.startsWith("\u201cwe\u2019re leaving in five\u201d")).toBe(true);
  });

  it("accepts only the production campus host", () => {
    expect(anonymousBatchHostError("campusquestapp.com")).toBeNull();
    expect(anonymousBatchHostError("www.campusquestapp.com")).toBeNull();
    expect(anonymousBatchHostError("localhost:3000")).toMatch(/campusquestapp.com/);
    expect(anonymousBatchHostError("campus-quest-mli4-preview.vercel.app")).toMatch(/campusquestapp.com/);
  });

  it("stops on the rate limit and keeps the remaining posts", async () => {
    const items = URI_HALLOWEEN_ANON_POSTS.slice(0, 4);
    const report = await runAnonymousBatch(items, async (item) => {
      if (item.itemKey === "03") {
        return classifyAnonymousBatchFailure(429, "RATE_LIMITED", "Too many requests.");
      }
      return { type: "published", postId: `post-${item.itemKey}`, idempotent: false };
    });
    expect(report.published.map((item) => item.itemKey)).toEqual(["01", "02"]);
    expect(report.failed).toEqual([]);
    expect(report.remaining.map((item) => item.itemKey)).toEqual(["03", "04"]);
    expect(report.stopped?.code).toBe("RATE_LIMITED");
  });

  it("keeps going after one item fails", async () => {
    const report = await runAnonymousBatch(URI_HALLOWEEN_ANON_POSTS, async (item) => {
      if (item.itemKey === "04") {
        return classifyAnonymousBatchFailure(400, "QUAD_POST_CREATE_FAILED", "Could not create post.");
      }
      return { type: "published", postId: `post-${item.itemKey}`, idempotent: item.itemKey === "02" };
    });
    expect(report.published).toHaveLength(9);
    expect(report.published.find((item) => item.itemKey === "02")?.idempotent).toBe(true);
    expect(report.failed).toEqual([
      {
        itemKey: "04",
        status: 400,
        code: "QUAD_POST_CREATE_FAILED",
        message: "Could not create post.",
      },
    ]);
    expect(report.remaining).toEqual([]);
    expect(report.stopped).toBeNull();
  });

  it("does not publish a consumed item again", async () => {
    const [first] = URI_HALLOWEEN_ANON_POSTS as unknown as AnonymousBatchItem[];
    const report = await runAnonymousBatch([first!], async () => ({ type: "already_removed" }));
    expect(report.published).toEqual([]);
    expect(report.alreadyRemoved).toEqual([{ itemKey: "01" }]);
  });
});

describe("anonymous batch privacy contracts", () => {
  const migration = read("supabase/migrations/20261029223000_anonymous_publish_receipts.sql");
  const createRoute = read("app/api/quad/posts/route.ts");
  const batchRoute = read("app/api/me/quad/anonymous-post-batch/route.ts");

  it("keeps the receipt table private", () => {
    expect(migration).toContain("revoke all on table public.quad_publish_receipts from public, anon, authenticated");
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("grant select");
    expect(createRoute).toContain("publishBatchId === URI_HALLOWEEN_ANON_BATCH_ID");
    expect(createRoute).not.toContain("publish_batch_id");
  });

  it("publishes and deletes only as the authenticated owner", () => {
    expect(batchRoute).toContain("requireAuthUser");
    expect(batchRoute).toContain("assertAnonymousNoticeAccepted");
    expect(batchRoute).toContain("assertAccountCanSocialize");
    expect(batchRoute).toContain("requireVerifiedSchoolForCoreAccess");
    expect(batchRoute).toContain("isAdmin: false");
    expect(batchRoute).toContain("deleteQuadPost");
    expect(batchRoute).toContain(".strict()");
    expect(batchRoute).not.toContain("body.userId");
    expect(batchRoute).not.toContain("searchParams.get(\"userId\")");
    expect(batchRoute).not.toContain("auth.user.email");
    expect(batchRoute).not.toContain("createAdminClient().auth.admin");
  });
});
