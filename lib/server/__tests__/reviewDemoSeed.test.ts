import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => {
    throw new Error("tests must pass an explicit client");
  },
}));

import { listReviewDemoMapLocations } from "@/lib/server/groupedMapLocations";
import {
  REVIEW_DEMO_DM_MESSAGES,
  REVIEW_DEMO_EVENTS,
  REVIEW_DEMO_IDS,
  REVIEW_DEMO_POSTS,
  REVIEW_DEMO_PROFILES,
  assertDesignatedReviewer,
  missingReviewDemoConnections,
  missingReviewDemoNotifications,
  shouldInsertSeedMessages,
} from "@/lib/reviewDemoSeed";

describe("review demo fixtures", () => {
  it("ships 5–8 events, 5 posts, and 2–3 fictional profiles", () => {
    expect(REVIEW_DEMO_EVENTS.length).toBeGreaterThanOrEqual(5);
    expect(REVIEW_DEMO_EVENTS.length).toBeLessThanOrEqual(8);
    expect(REVIEW_DEMO_POSTS).toHaveLength(5);
    expect(REVIEW_DEMO_PROFILES.length).toBeGreaterThanOrEqual(2);
    expect(REVIEW_DEMO_PROFILES.length).toBeLessThanOrEqual(3);
    expect(REVIEW_DEMO_IDS.events).toHaveLength(REVIEW_DEMO_EVENTS.length);
    expect(REVIEW_DEMO_IDS.posts).toHaveLength(REVIEW_DEMO_POSTS.length);
  });

  it("labels every piece of demo content", () => {
    for (const event of REVIEW_DEMO_EVENTS) expect(event.title.startsWith("[Demo]")).toBe(true);
    for (const post of REVIEW_DEMO_POSTS) expect(post.body.startsWith("[Demo]")).toBe(true);
    for (const profile of REVIEW_DEMO_PROFILES) {
      expect(profile.displayName).toContain("(Demo)");
      expect(profile.username.startsWith("cqdemo_")).toBe(true);
      expect(profile.email.endsWith("@example.com")).toBe(true);
      expect(profile.username.length).toBeLessThanOrEqual(24);
    }
    for (const post of REVIEW_DEMO_POSTS) expect(post.body.length).toBeLessThanOrEqual(300);
  });

  it("keeps social fixtures on the reviewer + fictional demo graph only", () => {
    expect(REVIEW_DEMO_DM_MESSAGES.length).toBeGreaterThanOrEqual(1);
    expect(REVIEW_DEMO_DM_MESSAGES.every((message) => /demo/i.test(message.content))).toBe(true);
    const seed = readFileSync(path.join(process.cwd(), "lib/reviewDemoSeed.ts"), "utf8");
    expect(seed).toMatch(/requester_id: args\.demo\.jordan[\s\S]*status: "accepted"/);
    expect(seed).toMatch(/requester_id: args\.demo\.priya[\s\S]*status: "pending"/);
    expect(seed).toMatch(/user_id: reviewerUserId/);
    expect(seed).not.toMatch(/user_id: "student-/);
    expect(seed).toMatch(/type: "friend_request"/);
    expect(seed).toMatch(/type: "direct_message"/);
  });

  it("gap-fills missing social fixtures without resetting completed reviewer actions", () => {
    const reviewer = "qa-1";
    const jordan = "demo-jordan";
    const priya = "demo-priya";
    expect(
      missingReviewDemoConnections({
        existing: [],
        demo: { jordan, priya },
        reviewerUserId: reviewer,
      }),
    ).toEqual([
      { requester_id: jordan, addressee_id: reviewer, status: "accepted" },
      { requester_id: priya, addressee_id: reviewer, status: "pending" },
    ]);
    expect(
      missingReviewDemoConnections({
        existing: [
          { requester_id: jordan, addressee_id: reviewer, status: "accepted" },
          { requester_id: priya, addressee_id: reviewer, status: "declined" },
        ],
        demo: { jordan, priya },
        reviewerUserId: reviewer,
      }),
    ).toEqual([]);
    expect(shouldInsertSeedMessages(0)).toBe(true);
    expect(shouldInsertSeedMessages(2)).toBe(false);
    expect(
      missingReviewDemoNotifications(
        [{ type: "friend_request", actor_id: priya }],
        [
          { type: "friend_request", actor_id: priya },
          { type: "direct_message", actor_id: jordan },
        ],
      ),
    ).toEqual([{ type: "direct_message", actor_id: jordan }]);
  });

  it("bans demo auth users without writing user_account_safety or rotating passwords", () => {
    const seed = readFileSync(path.join(process.cwd(), "lib/reviewDemoSeed.ts"), "utf8");
    const ensure = seed.slice(seed.indexOf("async function ensureDemoProfiles"), seed.indexOf("export async function seedReviewDemoContent"));
    const seedFn = seed.slice(
      seed.indexOf("export async function seedReviewDemoContent"),
      seed.indexOf("export async function removeReviewDemoContent"),
    );
    expect(ensure).toMatch(/ban_duration: BAN_DURATION/);
    expect(ensure).toMatch(/updateUserById\(userId, \{ ban_duration: BAN_DURATION \}\)/);
    expect(ensure).not.toMatch(/\.from\(["']user_account_safety["']\)/);
    expect(ensure).not.toMatch(/setAccountSafetyStatus/);
    expect(ensure).not.toMatch(/updateUserById\([^)]*password/);
    expect(seedFn).not.toMatch(/\.delete\(\)/);
    expect(seedFn).not.toMatch(/blocked_users/);
    expect(seedFn).not.toMatch(/\.from\(["']user_account_safety["']\)/);
  });

  it("refuses to seed against a normal student account", async () => {
    const admin = {
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: { email: "student@uri.edu" } }, error: null }),
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { role: "student", is_test_user: false, is_review_demo: false },
              error: null,
            }),
          }),
        }),
      }),
    };
    await expect(assertDesignatedReviewer(admin as never, "student-1", "qa_signup@campusquestapp.com")).rejects.toThrow(
      /non-designated account/,
    );
  });

  it("places every demo event on a map marker", async () => {
    const now = Date.now();
    const rows = REVIEW_DEMO_EVENTS.map((event, index) => ({
      id: REVIEW_DEMO_IDS.events[index],
      title: event.title,
      starts_at: new Date(now + event.startOffsetMs).toISOString(),
      ends_at: new Date(now + event.startOffsetMs + event.durationMs).toISOString(),
      location_name: event.locationName,
      is_cancelled: false,
      host_organization_id: null,
      student_organizations: null,
    }));
    const query = {
      select: () => query,
      eq: () => query,
      gte: () => Promise.resolve({ data: rows, error: null }),
    };
    const groups = await listReviewDemoMapLocations({ from: () => query } as never);
    const placed = groups.flatMap((group) => group.events.map((event) => event.id));
    expect(placed.sort()).toEqual([...REVIEW_DEMO_IDS.events].sort());
  });
});
