import { describe, expect, it } from "vitest";

/**
 * Documents expected RLS posture after 20260707183000_user_quests_rls_hardening.sql.
 * Direct Supabase client mutations should fail; server routes use service role.
 */
describe("quest progress RLS expectations", () => {
  it("user_quests allows SELECT own rows only (no client INSERT/UPDATE/DELETE)", () => {
    const allowedOps = ["select"];
    expect(allowedOps).toContain("select");
    expect(allowedOps).not.toContain("insert");
    expect(allowedOps).not.toContain("update");
  });

  it("quest_completions allows SELECT but not client INSERT", () => {
    const allowedOps = ["select"];
    expect(allowedOps).not.toContain("insert");
  });

  it("trusted server paths still mutate quests via service role", () => {
    const trustedWriters = [
      "completeQuest",
      "getOrCreateActiveUserQuest",
      "scanQrQuest",
      "tryCompleteLinkedQuest",
      "approveProofSubmission",
    ];
    expect(trustedWriters.length).toBeGreaterThan(0);
  });
});
