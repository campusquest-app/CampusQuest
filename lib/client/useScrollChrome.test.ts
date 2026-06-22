import { describe, expect, it } from "vitest";
import {
  computeBottomConcealPx,
  computeTopChromeHidden,
} from "@/lib/client/useScrollChrome";

describe("useScrollChrome", () => {
  it("conceals on scroll down and holds position when delta is zero", () => {
    let conceal = 0;
    conceal = computeBottomConcealPx({ prevConcealPx: conceal, delta: 20, scrollY: 200 });
    expect(conceal).toBe(20);
    conceal = computeBottomConcealPx({ prevConcealPx: conceal, delta: 0, scrollY: 200 });
    expect(conceal).toBe(20);
  });

  it("reveals on upward scroll", () => {
    let conceal = 50;
    conceal = computeBottomConcealPx({ prevConcealPx: conceal, delta: -8, scrollY: 300 });
    expect(conceal).toBe(42);
  });

  it("fully reveals near top of feed", () => {
    const conceal = computeBottomConcealPx({ prevConcealPx: 40, delta: 10, scrollY: 10 });
    expect(conceal).toBe(0);
  });

  it("ignores tiny jitter", () => {
    const conceal = computeBottomConcealPx({ prevConcealPx: 30, delta: 0.5, scrollY: 400 });
    expect(conceal).toBe(30);
  });

  it("drives top chrome from direction thresholds", () => {
    expect(computeTopChromeHidden({ scrollY: 200, delta: 20 })).toBe(true);
    expect(computeTopChromeHidden({ scrollY: 200, delta: -6 })).toBe(false);
    expect(computeTopChromeHidden({ scrollY: 200, delta: 2 })).toBe(null);
    expect(computeTopChromeHidden({ scrollY: 10, delta: 20 })).toBe(false);
  });
});
