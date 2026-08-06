import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_FALLBACK_TAB,
  FEATURE_FLAG_PROFILE_FALLBACK,
  filterQuestsForFeatureFlags,
  isBossBattleQuest,
  isManualLogOnlyQuest,
} from "@/lib/featureFlags";

describe("featureFlags", () => {
  it("defaults to hiding Manual Log, Boss Battles, Codex, and Equipment", () => {
    expect(FEATURE_FLAGS.manualLog).toBe(false);
    expect(FEATURE_FLAGS.bossBattles).toBe(false);
    expect(FEATURE_FLAGS.codex).toBe(false);
    expect(FEATURE_FLAGS.equipment).toBe(false);
    expect(FEATURE_FLAGS.requireEmailVerification).toBe(false);
    expect(FEATURE_FLAG_FALLBACK_TAB).toBe("quest-board");
    expect(FEATURE_FLAG_PROFILE_FALLBACK).toEqual({
      tab: "character",
      characterPane: "profile",
      profileTab: "posts",
    });
  });

  it("identifies Manual Log-only quests and Boss Battle quests", () => {
    expect(
      isManualLogOnlyQuest({
        completionMethod: "manual_log",
        requiresQr: false,
        canClaim: false,
      }),
    ).toBe(true);
    expect(
      isManualLogOnlyQuest({
        completionMethod: "manual_log",
        requiresQr: true,
      }),
    ).toBe(false);
    expect(
      isManualLogOnlyQuest({
        completionMethod: "manual_log",
        canClaim: true,
      }),
    ).toBe(false);

    expect(isBossBattleQuest({ name: "Boss Battle", templateId: "tpl-boss-battle" })).toBe(true);
    expect(isBossBattleQuest({ name: "Study Session" })).toBe(false);
  });

  it("hides Manual Log-only and Boss Battle quests while disabled", () => {
    const filtered = filterQuestsForFeatureFlags(
      [
        { name: "Study", completionMethod: "manual_log", canClaim: true },
        { name: "Hidden Manual", completionMethod: "manual_log", canClaim: false, requiresQr: false },
        { name: "Boss Battle", templateId: "tpl-boss-battle", completionMethod: "qr_scan", requiresQr: true },
        { name: "Gym QR", completionMethod: "qr_scan", requiresQr: true },
      ],
      { manualLog: false, bossBattles: false },
    );
    expect(filtered.map((q) => q.name)).toEqual(["Study", "Gym QR"]);
  });

  it("restores quest visibility when flags are enabled", () => {
    const filtered = filterQuestsForFeatureFlags(
      [
        { name: "Hidden Manual", completionMethod: "manual_log", canClaim: false, requiresQr: false },
        { name: "Boss Battle", templateId: "tpl-boss-battle" },
      ],
      { manualLog: true, bossBattles: true },
    );
    expect(filtered).toHaveLength(2);
  });
});
