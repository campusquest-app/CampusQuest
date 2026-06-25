import { describe, expect, it } from "vitest";
import {
  computeBottomConcealPx,
  computeTopOffset,
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

  it("moves the header 1:1 with scroll delta", () => {
    let offset = 0;
    offset = computeTopOffset({ prevOffset: offset, delta: 10, scrollY: 100, maxOffset: 120 });
    expect(offset).toBe(10);
    offset = computeTopOffset({ prevOffset: offset, delta: 10, scrollY: 110, maxOffset: 120 });
    expect(offset).toBe(20);
  });

  it("returns the header immediately on upward scroll", () => {
    const offset = computeTopOffset({ prevOffset: 40, delta: -10, scrollY: 200, maxOffset: 120 });
    expect(offset).toBe(30);
  });

  it("holds position when the scroll stops", () => {
    const offset = computeTopOffset({ prevOffset: 55, delta: 0, scrollY: 300, maxOffset: 120 });
    expect(offset).toBe(55);
  });

  it("clamps between fully visible and fully hidden", () => {
    expect(computeTopOffset({ prevOffset: 115, delta: 30, scrollY: 400, maxOffset: 120 })).toBe(120);
    expect(computeTopOffset({ prevOffset: 5, delta: -30, scrollY: 80, maxOffset: 120 })).toBe(0);
  });

  it("fully reveals at the very top", () => {
    expect(computeTopOffset({ prevOffset: 90, delta: 10, scrollY: 0, maxOffset: 120 })).toBe(0);
  });
});
