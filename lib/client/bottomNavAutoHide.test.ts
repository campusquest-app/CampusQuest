import { describe, expect, it } from "vitest";
import { computeBottomNavAutoHide } from "@/lib/client/bottomNavAutoHide";

describe("bottom nav auto-hide", () => {
  it("stays visible until directional movement crosses the threshold", () => {
    let state = { hidden: false, accumulated: 0 };
    state = computeBottomNavAutoHide({ ...state, delta: 6, scrollY: 200 });
    expect(state.hidden).toBe(false);
    state = computeBottomNavAutoHide({ ...state, delta: 8, scrollY: 208 });
    expect(state.hidden).toBe(true);
  });

  it("shows again on meaningful upward scroll", () => {
    let state = { hidden: true, accumulated: 0 };
    state = computeBottomNavAutoHide({ ...state, delta: -6, scrollY: 300 });
    expect(state.hidden).toBe(true);
    state = computeBottomNavAutoHide({ ...state, delta: -8, scrollY: 292 });
    expect(state.hidden).toBe(false);
  });

  it("is always visible near the top of the feed", () => {
    const state = computeBottomNavAutoHide({
      hidden: true,
      accumulated: 40,
      delta: 20,
      scrollY: 10,
    });
    expect(state.hidden).toBe(false);
    expect(state.accumulated).toBe(0);
  });

  it("resets accumulation when direction flips", () => {
    let state = computeBottomNavAutoHide({
      hidden: false,
      accumulated: 10,
      delta: -5,
      scrollY: 200,
    });
    expect(state.hidden).toBe(false);
    expect(state.accumulated).toBe(-5);
  });

  it("ignores sub-threshold jitter without toggling", () => {
    let state = { hidden: false, accumulated: 0 };
    state = computeBottomNavAutoHide({ ...state, delta: 4, scrollY: 120 });
    state = computeBottomNavAutoHide({ ...state, delta: 4, scrollY: 124 });
    expect(state.hidden).toBe(false);
    expect(state.accumulated).toBe(8);
  });
});
