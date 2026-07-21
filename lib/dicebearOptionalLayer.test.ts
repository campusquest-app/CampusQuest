import { describe, expect, it } from "vitest";
import {
  isOptionalLayerNoneSelected,
  isOptionalLayerVariantSelected,
  parseDiceBearAvatar,
  serializeDiceBearAvatar,
  type DiceBearAvatarV2,
} from "./dicebearAvatar";

describe("optional appearance layer selection (None option)", () => {
  it("marks None selected when the layer probability is 0, even with a stale variant array", () => {
    // Legacy saved avatars kept e.g. glasses: ["light04"] with glassesProbability: 0.
    expect(isOptionalLayerNoneSelected(["light04"], 0)).toBe(true);
    expect(isOptionalLayerNoneSelected(undefined, 0)).toBe(true);
    expect(isOptionalLayerNoneSelected(null, 0)).toBe(true);
  });

  it("marks None selected when no variant is stored", () => {
    expect(isOptionalLayerNoneSelected(undefined, undefined)).toBe(true);
    expect(isOptionalLayerNoneSelected([], 100)).toBe(true);
  });

  it("does not mark None selected while a variant is active", () => {
    expect(isOptionalLayerNoneSelected(["light04"], 100)).toBe(false);
  });

  it("never marks a variant selected while the layer is disabled", () => {
    expect(isOptionalLayerVariantSelected(["light04"], "light04", 0)).toBe(false);
    expect(isOptionalLayerVariantSelected(["light04"], "light04", 100)).toBe(true);
    expect(isOptionalLayerVariantSelected(["dark01"], "light04", 100)).toBe(false);
    expect(isOptionalLayerVariantSelected(undefined, "light04", 100)).toBe(false);
  });

  it("drops cleared variant keys on save so None persists across reloads", () => {
    const avatar: DiceBearAvatarV2 = {
      v: 2,
      style: "pixelArt",
      seed: "test-seed",
      // Selecting "None" in the editor patches the option key to undefined + probability 0.
      options: { glasses: undefined, glassesProbability: 0, hair: ["short04"] },
    };

    const reloaded = parseDiceBearAvatar(serializeDiceBearAvatar(avatar));
    expect(reloaded).not.toBeNull();
    expect("glasses" in (reloaded?.options ?? {})).toBe(false);
    expect(reloaded?.options.glassesProbability).toBe(0);
    expect(reloaded?.options.hair).toEqual(["short04"]);
    expect(
      isOptionalLayerNoneSelected(reloaded?.options.glasses, reloaded?.options.glassesProbability),
    ).toBe(true);
  });
});
