import { describe, expect, it } from "vitest";
import {
  XP_PROGRESS_BAR_PREF_INITIAL,
  parseShowXpProgressBarFromProfile,
  shouldRenderXpProgressBar,
} from "@/lib/client/xpProgressBarPreference";

describe("xpProgressBarPreference", () => {
  it("defaults to hidden until loaded", () => {
    expect(shouldRenderXpProgressBar(XP_PROGRESS_BAR_PREF_INITIAL)).toBe(false);
  });

  it("stays hidden when loaded but disabled", () => {
    expect(shouldRenderXpProgressBar({ loaded: true, enabled: false })).toBe(false);
  });

  it("shows only when loaded and explicitly enabled", () => {
    expect(shouldRenderXpProgressBar({ loaded: true, enabled: true })).toBe(true);
  });

  it("treats only strict true as enabled from profile", () => {
    expect(parseShowXpProgressBarFromProfile(true)).toBe(true);
    expect(parseShowXpProgressBarFromProfile(false)).toBe(false);
    expect(parseShowXpProgressBarFromProfile(null)).toBe(false);
    expect(parseShowXpProgressBarFromProfile(undefined)).toBe(false);
    expect(parseShowXpProgressBarFromProfile("true")).toBe(false);
    expect(parseShowXpProgressBarFromProfile(1)).toBe(false);
  });
});
