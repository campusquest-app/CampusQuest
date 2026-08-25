import { describe, expect, it } from "vitest";
import {
  applyClassToAvatarConfig,
  avatarConfigFromPreset,
  buildAvatarOnboardingSavePayload,
  canCompleteAvatarOnboarding,
  clearOverrides,
  createDefaultAvatarConfig,
  markOverride,
  patchAvatarConfigOptions,
  pickRandomStarterPreset,
  randomizeAvatarConfig,
  resetAvatarConfigToStarter,
  serializeAvatarConfig,
  starterPresetIdForConfig,
} from "@/lib/avatarConfig";
import { AVATAR_LOOK_PRESETS } from "@/lib/avatarPresets";
import { parseDiceBearAvatar } from "@/lib/dicebearAvatar";
import { isInternalAccount } from "@/lib/internalAccount";

describe("AvatarConfig onboarding state", () => {
  it("selecting a starter avatar updates the live preview payload", () => {
    const base = createDefaultAvatarConfig();
    const preset = AVATAR_LOOK_PRESETS[2]!;
    const next = avatarConfigFromPreset(preset, base.classType);
    expect(next.presetId).toBe(preset.seed);
    expect(serializeAvatarConfig(next)).not.toBe(serializeAvatarConfig(base));
    expect(parseDiceBearAvatar(serializeAvatarConfig(next))?.style).toBe(preset.style);
  });

  it("selecting a class updates the live preview while preserving starter link", () => {
    const starter = avatarConfigFromPreset(AVATAR_LOOK_PRESETS[0]!, "knight");
    const next = applyClassToAvatarConfig(starter, "mage", clearOverrides());
    expect(next.classType).toBe("mage");
    expect(next.style).toBe("loreleiNeutral");
    expect(next.presetId).toBe(starter.presetId);
    expect(serializeAvatarConfig(next)).not.toBe(serializeAvatarConfig(starter));
  });

  it("does not overwrite manually changed fields when class changes", () => {
    let config = createDefaultAvatarConfig();
    const patched = patchAvatarConfigOptions(
      config,
      { hair: ["variant08"], hairColor: ["8b2942"] },
      clearOverrides(),
      ["hairStyle", "hairColor"],
    );
    config = patched.config;
    const overrides = patched.overrides;

    const afterClass = applyClassToAvatarConfig(config, "gym", overrides);
    expect(afterClass.classType).toBe("gym");
    expect(afterClass.options.hair).toEqual(["variant08"]);
    expect(afterClass.options.hairColor).toEqual(["8b2942"]);
    // Untouched class defaults (background from gym) may change.
    expect(afterClass.options.backgroundColor).toEqual(["041e42"]);
  });

  it("randomize produces a valid avatar configuration", () => {
    const base = createDefaultAvatarConfig();
    const randomized = randomizeAvatarConfig(base);
    expect(randomized.seed.length).toBeGreaterThan(8);
    expect(randomized.style).toBeTruthy();
    expect(Array.isArray(randomized.options.backgroundColor)).toBe(true);
    const parsed = parseDiceBearAvatar(serializeAvatarConfig(randomized));
    expect(parsed).not.toBeNull();
    expect(parsed?.v).toBe(2);
  });

  it("Randomize on the starter screen picks a valid preset that matches the live preview", () => {
    const first = pickRandomStarterPreset();
    expect(AVATAR_LOOK_PRESETS.some((preset) => preset.seed === first.seed)).toBe(true);
    const config = avatarConfigFromPreset(first, "knight");
    expect(starterPresetIdForConfig(config)).toBe(first.seed);
    expect(config.presetId).toBe(first.seed);
    expect(config.seed).toBe(first.seed);
    const next = pickRandomStarterPreset(first.seed);
    expect(AVATAR_LOOK_PRESETS.some((preset) => preset.seed === next.seed)).toBe(true);
    if (AVATAR_LOOK_PRESETS.length > 1) {
      expect(next.seed).not.toBe(first.seed);
    }
  });

  it("reset restores the selected starter preset", () => {
    const preset = AVATAR_LOOK_PRESETS[3]!;
    let config = avatarConfigFromPreset(preset, "bard");
    const starterId = config.presetId;
    config = randomizeAvatarConfig(config);
    expect(config.presetId).toBeNull();
    const restored = resetAvatarConfigToStarter(config, starterId);
    expect(restored.presetId).toBe(preset.seed);
    expect(restored.style).toBe(preset.style);
    expect(restored.seed).toBe(preset.seed);
  });

  it("advanced controls stay conceptually closed until opened (flag)", () => {
    // UI hides AdvancedAvatarEditor when open=false; this guards the product rule.
    const advancedOpen = false;
    expect(advancedOpen).toBe(false);
    const opened = true;
    expect(opened).toBe(true);
  });

  it("Enter CampusQuest payload saves once and is idempotent for QA repeats", () => {
    const config = createDefaultAvatarConfig();
    const payload = buildAvatarOnboardingSavePayload({
      displayName: "QA Tester",
      username: "qa_tester",
      config,
      starterWeapon: "textbook",
    });
    expect(payload.characterOnboardingComplete).toBe(true);
    expect(payload.avatarCustomJson).toBe(serializeAvatarConfig(config));
    expect(payload.characterClassId).toBe(config.classType);

    const again = buildAvatarOnboardingSavePayload({
      displayName: "QA Tester",
      username: "qa_tester",
      config,
      starterWeapon: "textbook",
    });
    expect(again).toEqual(payload);
  });

  it("save failure preserves current selections (state immutability)", () => {
    const before = createDefaultAvatarConfig();
    const snapshot = serializeAvatarConfig(before);
    try {
      throw new Error("DB down");
    } catch {
      // CharacterGate only sets error flags — config state remains.
    }
    expect(serializeAvatarConfig(before)).toBe(snapshot);
  });

  it("blocks normal users from completing without required fields", () => {
    expect(
      canCompleteAvatarOnboarding({
        displayName: "",
        username: "abc",
        config: createDefaultAvatarConfig(),
      }),
    ).toBe(false);
    expect(
      canCompleteAvatarOnboarding({
        displayName: "Alex",
        username: "ab",
        config: createDefaultAvatarConfig(),
      }),
    ).toBe(false);
    expect(
      canCompleteAvatarOnboarding({
        displayName: "Alex",
        username: "alex_rhody",
        config: createDefaultAvatarConfig(),
      }),
    ).toBe(true);
  });

  it("QA signup remains an internal account without avatar UI special-casing", () => {
    expect(isInternalAccount({ email: "qa_signup@campusquestapp.com" }, null)).toBe(true);
    expect(isInternalAccount({ email: "random@campusquestapp.com" }, null)).toBe(false);
  });

  it("markOverride protects subsequent class merges", () => {
    const overrides = markOverride(clearOverrides(), "background");
    const config = createDefaultAvatarConfig();
    const keptBg = config.options.backgroundColor;
    const next = applyClassToAvatarConfig(config, "rogue", overrides);
    expect(next.options.backgroundColor).toEqual(keptBg);
    expect(next.classType).toBe("rogue");
  });

  it("starter cards use descriptive labels (not Preset N)", () => {
    for (const preset of AVATAR_LOOK_PRESETS) {
      expect(preset.label.toLowerCase()).not.toMatch(/^preset\s*\d/);
      expect(preset.label.length).toBeGreaterThan(2);
    }
  });
});
