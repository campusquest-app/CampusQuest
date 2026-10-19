import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAILY_EMBER_LIMIT,
  EMBER_COLOR_ACTIVE,
  EMBER_COPY,
  EMBER_ERROR_CODES,
  EMBER_REACTION_TYPE,
  countEmbersUsedToday,
  decideEmberGive,
  clampEmberCastAnchor,
  emberAllowanceFromUsed,
  disclosedEmberTotal,
  emberCastFlameSlots,
  hasUnlimitedDailyEmbers,
  historicalSparkCountsTowardToday,
  isEligibleEmberGiver,
  ownerEmberCountCopy,
  planEmberCast,
  planUnlimitedEmberCast,
  remainingEmbersCopy,
  sameDayRemovalRestoresAvailability,
  shouldRollbackOverLimitInsert,
} from "@/lib/embers";
import { getCampusDayWindow, isOnCampusDay } from "@/lib/realm/campusTime";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { QUAD_SPARK_XP_AMOUNT } from "@/lib/quadSparkXp";
import { maybeAwardSparkXp } from "@/lib/server/quadReactions";

const EDT_NOON = new Date("2026-07-09T16:00:00.000Z"); // July 9 12:00 EDT
const EST_NOON = new Date("2026-01-15T17:00:00.000Z"); // Jan 15 12:00 EST

