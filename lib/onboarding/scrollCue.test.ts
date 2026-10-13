import { describe, expect, it } from "vitest";
import { shouldShowScrollCue } from "@/lib/onboarding/scrollCue";

describe("shouldShowScrollCue", () => {
  it("stays hidden when the content fits", () => {
    expect(shouldShowScrollCue({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 })).toBe(false);
    expect(shouldShowScrollCue({ scrollHeight: 406, clientHeight: 400, scrollTop: 0 })).toBe(false);
  });

  it("shows when more content sits below the viewport", () => {
    expect(shouldShowScrollCue({ scrollHeight: 900, clientHeight: 500, scrollTop: 0 })).toBe(true);
  });

  it("hides once the user is near the bottom and returns if they scroll up", () => {
    expect(shouldShowScrollCue({ scrollHeight: 900, clientHeight: 500, scrollTop: 390 })).toBe(false);
    expect(shouldShowScrollCue({ scrollHeight: 900, clientHeight: 500, scrollTop: 40 })).toBe(true);
  });
});
