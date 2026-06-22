import { describe, expect, it } from "vitest";
import { searchPeopleProfiles, searchPublicGuilds } from "@/lib/server/friendsGuildsSearch";

describe("friendsGuildsSearch", () => {
  it("returns people results for single-character queries", async () => {
    const userClient = {
      from: (table: string) => {
        if (table === "student_connections") {
          return {
            select: () => ({
              or: async () => ({ data: [], error: null }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              neq: () => ({
                or: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
              in: () => ({
                or: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "user_stats") {
          return {
            select: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await expect(
      searchPeopleProfiles({
        userClient: userClient as never,
        userId: "user-1",
        query: "n",
      }),
    ).resolves.toEqual([]);
  });

  it("returns empty guild results for short queries", async () => {
    await expect(
      searchPublicGuilds({
        userClient: {} as never,
        query: "l",
      }),
    ).resolves.toEqual([]);
  });
});
