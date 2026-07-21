import { describe, expect, it } from "vitest";
import {
  filterLeaderboardEligible,
  isLeaderboardEligible,
} from "@/lib/leaderboardEligibility";
import { mapProfileToLeaderboardEntry, sortAndRank } from "@/lib/server/xpLeaderboards";

describe("isLeaderboardEligible", () => {
  it("allows normal student accounts", () => {
    expect(isLeaderboardEligible({ role: "student", is_hidden: false, is_test_user: false })).toBe(true);
  });

  it("allows pre-migration rows with missing flags (role defaults to student)", () => {
    expect(isLeaderboardEligible({})).toBe(true);
    expect(isLeaderboardEligible({ role: null, is_hidden: null, is_test_user: null })).toBe(true);
  });

  it("excludes faculty/staff accounts", () => {
    expect(isLeaderboardEligible({ role: "faculty_staff", is_hidden: false, is_test_user: false })).toBe(false);
  });

  it("excludes admins and super admins", () => {
    expect(isLeaderboardEligible({ role: "admin" })).toBe(false);
    expect(isLeaderboardEligible({ role: "super_admin" })).toBe(false);
  });

  it("excludes QA and internal tester roles", () => {
    expect(isLeaderboardEligible({ role: "qa" })).toBe(false);
    expect(isLeaderboardEligible({ role: "beta_internal" })).toBe(false);
  });

  it("excludes hidden users regardless of role", () => {
    expect(isLeaderboardEligible({ role: "student", is_hidden: true })).toBe(false);
  });

  it("excludes test users regardless of role", () => {
    expect(isLeaderboardEligible({ role: "student", is_test_user: true })).toBe(false);
  });

  it("excludes null/undefined profiles", () => {
    expect(isLeaderboardEligible(null)).toBe(false);
    expect(isLeaderboardEligible(undefined)).toBe(false);
  });

  it("removes a user when their role changes from student to faculty_staff, and restores them when it changes back", () => {
    const profile = { role: "student", is_hidden: false, is_test_user: false };
    expect(isLeaderboardEligible(profile)).toBe(true);

    profile.role = "faculty_staff";
    expect(isLeaderboardEligible(profile)).toBe(false);

    profile.role = "student";
    expect(isLeaderboardEligible(profile)).toBe(true);
  });
});

describe("leaderboard ranking with eligibility filter", () => {
  const profileRow = (args: {
    id: string;
    role: string;
    totalXp: number;
    hidden?: boolean;
    testUser?: boolean;
  }) => ({
    id: args.id,
    username: args.id,
    display_name: args.id,
    avatar_url: null,
    avatar_custom_json: null,
    streak_days: 0,
    user_stats: { total_xp: args.totalXp, level: 1 },
    role: args.role,
    is_hidden: args.hidden ?? false,
    is_test_user: args.testUser ?? false,
  });

  it("faculty/staff XP never affects student rankings", () => {
    const rows = [
      profileRow({ id: "prof-high-xp", role: "faculty_staff", totalXp: 99999 }),
      profileRow({ id: "student-a", role: "student", totalXp: 500 }),
      profileRow({ id: "student-b", role: "student", totalXp: 900 }),
      profileRow({ id: "admin-1", role: "admin", totalXp: 5000 }),
      profileRow({ id: "qa-1", role: "qa", totalXp: 3000, hidden: true, testUser: true }),
      profileRow({ id: "student-c", role: "student", totalXp: 100 }),
    ];

    const eligible = filterLeaderboardEligible(rows);
    const ranked = sortAndRank(eligible.map(mapProfileToLeaderboardEntry), "totalXp");

    expect(ranked.map((row) => row.userId)).toEqual(["student-b", "student-a", "student-c"]);
    // Ranks stay contiguous 1..N — no gaps left by excluded accounts.
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("keeps all students and only students", () => {
    const rows = [
      profileRow({ id: "student-a", role: "student", totalXp: 10 }),
      profileRow({ id: "faculty-1", role: "faculty_staff", totalXp: 10 }),
      profileRow({ id: "hidden-student", role: "student", totalXp: 10, hidden: true }),
      profileRow({ id: "test-student", role: "student", totalXp: 10, testUser: true }),
    ];

    expect(filterLeaderboardEligible(rows).map((row) => row.id)).toEqual(["student-a"]);
  });
});
