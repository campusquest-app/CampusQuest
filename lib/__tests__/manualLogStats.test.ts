import { describe, expect, it } from "vitest";
import { getStatSkillLevel, getStatSkillProgress, STAT_SKILL_LEVEL_STEP } from "@/lib/manualLogStats";

describe("manualLogStats", () => {
  it("computes skill level from stat value", () => {
    expect(getStatSkillLevel(0)).toBe(1);
    expect(getStatSkillLevel(STAT_SKILL_LEVEL_STEP)).toBe(2);
    expect(getStatSkillLevel(STAT_SKILL_LEVEL_STEP, 1)).toBe(22);
  });

  it("computes progress within current skill tier", () => {
    expect(getStatSkillProgress(0)).toBe(0);
    expect(getStatSkillProgress(STAT_SKILL_LEVEL_STEP / 2)).toBe(50);
    expect(getStatSkillProgress(STAT_SKILL_LEVEL_STEP)).toBe(0);
  });
});
