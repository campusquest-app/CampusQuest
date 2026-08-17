import { describe, expect, it } from "vitest";
import {
  IDENTITY_TRANSFORM,
  PINCH_MAX_SCALE,
  PINCH_MIN_SCALE,
  PINCH_RESET_MS,
  clampPinchScale,
  computePinchScale,
  computePinchTransform,
  formatPinchTransformCss,
  isIdentityTransform,
  pinchPhaseAllowsCarousel,
  pinchPhaseRaisesLayer,
  shouldSuppressCarouselForPointerCount,
  shouldSuppressClickAfterPinch,
} from "./temporaryPinchZoom";

describe("temporaryPinchZoom", () => {
  describe("scale", () => {
    it("starts at 1 for equal finger distance", () => {
      expect(computePinchScale(100, 100)).toBe(1);
    });

    it("increases when pinching outward", () => {
      expect(computePinchScale(200, 100)).toBe(2);
    });

    it("decreases when pinching inward but stays >= 1", () => {
      expect(computePinchScale(50, 100)).toBe(1);
      expect(clampPinchScale(0.4)).toBe(PINCH_MIN_SCALE);
    });

    it("respects max scale", () => {
      expect(computePinchScale(1000, 100)).toBe(PINCH_MAX_SCALE);
      expect(clampPinchScale(99)).toBe(PINCH_MAX_SCALE);
    });
  });

  describe("focal transform", () => {
    const bounds = { left: 0, top: 0, width: 200, height: 200 };

    it("keeps identity near scale 1", () => {
      const t = computePinchTransform({
        scale: 1,
        initialMidpoint: { x: 100, y: 100 },
        currentMidpoint: { x: 100, y: 100 },
        bounds,
      });
      expect(isIdentityTransform(t)).toBe(true);
    });

    it("pans with midpoint movement while zoomed", () => {
      const t = computePinchTransform({
        scale: 2,
        initialMidpoint: { x: 100, y: 100 },
        currentMidpoint: { x: 130, y: 80 },
        bounds,
      });
      expect(t.scale).toBe(2);
      expect(t.translateX).toBe(30);
      expect(t.translateY).toBe(-20);
    });

    it("zooms around off-center pinch midpoint (not always image center)", () => {
      const t = computePinchTransform({
        scale: 2,
        initialMidpoint: { x: 50, y: 50 },
        currentMidpoint: { x: 50, y: 50 },
        bounds,
      });
      // origin relative to center is (-50,-50); tx = 0 + (-50)*(1-2) = 50
      expect(t.translateX).toBe(50);
      expect(t.translateY).toBe(50);
    });

    it("formats GPU-friendly CSS transform", () => {
      expect(formatPinchTransformCss({ scale: 2, translateX: 10, translateY: -4 })).toBe(
        "translate3d(10px, -4px, 0) scale(2)",
      );
      expect(formatPinchTransformCss(IDENTITY_TRANSFORM)).toBe(
        "translate3d(0px, 0px, 0) scale(1)",
      );
    });
  });

  describe("gesture ownership", () => {
    it("one finger does not suppress carousel", () => {
      expect(shouldSuppressCarouselForPointerCount(1)).toBe(false);
    });

    it("two fingers suppress carousel / tab swipe ownership", () => {
      expect(shouldSuppressCarouselForPointerCount(2)).toBe(true);
    });

    it("pinch suppresses the trailing click/like", () => {
      expect(shouldSuppressClickAfterPinch(true)).toBe(true);
      expect(shouldSuppressClickAfterPinch(false)).toBe(false);
    });

    it("carousel only resumes when idle", () => {
      expect(pinchPhaseAllowsCarousel("idle")).toBe(true);
      expect(pinchPhaseAllowsCarousel("pinching")).toBe(false);
      expect(pinchPhaseAllowsCarousel("resetting")).toBe(false);
    });

    it("layer raises during pinch and reset only", () => {
      expect(pinchPhaseRaisesLayer("idle")).toBe(false);
      expect(pinchPhaseRaisesLayer("pinching")).toBe(true);
      expect(pinchPhaseRaisesLayer("resetting")).toBe(true);
    });
  });

  describe("release contract", () => {
    it("reset duration is spring-like and not sluggish", () => {
      expect(PINCH_RESET_MS).toBeGreaterThanOrEqual(180);
      expect(PINCH_RESET_MS).toBeLessThanOrEqual(250);
    });

    it("release target is exactly identity", () => {
      expect(IDENTITY_TRANSFORM).toEqual({
        scale: 1,
        translateX: 0,
        translateY: 0,
      });
    });
  });
});
