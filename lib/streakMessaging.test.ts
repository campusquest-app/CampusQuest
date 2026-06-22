import { describe, expect, it } from "vitest";
import {
  formatStreakTitle,
  formatTopNavStreakLine,
  isStreakDangerWindow,
  shouldShowStreakDanger,
  streakProtectionLine,
  streakSubtitle,
} from "@/lib/streakMessaging";

describe("streakMessaging", () => {
  it("formats active streak titles in RPG style", () => {
    expect(formatStreakTitle(1)).toBe("🔥 1-Day Streak");
    expect(formatStreakTitle(7)).toBe("🔥 7-Day Streak");
  });

  it("only shows danger after 8 PM local time", () => {
    const afternoon = new Date("2026-06-11T15:00:00");
    const evening = new Date("2026-06-11T20:30:00");

    expect(isStreakDangerWindow(afternoon)).toBe(false);
    expect(isStreakDangerWindow(evening)).toBe(true);
    expect(shouldShowStreakDanger(3, 0, afternoon)).toBe(false);
    expect(shouldShowStreakDanger(3, 0, evening)).toBe(true);
    expect(shouldShowStreakDanger(3, 20, evening)).toBe(false);
  });

  it("uses player-friendly copy for active streaks", () => {
    expect(streakSubtitle(2, 0)).toBe("Keep your adventure alive.");
    expect(streakProtectionLine(2, 0)).toBe(
      "Complete an activity before midnight to protect your streak.",
    );
  });

  it("formats compact top nav streak lines", () => {
    const afternoon = new Date("2026-06-11T15:00:00");
    const evening = new Date("2026-06-11T20:30:00");

    expect(formatTopNavStreakLine(5, 0, afternoon)).toBe("🔥 5-Day Streak");
    expect(formatTopNavStreakLine(5, 0, evening)).toBe("🔥 5-Day Streak • Protect today");
    expect(formatTopNavStreakLine(5, 20, evening)).toBe("🔥 5-Day Streak • Secured");
  });
});
