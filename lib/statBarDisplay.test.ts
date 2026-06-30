import { describe, expect, it } from "vitest";
import {
  STAT_BAR_MIN_VISIBLE_PCT,
  getCharacterStatBarFillPercent,
  getCharacterStatBarFills,
} from "./statBarDisplay";

describe("statBarDisplay", () => {
  const sampleStats = {
    strength: 102,
    stamina: 52,
    knowledge: 164,
    social: 24,
    focus: 41,
  };

  it("returns zero for empty stats", () => {
    expect(getCharacterStatBarFillPercent(0, [102, 52, 164])).toBe(0);
  });

  it("normalizes against the highest peer and keeps knowledge tallest", () => {
    const values = Object.values(sampleStats);
    expect(getCharacterStatBarFillPercent(164, values)).toBe(100);
    expect(getCharacterStatBarFillPercent(102, values)).toBeCloseTo(62.2, 1);
    expect(getCharacterStatBarFillPercent(52, values)).toBeCloseTo(31.7, 1);
    expect(getCharacterStatBarFillPercent(24, values)).toBeCloseTo(14.6, 1);
    expect(getCharacterStatBarFillPercent(41, values)).toBeCloseTo(25, 1);
  });

  it("enforces a minimum visible fill for tiny non-zero stats", () => {
    expect(getCharacterStatBarFillPercent(1, [200, 180])).toBe(STAT_BAR_MIN_VISIBLE_PCT);
  });

  it("builds fills for every stat key", () => {
    const fills = getCharacterStatBarFills(sampleStats);
    expect(fills.knowledge).toBe(100);
    expect(fills.strength).toBeGreaterThan(STAT_BAR_MIN_VISIBLE_PCT);
    expect(fills.social).toBeGreaterThan(STAT_BAR_MIN_VISIBLE_PCT);
    expect(fills.focus).toBeGreaterThan(STAT_BAR_MIN_VISIBLE_PCT);
  });
});
