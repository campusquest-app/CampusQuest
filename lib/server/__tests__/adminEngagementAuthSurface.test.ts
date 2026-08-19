import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("admin student engagement / directory authorization", () => {
  it("student-engagement route requires requireAdminUser", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/internal/admin/student-engagement/route.ts"),
      "utf8",
    );
    expect(src).toContain("requireAdminUser");
    expect(src).toContain("getStudentEngagementAnalytics");
  });

  it("student-directory route requires requireAdminUser", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/internal/admin/student-directory/route.ts"),
      "utf8",
    );
    expect(src).toContain("requireAdminUser");
    expect(src).toContain("SCHEMA_MIGRATION_REQUIRED");
  });
});