describe("Ember daily allowance", () => {
  it("lets a student give 3 Embers per campus day", () => {
    expect(DAILY_EMBER_LIMIT).toBe(3);
    expect(decideEmberGive({ usedToday: 0, alreadyActive: false, isOwnPost: false }).ok).toBe(true);
    expect(decideEmberGive({ usedToday: 2, alreadyActive: false, isOwnPost: false }).ok).toBe(true);
    expect(emberAllowanceFromUsed(2, EDT_NOON).remaining).toBe(1);
  });

  it("rejects the fourth Ember the same day", () => {
    const decision = decideEmberGive({ usedToday: 3, alreadyActive: false, isOwnPost: false });
    expect(decision).toEqual({
      ok: false,
      code: EMBER_ERROR_CODES.dailyLimit,
      message: EMBER_COPY.exhausted,
    });
    expect(emberAllowanceFromUsed(3, EDT_NOON).remaining).toBe(0);
  });

  it("prevents a duplicate Ember on one post", () => {
    const decision = decideEmberGive({ usedToday: 1, alreadyActive: true, isOwnPost: false });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe(EMBER_ERROR_CODES.duplicate);
  });

  it("rejects a self-Ember", () => {
    const decision = decideEmberGive({ usedToday: 0, alreadyActive: false, isOwnPost: true });
    expect(decision).toEqual({
      ok: false,
      code: EMBER_ERROR_CODES.self,
      message: EMBER_COPY.ownPost,
    });
  });

  it("restores availability when a same-day Ember is removed", () => {
    const givenAt = new Date("2026-07-09T18:00:00.000Z");
    expect(sameDayRemovalRestoresAvailability(givenAt, EDT_NOON)).toBe(true);
    const remaining = [givenAt, "2026-07-09T19:00:00.000Z"];
    expect(countEmbersUsedToday(remaining, EDT_NOON)).toBe(2);
    expect(countEmbersUsedToday([givenAt], EDT_NOON)).toBe(1);
  });

  it("does not restore today's allowance when a previous-day Ember is removed", () => {
    const yesterday = new Date("2026-07-08T18:00:00.000Z");
    expect(sameDayRemovalRestoresAvailability(yesterday, EDT_NOON)).toBe(false);
    expect(countEmbersUsedToday([yesterday, "2026-07-09T18:00:00.000Z"], EDT_NOON)).toBe(1);
  });

  it("resets at midnight America/New_York", () => {
    const justBefore = new Date("2026-07-09T03:59:59.000Z"); // 11:59:59 PM EDT July 8
    const justAfter = new Date("2026-07-09T04:00:00.000Z"); // midnight EDT July 9
    const lateJuly8 = "2026-07-09T03:30:00.000Z";
    expect(countEmbersUsedToday([lateJuly8], justBefore)).toBe(1);
    expect(countEmbersUsedToday([lateJuly8], justAfter)).toBe(0);
    expect(getCampusDayWindow(justAfter).start.toISOString()).toBe("2026-07-09T04:00:00.000Z");
  });

  it("handles spring-forward and fall-back campus days", () => {
    const spring = new Date("2026-03-08T16:00:00.000Z");
    const { start: springStart, end: springEnd } = getCampusDayWindow(spring);
    expect(springStart.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(springEnd.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(springEnd.getTime() - springStart.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(isOnCampusDay(new Date("2026-03-09T03:30:00.000Z"), spring)).toBe(true);
    expect(isOnCampusDay(new Date("2026-03-09T04:00:00.000Z"), spring)).toBe(false);

    const fall = new Date("2026-11-01T16:00:00.000Z");
    const { start: fallStart, end: fallEnd } = getCampusDayWindow(fall);
    expect(fallStart.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(fallEnd.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(fallEnd.getTime() - fallStart.getTime()).toBe(25 * 60 * 60 * 1000);
    expect(countEmbersUsedToday(["2026-11-02T04:30:00.000Z"], fall)).toBe(1);
    expect(countEmbersUsedToday(["2026-11-02T05:00:00.000Z"], fall)).toBe(0);
    expect(EST_NOON.toISOString()).toContain("2026-01-15");
  });

  it("rolls back concurrent inserts that would exceed the daily limit", () => {
    expect(shouldRollbackOverLimitInsert(3)).toBe(false);
    expect(shouldRollbackOverLimitInsert(4)).toBe(true);
  });

  it("keeps Ember counts as the number of spark rows in the current day", () => {
    const rows = [
      "2026-07-08T20:00:00.000Z",
      "2026-07-09T14:00:00.000Z",
      "2026-07-09T15:00:00.000Z",
      "not-a-date",
    ];
    expect(countEmbersUsedToday(rows, EDT_NOON)).toBe(2);
    expect(emberAllowanceFromUsed(2, EDT_NOON)).toMatchObject({ used: 2, remaining: 1, limit: 3 });
  });
});

describe("Ember eligibility and historical Sparks", () => {
  it("rejects faculty and unverified users when verification is required", () => {
    expect(isEligibleEmberGiver({ role: "student", student_status: "current" }).ok).toBe(true);
    expect(isEligibleEmberGiver({ role: "faculty_staff", student_status: "faculty_staff" }).ok).toBe(false);
    expect(isEligibleEmberGiver({ role: "admin" }).ok).toBe(true);
    expect(FEATURE_FLAGS.requireEmailVerification).toBe(false);
  });

  it("preserves historical Sparks as Embers without spending today's allowance", () => {
    expect(EMBER_REACTION_TYPE).toBe("spark");
    expect(historicalSparkCountsTowardToday("2026-07-08T18:00:00.000Z", EDT_NOON)).toBe(false);
    expect(historicalSparkCountsTowardToday("2026-07-09T18:00:00.000Z", EDT_NOON)).toBe(true);
  });

  it("does not award XP or progression for Embers", async () => {
    await expect(
      maybeAwardSparkXp({ postId: "p1", postAuthorId: "a1", sparkerUserId: "u1" }),
    ).resolves.toBeUndefined();
    expect(QUAD_SPARK_XP_AMOUNT).toBe(20);
    expect(FEATURE_FLAGS.progression).toBe(false);
    const reactions = readFileSync(join(process.cwd(), "lib/server/quadReactions.ts"), "utf8");
    expect(reactions).not.toMatch(/await maybeAwardSparkXp/);
    expect(reactions).not.toMatch(/addXpInternal/);
  });
});

describe("Ember copy", () => {
  it("uses remaining / exhausted phrasing without ranking language", () => {
    expect(remainingEmbersCopy(2)).toBe("2 of 3 Embers left today");
    expect(remainingEmbersCopy(0)).toBe(EMBER_COPY.exhausted);
    expect(EMBER_COPY.exhausted).toContain("You're out of Embers for today");
    expect(EMBER_COPY.saveFailed).toBe("Couldn't send Ember. Try again.");
    expect(EMBER_COPY.explainerTitle).toBe("What are Embers?");
    expect(EMBER_COLOR_ACTIVE).toBe("#A78BFA");
  });
});

describe("Ember cast animation plan", () => {
  it("always shows 3 flames and leaves 2 after the first Ember", () => {
    const plan = planEmberCast(2);
    expect(plan.startingCount).toBe(3);
    expect(plan.remainingCount).toBe(2);
    expect(plan.consumeIndex).toBe(1);
    expect(plan.remainingLabel).toBe("2 Embers remaining.");
    expect(plan.unlimited).toBe(false);
    expect(emberCastFlameSlots(3)).toHaveLength(3);
  });

  it("still shows 3 flames after the second Ember with 1 remaining", () => {
    const plan = planEmberCast(1);
    expect(plan.startingCount).toBe(3);
    expect(plan.remainingCount).toBe(1);
    expect(plan.remainingLabel).toBe("1 Ember remaining.");
  });

  it("shows 3 flames and exhausted copy after the third Ember", () => {
    const plan = planEmberCast(0);
    expect(plan.startingCount).toBe(3);
    expect(plan.remainingCount).toBe(0);
    expect(plan.exhausted).toBe(true);
    expect(plan.remainingLabel).toBe(EMBER_COPY.allUsedToday);
    expect(plan.confirmationDetail).toBe(EMBER_COPY.exhausted);
  });

  it("never plans a fourth starting flame", () => {
    expect(planEmberCast(3).startingCount).toBe(3);
    expect(planEmberCast(4).startingCount).toBe(3);
  });

  it("gives admins three flames and no daily balance", () => {
    const plan = planUnlimitedEmberCast();
    expect(plan.unlimited).toBe(true);
    expect(plan.startingCount).toBe(3);
    expect(plan.remainingLabel).toBe("");
    expect(plan.confirmationDetail).toBe("");
    expect(`${plan.remainingLabel} ${plan.confirmationDetail}`).not.toMatch(/remaining|of 3|unlimited|∞/i);
  });

  it("keeps the overlay inside short iPhone viewports and above the nav", () => {
    const se = clampEmberCastAnchor({
      button: { left: 340, top: 620, width: 44, height: 44 },
      viewport: { width: 375, height: 667 },
    });
    expect(se.left).toBeGreaterThanOrEqual(12 + 100);
    expect(se.left).toBeLessThanOrEqual(375 - 12 - 100);
    expect(se.top).toBeLessThanOrEqual(667 - 96);
    expect(se.top).toBeGreaterThanOrEqual(12 + 210);
  });
});

describe("role-based Ember allowance", () => {
  it("limits students and non-global roles to 3", () => {
    for (const role of [null, "student", "faculty_staff", "qa", "beta_internal", "moderator", "org_admin", "Admin"]) {
      expect(hasUnlimitedDailyEmbers(role)).toBe(false);
    }
    expect(decideEmberGive({ usedToday: 3, alreadyActive: false, isOwnPost: false }).ok).toBe(false);
    expect(decideEmberGive({ usedToday: 2, alreadyActive: false, isOwnPost: false, unlimited: false }).ok).toBe(true);
  });

  it("lets exact admin and super_admin roles Ember past 3 without a second Ember on one post", () => {
    expect(hasUnlimitedDailyEmbers("admin")).toBe(true);
    expect(hasUnlimitedDailyEmbers("super_admin")).toBe(true);
    expect(decideEmberGive({ usedToday: 9, alreadyActive: false, isOwnPost: false, unlimited: true }).ok).toBe(true);
    const duplicate = decideEmberGive({ usedToday: 9, alreadyActive: true, isOwnPost: false, unlimited: true });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe(EMBER_ERROR_CODES.duplicate);
    const own = decideEmberGive({ usedToday: 0, alreadyActive: false, isOwnPost: true, unlimited: true });
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.code).toBe(EMBER_ERROR_CODES.self);
    expect(shouldRollbackOverLimitInsert(8, true)).toBe(false);
    expect(shouldRollbackOverLimitInsert(4, false)).toBe(true);
  });
});

describe("private Ember totals", () => {
  it("shows a total only to the post author and hides zero", () => {
    expect(disclosedEmberTotal({ viewerId: "author", authorId: "author", count: 8 })).toBe(8);
    expect(disclosedEmberTotal({ viewerId: "author", authorId: "author", count: 0 })).toBe(0);
    expect(disclosedEmberTotal({ viewerId: "other", authorId: "author", count: 8 })).toBe(0);
    expect(disclosedEmberTotal({ viewerId: "admin", authorId: "author", count: 8 })).toBe(0);
    expect(ownerEmberCountCopy(0)).toBeNull();
    expect(ownerEmberCountCopy(1)).toBe("1 Ember received");
    expect(ownerEmberCountCopy(8)).toBe("8 Embers received");
  });
});
