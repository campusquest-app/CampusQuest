import { describe, expect, it } from "vitest";
import { isPinnedDmUsersSchemaError } from "@/lib/server/pinnedDmUsers";

describe("isPinnedDmUsersSchemaError", () => {
  it("detects PostgREST schema cache misses", () => {
    expect(
      isPinnedDmUsersSchemaError({
        code: "PGRST205",
        message: "Could not find the table 'public.pinned_dm_users' in the schema cache",
      }),
    ).toBe(true);
  });

  it("detects missing table messages", () => {
    expect(
      isPinnedDmUsersSchemaError({
        message: 'relation "public.pinned_dm_users" does not exist',
      }),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(
      isPinnedDmUsersSchemaError({
        message: "duplicate key value violates unique constraint",
        code: "23505",
      }),
    ).toBe(false);
  });
});
