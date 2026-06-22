import { describe, expect, it } from "vitest";
import { searchPeopleProfiles, searchPublicGuilds } from "@/lib/server/friendsGuildsSearch";

describe("friendsGuildsSearch", () => {
  it("returns empty people results for short queries", async () => {
    const userClient = {
      from: () => ({
        select: () => ({
          neq: () => ({
            or: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
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
