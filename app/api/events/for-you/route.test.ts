import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/http";

const requireAuthUser = vi.fn();

vi.mock("@/lib/server/supabase", () => ({
  requireAuthUser: (...args: unknown[]) => requireAuthUser(...args),
}));

import { GET } from "@/app/api/events/for-you/route";

function authedUser(id = "user-1") {
  return {
    user: { id },
    token: "token",
    userClient: {
      from() {
        throw new Error("For You must not read cq_basic_access");
      },
    },
  };
}

describe("GET /api/events/for-you", () => {
  beforeEach(() => {
    requireAuthUser.mockReset();
  });

  it("rejects a logged-out caller", async () => {
    requireAuthUser.mockRejectedValue(new ApiError(401, "Invalid or expired token.", "UNAUTHORIZED"));
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.data).toBeUndefined();
  });

  it("allows an authenticated user who has no cq_basic_access row", async () => {
    requireAuthUser.mockResolvedValue(authedUser());
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({ entitled: true });
    expect(body.error).toBeUndefined();
    expect(body.data.recommendations).toBeUndefined();
    expect(body.data.events).toBeUndefined();
  });

  it("does not return upgrade or entitlement errors", async () => {
    requireAuthUser.mockResolvedValue(authedUser("user-without-basic"));
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain("UPGRADE_REQUIRED");
    expect(JSON.stringify(body)).not.toContain("ENTITLEMENT_UNKNOWN");
    expect(JSON.stringify(body)).not.toContain("CampusQuest Basic");
  });
});
