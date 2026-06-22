import { describe, expect, it } from "vitest";
import { isAdminQuestsSchemaError } from "@/lib/server/adminQuests";

describe("isAdminQuestsSchemaError", () => {
  it("detects PostgREST schema cache misses", () => {
    expect(
      isAdminQuestsSchemaError({
        code: "PGRST205",
        message: "Could not find the table 'public.admin_quests' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isAdminQuestsSchemaError({
        message: "Could not find the table 'public.admin_quests' in the schema cache",
      }),
    ).toBe(true);
  });

  it("detects missing relation messages", () => {
    expect(
      isAdminQuestsSchemaError({
        message: 'relation "public.admin_quest_completions" does not exist',
      }),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isAdminQuestsSchemaError({ message: "permission denied for table admin_quests" })).toBe(false);
  });
});
