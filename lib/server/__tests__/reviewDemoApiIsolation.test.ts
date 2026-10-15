import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthUser = vi.fn();
const createAdminClient = vi.fn(() => {
  throw new Error("service-role client must not run for review-demo-only paths");
});

vi.mock("@/lib/server/supabase", () => ({
  requireAuthUser: (...args: unknown[]) => requireAuthUser(...args),
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}));

import { GET as getPartners } from "@/app/api/partners/route";
import { POST as postPartnerEvents } from "@/app/api/partners/[partnerId]/events/route";
import { POST as postRewardPass } from "@/app/api/partners/[partnerId]/reward-pass/route";
import { GET as getReviewDemoPins } from "@/app/api/quests/map-pins/review-demo/route";
import { REVIEW_DEMO_PARTNER } from "@/lib/partners/reviewDemoPartner";

function session(
  canSeeDemo: boolean,
  fromImpl?: (table: string) => unknown,
): {
  user: { id: string; email: string };
  userClient: { rpc: (fn: string) => Promise<{ data: boolean; error: null }>; from: (table: string) => unknown };
} {
  return {
    user: {
      id: canSeeDemo ? "qa-1" : "student-1",
      email: canSeeDemo ? "qa_signup@campusquestapp.com" : "ram@uri.edu",
    },
    userClient: {
      rpc: async (fn: string) => {
        expect(fn).toBe("cq_can_view_review_demo");
        return { data: canSeeDemo, error: null };
      },
      from:
        fromImpl ??
        (() => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        })),
    },
  };
}

describe("review demo API isolation", () => {
  beforeEach(() => {
    requireAuthUser.mockReset();
    createAdminClient.mockClear();
  });

  it("does not list the demo café to a student", async () => {
    requireAuthUser.mockResolvedValue(session(false));
    const response = await getPartners(new Request("https://campusquestapp.com/api/partners"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect((body.data.partners as { id: string }[]).some((partner) => partner.id === REVIEW_DEMO_PARTNER.id)).toBe(
      false,
    );
  });

  it("lists the demo café only to the reviewer", async () => {
    requireAuthUser.mockResolvedValue(session(true));
    const response = await getPartners(new Request("https://campusquestapp.com/api/partners"));
    const body = await response.json();
    expect((body.data.partners as { id: string }[]).some((partner) => partner.id === REVIEW_DEMO_PARTNER.id)).toBe(
      true,
    );
  });

  it("404s a student who requests the demo pass by known id", async () => {
    requireAuthUser.mockResolvedValue(session(false));
    const response = await postRewardPass(
      new Request("https://campusquestapp.com/api/partners/campusquest-demo-cafe/reward-pass", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ partnerId: REVIEW_DEMO_PARTNER.id }) },
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("PARTNER_NOT_FOUND");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("issues a watermarked demo pass to the reviewer without a database write", async () => {
    requireAuthUser.mockResolvedValue(session(true));
    const response = await postRewardPass(
      new Request("https://campusquestapp.com/api/partners/campusquest-demo-cafe/reward-pass", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ partnerId: REVIEW_DEMO_PARTNER.id }) },
    );
    expect(response.status).toBe(200);
    const pass = (await response.json()).data.pass as { demo?: boolean; verifiedLabel: string };
    expect(pass.demo).toBe(true);
    expect(pass.verifiedLabel).toMatch(/not valid for redemption/i);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns empty demo map pins to a student without querying events", async () => {
    let queried = false;
    requireAuthUser.mockResolvedValue(
      session(false, () => {
        queried = true;
        return { select: () => ({ eq: () => ({ gte: async () => ({ data: [{ id: "leak" }], error: null }) }) }) };
      }),
    );
    const response = await getReviewDemoPins(new Request("https://campusquestapp.com/api/quests/map-pins/review-demo"));
    expect(await response.json()).toMatchObject({ data: { eligible: false, groups: [] } });
    expect(queried).toBe(false);
  });

  it("reads demo map pins through the reviewer session, never the service role", async () => {
    requireAuthUser.mockResolvedValue(session(true));
    const response = await getReviewDemoPins(new Request("https://campusquestapp.com/api/quests/map-pins/review-demo"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.eligible).toBe(true);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("does not record partner engagement for the demo café", async () => {
    requireAuthUser.mockResolvedValue(session(true));
    const response = await postPartnerEvents(
      new Request("https://campusquestapp.com/api/partners/campusquest-demo-cafe/events", {
        method: "POST",
        body: JSON.stringify({ type: "reward_view" }),
      }),
      { params: Promise.resolve({ partnerId: REVIEW_DEMO_PARTNER.id }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { recorded: false } });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("404s a student who posts demo café analytics", async () => {
    requireAuthUser.mockResolvedValue(session(false));
    const response = await postPartnerEvents(
      new Request("https://campusquestapp.com/api/partners/campusquest-demo-cafe/events", {
        method: "POST",
        body: JSON.stringify({ type: "reward_view" }),
      }),
      { params: Promise.resolve({ partnerId: REVIEW_DEMO_PARTNER.id }) },
    );
    expect(response.status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
