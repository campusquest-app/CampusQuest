import { describe, expect, it } from "vitest";
import { resolveMarkerIconKind, resolveMarkerTone } from "@/lib/realm/realmMarkerVisuals";

describe("realmMarkerVisuals", () => {
  it("maps activity variants to distinct tones", () => {
    expect(resolveMarkerTone("quest", false)).toBe("quest");
    expect(resolveMarkerTone("event", false)).toBe("event");
    expect(resolveMarkerTone("memories", false)).toBe("memories");
    expect(resolveMarkerTone("qr", false)).toBe("qr");
    expect(resolveMarkerTone("default", false)).toBe("building");
  });

  it("uses admin tone in edit mode", () => {
    expect(resolveMarkerTone("quest", true)).toBe("admin");
  });

  it("picks landmark icons when variant is default", () => {
    expect(resolveMarkerIconKind("default", "library", false)).toBe("book");
    expect(resolveMarkerIconKind("default", "rec-center", false)).toBe("dumbbell");
  });

  it("picks activity icons over landmarks", () => {
    expect(resolveMarkerIconKind("quest", "library", false)).toBe("scroll");
    expect(resolveMarkerIconKind("qr", "library", false)).toBe("qr");
  });
});
