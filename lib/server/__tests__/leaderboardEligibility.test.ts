import { describe, expect, it } from "vitest";
import { listLeaderboardIneligibleUserIds } from "@/lib/server/leaderboardEligibility";

type Row = Record<string, unknown>;

/**
 * Minimal supabase-like stub. `flagged` answers the full eligibility query
 * (role/is_hidden/is_test_user columns); when `failEligibilityQuery` is set
 * that query errors, so the helper falls back to listHiddenUserIds, whose
 * hidden-only lookups (`select("id")` + or/eq) answer with `hiddenRows`.
 */
function fakeClient(args: {
  flagged: Row[];
  hiddenRows?: Row[];
  failEligibilityQuery?: boolean;
}) {
  const { flagged, hiddenRows = [], failEligibilityQuery = false } = args;
  return {
    from: () => ({
      select: (columns: string) => {
        const isEligibilityQuery = columns.includes("role");
        const respond = (rows: Row[]) =>
          isEligibilityQuery && failEligibilityQuery
            ? Promise.resolve({ data: null, error: { message: "column profiles.role does not exist" } })
            : Promise.resolve({ data: rows, error: null });
        return {
          in: (_col: string, ids: string[]) =>
            respond(flagged.filter((row) => ids.includes(row.id as string))),
          or: () => respond(isEligibilityQuery ? flagged : hiddenRows),
          eq: () => respond(hiddenRows),
        };
      },
    }),
  } as never;
}

const profiles: Row[] = [
  { id: "student-1", role: "student", is_hidden: false, is_test_user: false },
  { id: "faculty-1", role: "faculty_staff", is_hidden: false, is_test_user: false },
  { id: "admin-1", role: "admin", is_hidden: false, is_test_user: false },
  { id: "qa-1", role: "qa", is_hidden: true, is_test_user: true },
  { id: "hidden-student", role: "student", is_hidden: true, is_test_user: false },
  { id: "test-student", role: "student", is_hidden: false, is_test_user: true },
];

describe("listLeaderboardIneligibleUserIds", () => {
  it("flags faculty/staff, admins, QA, hidden, and test users — never students", async () => {
    const ids = await listLeaderboardIneligibleUserIds(
      fakeClient({ flagged: profiles }),
      profiles.map((row) => row.id as string),
    );
    expect(ids.has("student-1")).toBe(false);
    expect(ids.has("faculty-1")).toBe(true);
    expect(ids.has("admin-1")).toBe(true);
    expect(ids.has("qa-1")).toBe(true);
    expect(ids.has("hidden-student")).toBe(true);
    expect(ids.has("test-student")).toBe(true);
  });

  it("returns an empty set for an empty cohort without querying", async () => {
    const ids = await listLeaderboardIneligibleUserIds(fakeClient({ flagged: profiles }), []);
    expect(ids.size).toBe(0);
  });

  it("scopes the lookup to the provided cohort", async () => {
    const ids = await listLeaderboardIneligibleUserIds(
      fakeClient({ flagged: profiles }),
      ["student-1", "faculty-1"],
    );
    expect(ids).toEqual(new Set(["faculty-1"]));
  });

  it("falls back to the hidden-only filter on pre-migration schemas", async () => {
    const ids = await listLeaderboardIneligibleUserIds(
      fakeClient({
        flagged: profiles,
        failEligibilityQuery: true,
        hiddenRows: [{ id: "qa-1" }, { id: "hidden-student" }],
      }),
      profiles.map((row) => row.id as string),
    );
    expect(ids).toEqual(new Set(["qa-1", "hidden-student"]));
  });
});
