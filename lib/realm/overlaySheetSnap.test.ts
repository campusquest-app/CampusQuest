import { describe, expect, it } from "vitest";
import { nextOverlaySnap } from "@/lib/realm/overlaySheetSnap";

describe("overlay sheet snaps", () => {
  it("expands upward and collapses or dismisses downward", () => {
    expect(nextOverlaySnap("half", -60)).toBe("full");
    expect(nextOverlaySnap("full", 70)).toBe("half");
    expect(nextOverlaySnap("half", 100)).toBe("closed");
    expect(nextOverlaySnap("full", 160)).toBe("closed");
    expect(nextOverlaySnap("half", 10)).toBe("half");
  });
});
