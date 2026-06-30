import { describe, expect, it } from "vitest";
import {
  CHARACTER_STAT_BAR_MAX,
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
    expect(getCharacterStatBarFillPercent(0)).toBe(0);
  });

  it("normalizes against the fixed character bar maximum", () => {
    expect(getCharacterStatBarFillPercent(102)).toBeCloseTo(29.1, 1);
    expect(getCharacterStatBarFillPercent(52)).toBeCloseTo(14.9, 1);
    expect(getCharacterStatBarFillPercent(164)).toBeCloseTo(46.9, 1);
    expect(getCharacterStatBarFillPercent(24)).toBeCloseTo(6.9, 1);
    expect(getCharacterStatBarFillPercent(41)).toBeCloseTo(11.7, 1);
  });

  it("caps at 100% when value meets or exceeds the bar maximum", () => {
    expect(getCharacterStatBarFillPercent(CHARACTER_STAT_BAR_MAX)).toBe(100);
    expect(getCharacterStatBarFillPercent(CHARACTER_STAT_BAR_MAX + 50)).toBe(100);
  });

  it("builds fills for every stat key", () => {
    const fills = getCharacterStatBarFills(sampleStats);
    expect(fills.knowledge).toBeCloseTo(46.9, 1);
    expect(fills.strength).toBeCloseTo(29.1, 1);
    expect(fills.stamina).toBeCloseTo(14.9, 1);
    expect(fills.social).toBeCloseTo(6.9, 1);
    expect(fills.focus).toBeCloseTo(11.7, 1);
  });
});
