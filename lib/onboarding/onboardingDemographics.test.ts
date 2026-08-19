import { describe, expect, it } from "vitest";
import {
  INTEREST_OPTIONS,
  COMMUNITY_OPTIONS,
  MIN_INTERESTS,
  ONBOARDING_VERSION,
  normalizeInterestIds,
  normalizeCommunityIds,
  STUDENT_STATUS,
} from "@/lib/onboarding/taxonomy";
import {
  currentAcademicYearStart,
  deriveClassStanding,
  graduationYearOptions,
} from "@/lib/onboarding/graduationYear";
import { suppressSmallCohorts, ANALYTICS_COHORT_MIN_UNIQUE } from "@/lib/onboarding/analyticsPrivacy";
import { resolveEngagementDateRange } from "@/lib/server/studentEngagementAnalytics";

describe("onboarding taxonomy", () => {
  it("requires at least 3 interests for the new flow", () => {
    expect(MIN_INTERESTS).toBe(3);
    expect(INTEREST_OPTIONS.length).toBeGreaterThanOrEqual(MIN_INTERESTS);
  });

  it("normalizes interest labels to stable ids", () => {
    expect(normalizeInterestIds(["Athletics", "music", "Tech"])).toEqual([
      "athletics",
      "music",
      "tech",
    ]);
  });

  it("allows empty communities (optional / skip)", () => {
    expect(normalizeCommunityIds([])).toEqual([]);
    expect(COMMUNITY_OPTIONS.some((c) => c.id === "greek_life")).toBe(true);
  });

  it("exposes stable student status enums", () => {
    expect(STUDENT_STATUS.current_or_incoming).toBe("current_or_incoming");
    expect(STUDENT_STATUS.not_student).toBe("not_student");
  });

  it("pins onboarding version for persistence", () => {
    expect(ONBOARDING_VERSION).toBe(2);
  });
});

describe("graduation year / class standing", () => {
  it("derives standing from graduation year relative to academic year", () => {
    // Freeze: Aug 2026 academic year → senior cohort 2027
    const now = new Date("2026-10-15T12:00:00Z");
    expect(currentAcademicYearStart(now)).toBe(2026);
    expect(deriveClassStanding(2030, now)).toBe("freshman");
    expect(deriveClassStanding(2029, now)).toBe("sophomore");
    expect(deriveClassStanding(2028, now)).toBe("junior");
    expect(deriveClassStanding(2027, now)).toBe("senior");
    expect(deriveClassStanding(null, now)).toBe("other");
  });

  it("builds year options without hard-coding permanent class labels only", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const opts = graduationYearOptions(now);
    expect(opts.map((o) => o.year)).toEqual([2030, 2029, 2028, 2027, null]);
    expect(opts[0]?.label).toContain("Freshman");
    expect(opts[4]?.label).toContain("Graduate");
  });
});

describe("analytics privacy", () => {
  it("suppresses cohorts under the unique-student threshold", () => {
    const rows = suppressSmallCohorts([
      { key: "a", label: "A", uniqueStudents: 4, totalEvents: 10 },
      { key: "b", label: "B", uniqueStudents: 5, totalEvents: 12 },
    ]);
    expect(ANALYTICS_COHORT_MIN_UNIQUE).toBe(5);
    expect(rows[0]?.suppressed).toBe(true);
    expect(rows[0]?.displayLabel).toBe("<5 students");
    expect(rows[0]?.uniqueStudents).toBeNull();
    expect(rows[1]?.suppressed).toBe(false);
    expect(rows[1]?.uniqueStudents).toBe(5);
  });
});

describe("engagement date ranges", () => {
  it("resolves rolling presets", () => {
    const now = new Date("2026-08-18T15:00:00Z");
    const week = resolveEngagementDateRange({ preset: "7d", now });
    expect(week.preset).toBe("7d");
    expect(Date.parse(week.endIso)).toBeGreaterThan(Date.parse(week.startIso));
  });

  it("rejects invalid custom ranges", () => {
    expect(() =>
      resolveEngagementDateRange({
        preset: "custom",
        start: "2026-08-20",
        end: "2026-08-01",
      }),
    ).toThrow();
  });
});
