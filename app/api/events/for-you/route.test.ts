import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/http";

const requireAuthUser = vi.fn();

vi.mock("@/lib/server/supabase", () => ({
  requireAuthUser: (...args: unknown[]) => requireAuthUser(...args),
}));

import { GET } from "@/app/api/events/for-you/route";

function authedClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    user: { id: "user-1" },
    token: "token",
    userClient: {
      from(table: string) {
        expect(table).toBe("cq_basic_access");
        return {
          select() {
            return {
              eq(column: string, value: string) {
                expect(column).toBe("user_id");
                expect(value).toBe("user-1");
                return { maybeSingle: async () => result };
              },
            };
          },
        };
      },
    },
  };
}

describe("GET /api/events/for-you", () => {
  beforeEach(() => {
    requireAuthUser.mockReset();
  });

  it("rejects a logged-out caller before reading entitlements", async () => {
    requireAuthUser.mockRejectedValue(new ApiError(401, "Invalid or expired token.", "UNAUTHORIZED"));
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.data).toBeUndefined();
  });

  it("returns no personalized recommendations without an active Basic window", async () => {
    requireAuthUser.mockResolvedValue(authedClient({ data: null, error: null }));
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("UPGRADE_REQUIRED");
    expect(body.data).toBeUndefined();
    expect(body.events).toBeUndefined();
    expect(body.recommendations).toBeUndefined();
  });

  it("recognizes the same Basic row from either CampusQuest domain", async () => {
    const starts = new Date(Date.now() - 60_000).toISOString();
    const ends = new Date(Date.now() + 60_000).toISOString();
    requireAuthUser.mockResolvedValue(
      authedClient({
        data: { starts_at: starts, ends_at: ends, early_access: false },
        error: null,
      }),
    );
    const app = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    const join = await GET(new Request("https://www.joincampusquest.com/api/events/for-you"));
    expect(app.status).toBe(200);
    expect(join.status).toBe(200);
    expect(await app.json()).toEqual(await join.json());
  });

  it("returns upgrade required when Basic has expired", async () => {
    requireAuthUser.mockResolvedValue(
      authedClient({
        data: {
          starts_at: "2026-01-01T00:00:00.000Z",
          ends_at: "2026-02-01T00:00:00.000Z",
          early_access: true,
        },
        error: null,
      }),
    );
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("UPGRADE_REQUIRED");
  });

  it("switches from upgrade required to allowed when Basic becomes active", async () => {
    requireAuthUser.mockResolvedValueOnce(authedClient({ data: null, error: null }));
    const before = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(before.status).toBe(403);

    const starts = new Date(Date.now() - 60_000).toISOString();
    const ends = new Date(Date.now() + 60_000).toISOString();
    requireAuthUser.mockResolvedValueOnce(
      authedClient({
        data: { starts_at: starts, ends_at: ends, early_access: false },
        error: null,
      }),
    );
    const after = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(after.status).toBe(200);
    expect((await after.json()).data).toEqual({ entitled: true });
  });

  it("allows For You when the shared Basic window is active", async () => {
    const starts = new Date(Date.now() - 60_000).toISOString();
    const ends = new Date(Date.now() + 60_000).toISOString();
    requireAuthUser.mockResolvedValue(
      authedClient({
        data: { starts_at: starts, ends_at: ends, early_access: false },
        error: null,
      }),
    );
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({ entitled: true });
    expect(body.data.recommendations).toBeUndefined();
    expect(body.data.events).toBeUndefined();
  });

  it("does not allow For You when the entitlement row cannot be read", async () => {
    requireAuthUser.mockResolvedValue(authedClient({ data: null, error: { message: "timeout" } }));
    const response = await GET(new Request("https://campusquestapp.com/api/events/for-you"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ENTITLEMENT_UNKNOWN");
  });
});
