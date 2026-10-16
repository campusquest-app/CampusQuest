import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { USER_DATA_DELETION_STEPS } from "@/lib/server/adminUserDeletion";

describe("account deletion pipeline", () => {
  const shared = readFileSync(join(process.cwd(), "lib/server/accountDeletion.ts"), "utf8");
  const self = readFileSync(join(process.cwd(), "lib/server/selfAccountDeletion.ts"), "utf8");
  const admin = readFileSync(join(process.cwd(), "lib/server/adminUserDeletion.ts"), "utf8");

  it("uses one orchestration order for self-serve and admin deletion", () => {
    expect(self).toContain("executeAccountDeletion");
    expect(admin).toContain("executeAccountDeletion");
    expect(shared).toContain("collectUserStorageObjects");
    expect(shared).toContain("admin.auth.admin.deleteUser");
    expect(shared).toContain("removeUserStorageObjects");
    expect(shared).toContain("deleteRelatedUserData");
    const body = shared.slice(shared.indexOf("export async function executeAccountDeletion"));
    expect(body.indexOf("collectUserStorageObjects")).toBeLessThan(body.indexOf("deleteUser"));
    expect(body.indexOf("deleteUser")).toBeLessThan(body.indexOf("removeUserStorageObjects"));
  });

  it("cleans push tokens, private profile rows, and uploaded media references", () => {
    const tables = USER_DATA_DELETION_STEPS.map((step) => step.table);
    expect(tables).toContain("push_devices");
    expect(tables).toContain("user_push_settings");
    expect(tables).toContain("profile_private");
    expect(tables).toContain("quad_posts");
    expect(tables).toContain("quad_post_media");
    expect(tables).toContain("campus_memories");
    expect(tables).toContain("direct_messages");
  });
});
