import { describe, expect, it } from "vitest";
import { shouldShowBottomNav } from "./shouldShowBottomNav";

describe("shouldShowBottomNav", () => {
  const base = {
    tab: "quad",
    friendProfileOpen: false,
    settingsDrawerOpen: false,
    immersiveScreenDepth: 0,
  };

  it("shows on top-level tabs", () => {
    expect(shouldShowBottomNav({ ...base, tab: "quad" })).toBe(true);
    expect(shouldShowBottomNav({ ...base, tab: "realm" })).toBe(true);
    expect(shouldShowBottomNav({ ...base, tab: "friends" })).toBe(true);
    expect(shouldShowBottomNav({ ...base, tab: "events" })).toBe(true);
    expect(shouldShowBottomNav({ ...base, tab: "character" })).toBe(true);
    expect(shouldShowBottomNav({ ...base, tab: "inbox" })).toBe(true);
  });

  it("hides on secondary tabs", () => {
    expect(shouldShowBottomNav({ ...base, tab: "leaderboards" })).toBe(false);
    expect(shouldShowBottomNav({ ...base, tab: "organizations" })).toBe(false);
    expect(shouldShowBottomNav({ ...base, tab: "guilds" })).toBe(false);
    expect(shouldShowBottomNav({ ...base, tab: "quest-board" })).toBe(false);
  });

  it("hides when immersive overlays are open", () => {
    expect(shouldShowBottomNav({ ...base, immersiveScreenDepth: 1 })).toBe(false);
    expect(shouldShowBottomNav({ ...base, immersiveScreenDepth: 2 })).toBe(false);
  });

  it("hides on friend profile and settings drawer", () => {
    expect(shouldShowBottomNav({ ...base, friendProfileOpen: true })).toBe(false);
    expect(shouldShowBottomNav({ ...base, settingsDrawerOpen: true })).toBe(false);
  });
});
