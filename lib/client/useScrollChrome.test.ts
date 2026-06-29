import { describe, expect, it } from "vitest";
import {
  computeBottomConcealPx,
  computeHeaderHideOffset,
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

  it("accumulates the hide offset gradually on downward scroll", () => {
    expect(
      computeHeaderHideOffset({ prevOffsetPx: 0, delta: 40, scrollY: 100, range: 140 }),
    ).toBe(40);
  });

  it("does not fully hide after only a tiny scroll", () => {
    const offset = computeHeaderHideOffset({ prevOffsetPx: 0, delta: 12, scrollY: 30, range: 140 });
    expect(offset).toBe(12);
    expect(offset / 140).toBeLessThan(0.6);
  });

  it("caps the offset at the full range (fully hidden)", () => {
    expect(
      computeHeaderHideOffset({ prevOffsetPx: 130, delta: 40, scrollY: 400, range: 140 }),
    ).toBe(140);
  });

  it("unwinds the offset on upward scroll", () => {
    expect(
      computeHeaderHideOffset({ prevOffsetPx: 100, delta: -30, scrollY: 300, range: 140 }),
    ).toBe(70);
  });

  it("floors the offset at 0 when scrolling all the way up", () => {
    expect(
      computeHeaderHideOffset({ prevOffsetPx: 20, delta: -50, scrollY: 200, range: 140 }),
    ).toBe(0);
  });

  it("holds the offset on scroll jitter", () => {
    expect(
      computeHeaderHideOffset({ prevOffsetPx: 80, delta: 1, scrollY: 300, range: 140 }),
    ).toBe(80);
  });

  it("pins fully visible near the very top", () => {
    expect(
      computeHeaderHideOffset({ prevOffsetPx: 100, delta: 30, scrollY: 4, range: 140 }),
    ).toBe(0);
  });
});
