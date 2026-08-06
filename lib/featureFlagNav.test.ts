import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { getVisibleProfileTabs } from "@/components/profile/ProfileTabNav";

describe("feature flag navigation gating", () => {
  it("hides Manual Log and Boss Battle drawer destinations while disabled", () => {
    const progressNav = [
      { id: "scan" },
      { id: "character-sheet" },
      { id: "manual-log" },
      { id: "quest-board" },
    ].filter((item) => item.id !== "manual-log" || FEATURE_FLAGS.manualLog);

    const miniGamesNav = [
      { id: "battle" },
      { id: "mini-games" },
    ].filter((item) => item.id !== "battle" || FEATURE_FLAGS.bossBattles);

    expect(progressNav.map((i) => i.id)).toEqual(["scan", "character-sheet", "quest-board"]);
    expect(miniGamesNav.map((i) => i.id)).toEqual(["mini-games"]);
    expect(progressNav.some((i) => i.id === "manual-log")).toBe(false);
    expect(miniGamesNav.some((i) => i.id === "battle")).toBe(false);
  });

  it("restores drawer destinations when flags are enabled", () => {
    const flags = { manualLog: true, bossBattles: true };
    const progressNav = [
      { id: "scan" },
      { id: "manual-log" },
      { id: "quest-board" },
    ].filter((item) => item.id !== "manual-log" || flags.manualLog);
    const miniGamesNav = [
      { id: "battle" },
      { id: "mini-games" },
    ].filter((item) => item.id !== "battle" || flags.bossBattles);

    expect(progressNav.some((i) => i.id === "manual-log")).toBe(true);
    expect(miniGamesNav.some((i) => i.id === "battle")).toBe(true);
  });

  it("hides the Codex profile tab while FEATURE_FLAGS.codex is false", () => {
    const tabs = getVisibleProfileTabs(FEATURE_FLAGS);
    expect(tabs.map((t) => t.id)).toEqual(["posts", "tagged", "memories", "activity"]);
    expect(tabs.some((t) => t.id === "collectibles")).toBe(false);
  });

  it("restores the Codex profile tab when FEATURE_FLAGS.codex is true", () => {
    const tabs = getVisibleProfileTabs({ codex: true });
    expect(tabs.some((t) => t.id === "collectibles")).toBe(true);
    expect(tabs.find((t) => t.id === "collectibles")?.label).toBe("Codex");
  });
});
