import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listMutualBlockedUserIds } from "@/lib/server/blockedUsers";

describe("blocked user discovery", () => {
  it("builds a mutual blocked-id set from both directions", async () => {
    const client = {
      from: () => ({
        select: () => ({
          or: async () => ({
            data: [
              { blocker_id: "me", blocked_id: "them" },
              { blocker_id: "other", blocked_id: "me" },
            ],
            error: null,
          }),
        }),
      }),
    };
    const set = await listMutualBlockedUserIds(client as never, "me");
    expect(Array.from(set).sort()).toEqual(["other", "them"]);
  });

  it("wires people search and notification listing through the mutual block helper", () => {
    const root = process.cwd();
    const peopleSearch = readFileSync(join(root, "lib/server/friendsGuildsSearch.ts"), "utf8");
    const notifications = readFileSync(join(root, "lib/server/notifications.ts"), "utf8");
    expect(peopleSearch).toContain("listMutualBlockedUserIds");
    expect(peopleSearch).toContain("!blockedIds.has(row.id)");
    expect(notifications).toContain("listMutualBlockedUserIds");
    expect(notifications).toContain("!blockedIds.has(row.actor_id)");
  });
});
