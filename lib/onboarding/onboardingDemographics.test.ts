import { describe, expect, it } from "vitest";
import {
  INTEREST_OPTIONS,
  COMMUNITY_OPTIONS,
  MIN_INTERESTS,
  ONBOARDING_VERSION,
  normalizeInterestIds,
  normalizeCommunityIds,
  STUDENT_STATUS,
  STUDENT_STATUS_OPTIONS,
  shouldAskGraduationYear,
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
    expect(INTEREST_OPTIONS.length).toBeLessThanOrEqual(20);
    expect(INTEREST_OPTIONS.some((opt) => opt.id === "entrepreneurship")).toBe(true);
    expect(INTEREST_OPTIONS.some((opt) => opt.id === "wellness")).toBe(true);
  });

  it("normalizes interest labels to stable ids", () => {
    expect(normalizeInterestIds(["Athletics", "music", "Tech"])).toEqual([
      "athletics",
      "music",
      "tech",
    ]);
    expect(normalizeInterestIds(["Arts", "technology", "Wellness"])).toEqual(["art", "tech", "wellness"]);
  });

  it("allows empty communities (optional / skip)", () => {
    expect(normalizeCommunityIds([])).toEqual([]);
    expect(COMMUNITY_OPTIONS.some((c) => c.id === "greek_life")).toBe(true);
  });

  it("exposes stable student status enums including current UI choices and legacy values", () => {
    expect(STUDENT_STATUS.current_or_incoming).toBe("current_or_incoming");
    expect(STUDENT_STATUS.not_student).toBe("not_student");
    expect(STUDENT_STATUS.current_student).toBe("current_student");
    expect(STUDENT_STATUS.incoming_student).toBe("incoming_student");
    expect(STUDENT_STATUS.graduate_student).toBe("graduate_student");
    expect(STUDENT_STATUS.faculty_staff).toBe("faculty_staff");
  });

  it("keeps community identifiers stable while exposing internal kinds", () => {
    expect(COMMUNITY_OPTIONS.map((c) => c.id)).toEqual([
      "athletics",
      "student_organizations",
      "greek_life",
      "talent_development",
      "fine_arts",
      "graduate_students",
      "engineering",
      "business",
      "computer_science",
      "international_students",
      "health_sciences",
      "other",
    ]);
    expect(COMMUNITY_OPTIONS.every((c) => Boolean(c.kind))).toBe(true);
    expect(COMMUNITY_OPTIONS.find((c) => c.id === "engineering")?.kind).toBe("academic_area");
    expect(COMMUNITY_OPTIONS.find((c) => c.id === "talent_development")?.kind).toBe("program");
  });

  it("pins onboarding version for persistence", () => {
    expect(ONBOARDING_VERSION).toBe(2);
  });

  it("shows the four current user-type labels without listing legacy database values", () => {
    expect(STUDENT_STATUS_OPTIONS.map((o) => o.id)).toEqual([
      "current_student",
      "incoming_student",
      "graduate_student",
      "faculty_staff",
    ]);
    expect(STUDENT_STATUS_OPTIONS.some((o) => o.id === "current_or_incoming")).toBe(false);
    expect(STUDENT_STATUS_OPTIONS.some((o) => o.id === "not_student")).toBe(false);
  });

  it("skips graduation year for faculty/staff only", () => {
    expect(shouldAskGraduationYear("faculty_staff")).toBe(false);
    expect(shouldAskGraduationYear("not_student")).toBe(false);
    expect(shouldAskGraduationYear("graduate_student")).toBe(true);
    expect(shouldAskGraduationYear("current_student")).toBe(true);
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

  it("builds year options as plain years plus Not sure / Other", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const opts = graduationYearOptions(now);
    expect(opts.map((o) => o.year)).toEqual([2030, 2029, 2028, 2027, null]);
    expect(opts.map((o) => o.label)).toEqual(["2030", "2029", "2028", "2027", "Not sure / Other"]);
    expect(opts.some((o) => /freshman|sophomore|junior|senior/i.test(o.label))).toBe(false);
  });

  it("adds extra future years for graduate students without changing the default set", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(graduationYearOptions(now, { extraFutureYears: 2 }).map((o) => o.year)).toEqual([
      2032, 2031, 2030, 2029, 2028, 2027, null,
    ]);
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
