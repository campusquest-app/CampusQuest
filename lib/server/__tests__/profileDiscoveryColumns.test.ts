import { describe, expect, it } from "vitest";
import {
  isMissingDiscoveryColumnError,
  omitUnavailableDiscoveryColumns,
  stripDiscoveryColumns,
} from "@/lib/server/profileDiscoveryColumns";

describe("profile discovery columns", () => {
  it("omits optional columns that are not on the live row", () => {
    const existing = { id: "u1", major: "Computer Science" };
    expect(
      omitUnavailableDiscoveryColumns(
        {
          major: "Computer Science",
          academic_area: "computer_science",
          realm_intro_completed_at: "2026-08-28T00:00:00.000Z",
        },
        existing,
      ),
    ).toEqual({ major: "Computer Science" });
  });

  it("keeps optional columns when they already exist on the row", () => {
    const existing = { academic_area: null, requested_school_name: null };
    expect(
      omitUnavailableDiscoveryColumns(
        { academic_area: "engineering", student_status: "current_student" },
        existing,
      ),
    ).toEqual({ academic_area: "engineering", student_status: "current_student" });
  });

  it("strips discovery fields for a retry after a missing-column error", () => {
    expect(
      stripDiscoveryColumns({
        class_year: 2028,
        academic_area: "engineering",
        requested_school_name: "Brown",
      }),
    ).toEqual({ class_year: 2028 });
    expect(isMissingDiscoveryColumnError('column "academic_area" does not exist')).toBe(true);
    expect(isMissingDiscoveryColumnError('column "student_status" does not exist')).toBe(false);
  });
});
