/**
 * Normalized avatar onboarding state.
 * DiceBearAvatarV2 remains the render/persist payload; this layer adds
 * starter preset + class vibe + manual-override protection.
 */

import {
  getDefaultDiceBearAvatar,
  parseDiceBearAvatar,
  randomDiceBearSeed,
  serializeDiceBearAvatar,
  type DiceBearAvatarV2,
  type DiceBearStyleId,
} from "@/lib/dicebearAvatar";
import {
  AVATAR_LOOK_PRESETS,
  resolveAvatarPreset,
  type AvatarLookPreset,
} from "@/lib/avatarPresets";
import {
  buildDiceBearForClass,
  type CharacterClassId,
  CHARACTER_CLASSES,
} from "@/lib/characterClasses";
import { randomAppearanceOptions, randomBackgroundColors } from "@/lib/dicebearAdvancedOptions";

export type AvatarClassType = CharacterClassId;

export type AvatarManualField =
  | "background"
  | "skinTone"
  | "hairStyle"
  | "hairColor"
  | "eyes"
  | "mouth"
  | "glasses"
  | "features"
  | "seed"
  | "style";

export type AvatarManualOverrides = Partial<Record<AvatarManualField, boolean>>;

/**
 * Single source of truth for avatar onboarding preview + save.
 * Maps closely to the product AvatarConfig shape while keeping DiceBear intact.
 */
export type AvatarConfig = {
  presetId: string | null;
  classType: AvatarClassType;
  background: string;
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  eyes: string;
  mouth: string;
  glasses: string | null;
  features: string[];
  seed: string;
  style: DiceBearStyleId;
  /** Full DiceBear options bag (style-specific keys beyond the normalized fields). */
  options: Record<string, unknown>;
};

export function cloneAvatarConfig(config: AvatarConfig): AvatarConfig {
  return {
    ...config,
    features: [...config.features],
    options: { ...config.options },
  };
}

function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]!;
  return "";
}

function firstColor(value: unknown): string {
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]!;
  if (typeof value === "string") return value;
  return "041e42";
}

function glassesFromOptions(options: Record<string, unknown>): string | null {
  if (options.glassesProbability === 0) return null;
  const g = firstString(options.glasses);
  return g || null;
}

function featuresFromOptions(options: Record<string, unknown>): string[] {
  if (options.featuresProbability === 0) return [];
  if (Array.isArray(options.features)) {
    return options.features.filter((x): x is string => typeof x === "string");
  }
  return [];
}

function skinFromOptions(options: Record<string, unknown>): string {
  return firstString(options.skinColor) || firstString(options.baseColor) || "e8b4a0";
}

function hairStyleFromOptions(options: Record<string, unknown>): string {
  return firstString(options.hair) || firstString(options.head) || "";
}

function hairColorFromOptions(options: Record<string, unknown>): string {
  return firstString(options.hairColor) || firstString(options.headContrastColor) || "1a1a1a";
}

function eyesFromOptions(options: Record<string, unknown>): string {
  return firstString(options.eyes) || firstString(options.face) || "";
}

function mouthFromOptions(options: Record<string, unknown>): string {
  return firstString(options.mouth) || "";
}

/** Build normalized AvatarConfig from a DiceBear payload + class/preset ids. */
export function avatarConfigFromDiceBear(
  data: DiceBearAvatarV2,
  args?: { presetId?: string | null; classType?: AvatarClassType },
): AvatarConfig {
  const options = { ...data.options };
  return {
    presetId: args?.presetId ?? null,
    classType: args?.classType ?? "knight",
    background: firstColor(options.backgroundColor),
    skinTone: skinFromOptions(options),
    hairStyle: hairStyleFromOptions(options),
    hairColor: hairColorFromOptions(options),
    eyes: eyesFromOptions(options),
    mouth: mouthFromOptions(options),
    glasses: glassesFromOptions(options),
    features: featuresFromOptions(options),
    seed: data.seed,
    style: data.style,
    options,
  };
}

/** Convert AvatarConfig → DiceBearAvatarV2 for rendering / persistence. */
export function avatarConfigToDiceBear(config: AvatarConfig): DiceBearAvatarV2 {
  return {
    v: 2,
    style: config.style,
    seed: config.seed,
    options: { ...config.options },
  };
}

export function serializeAvatarConfig(config: AvatarConfig): string {
  return serializeDiceBearAvatar(avatarConfigToDiceBear(config));
}

export function isValidAvatarClassType(value: string | null | undefined): value is AvatarClassType {
  return CHARACTER_CLASSES.some((c) => c.id === value);
}

export function createDefaultAvatarConfig(): AvatarConfig {
  const preset = AVATAR_LOOK_PRESETS[0]!;
  return avatarConfigFromPreset(preset, "knight");
}

export function avatarConfigFromPreset(
  preset: AvatarLookPreset,
  classType: AvatarClassType = "knight",
): AvatarConfig {
  const resolved = resolveAvatarPreset(preset);
  return avatarConfigFromDiceBear(resolved, {
    presetId: preset.seed,
    classType,
  });
}

export function avatarConfigFromClass(classId: AvatarClassType): AvatarConfig {
  return avatarConfigFromDiceBear(buildDiceBearForClass(classId), {
    presetId: null,
    classType: classId,
  });
}

function copyNormalizedField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  field: AvatarManualField,
): void {
  switch (field) {
    case "background":
      if ("backgroundColor" in source) target.backgroundColor = source.backgroundColor;
      if ("backgroundType" in source) target.backgroundType = source.backgroundType;
      break;
    case "skinTone":
      if ("skinColor" in source) target.skinColor = source.skinColor;
      if ("baseColor" in source) target.baseColor = source.baseColor;
      break;
    case "hairStyle":
      if ("hair" in source) target.hair = source.hair;
      if ("head" in source) target.head = source.head;
      break;
    case "hairColor":
      if ("hairColor" in source) target.hairColor = source.hairColor;
      if ("headContrastColor" in source) target.headContrastColor = source.headContrastColor;
      break;
    case "eyes":
      if ("eyes" in source) target.eyes = source.eyes;
      if ("face" in source) target.face = source.face;
      break;
    case "mouth":
      if ("mouth" in source) target.mouth = source.mouth;
      break;
    case "glasses":
      if ("glasses" in source) target.glasses = source.glasses;
      if ("glassesProbability" in source) target.glassesProbability = source.glassesProbability;
      break;
    case "features":
      if ("features" in source) target.features = source.features;
      if ("featuresProbability" in source) target.featuresProbability = source.featuresProbability;
      break;
    default:
      break;
  }
}

/**
 * Apply a class vibe. Only overwrites fields the user has not manually edited.
 */
export function applyClassToAvatarConfig(
  current: AvatarConfig,
  classId: AvatarClassType,
  overrides: AvatarManualOverrides,
): AvatarConfig {
  const bootstrap = buildDiceBearForClass(classId);
  const keepStyle = overrides.style === true;
  const keepSeed = overrides.seed === true;

  if (keepStyle) {
    const nextOptions = { ...current.options };
    if (!overrides.background) {
      nextOptions.backgroundColor = bootstrap.options.backgroundColor;
      nextOptions.backgroundType = bootstrap.options.backgroundType ?? ["gradientLinear"];
    }
    return avatarConfigFromDiceBear(
      {
        v: 2,
        style: current.style,
        seed: keepSeed ? current.seed : bootstrap.seed,
        options: nextOptions,
      },
      { presetId: current.presetId, classType: classId },
    );
  }

  const nextOptions: Record<string, unknown> = { ...bootstrap.options };
  const optionFields: AvatarManualField[] = [
    "background",
    "skinTone",
    "hairStyle",
    "hairColor",
    "eyes",
    "mouth",
    "glasses",
    "features",
  ];
  for (const field of optionFields) {
    if (overrides[field]) {
      copyNormalizedField(nextOptions, current.options, field);
    }
  }

  return avatarConfigFromDiceBear(
    {
      v: 2,
      style: bootstrap.style,
      seed: keepSeed ? current.seed : bootstrap.seed,
      options: nextOptions,
    },
    { presetId: current.presetId, classType: classId },
  );
}

/** Full randomize — produces a complete valid config (clears starter preset link). */
export function randomizeAvatarConfig(
  current: AvatarConfig,
  style?: DiceBearStyleId,
): AvatarConfig {
  const nextStyle = style ?? current.style;
  const appearance = randomAppearanceOptions(nextStyle);
  const data: DiceBearAvatarV2 = {
    v: 2,
    style: nextStyle,
    seed: randomDiceBearSeed(),
    options: {
      backgroundColor: randomBackgroundColors(),
      backgroundType: ["gradientLinear"],
      ...appearance,
    },
  };
  return avatarConfigFromDiceBear(data, {
    presetId: null,
    classType: current.classType,
  });
}

/**
 * Restore the selected starter preset (or class look if no preset).
 * Pass `starterId` when randomize cleared `config.presetId` but the UI still
 * remembers the last chosen starter card.
 */
export function resetAvatarConfigToStarter(
  config: AvatarConfig,
  starterId?: string | null,
): AvatarConfig {
  const id = starterId ?? config.presetId;
  if (id) {
    const preset = AVATAR_LOOK_PRESETS.find((p) => p.seed === id);
    if (preset) return avatarConfigFromPreset(preset, config.classType);
  }
  return avatarConfigFromClass(config.classType);
}

export function markOverride(
  overrides: AvatarManualOverrides,
  field: AvatarManualField,
): AvatarManualOverrides {
  return { ...overrides, [field]: true };
}

export function clearOverrides(): AvatarManualOverrides {
  return {};
}

/** Mark all common appearance fields as manually overridden (after advanced edits / randomize). */
export function markAllAppearanceOverrides(): AvatarManualOverrides {
  return {
    background: true,
    skinTone: true,
    hairStyle: true,
    hairColor: true,
    eyes: true,
    mouth: true,
    glasses: true,
    features: true,
    seed: true,
    style: true,
  };
}

export function patchAvatarConfigOptions(
  current: AvatarConfig,
  partial: Record<string, unknown>,
  overrides: AvatarManualOverrides,
  touched: AvatarManualField[],
): { config: AvatarConfig; overrides: AvatarManualOverrides } {
  const nextData: DiceBearAvatarV2 = {
    v: 2,
    style: current.style,
    seed: current.seed,
    options: { ...current.options, ...partial },
  };
  let nextOverrides = { ...overrides };
  for (const field of touched) {
    nextOverrides = markOverride(nextOverrides, field);
  }
  return {
    config: avatarConfigFromDiceBear(nextData, {
      presetId: current.presetId,
      classType: current.classType,
    }),
    overrides: nextOverrides,
  };
}

export function parseStoredAvatarConfig(
  avatarJson: string | null | undefined,
  classId?: string | null,
): AvatarConfig | null {
  if (!avatarJson?.trim()) return null;
  const parsed = parseDiceBearAvatar(avatarJson.trim());
  if (!parsed) return null;
  const classType = isValidAvatarClassType(classId) ? classId : "knight";
  return avatarConfigFromDiceBear(parsed, { classType, presetId: null });
}

export function getDefaultDiceBearFallback(): DiceBearAvatarV2 {
  return getDefaultDiceBearAvatar();
}

const USERNAME_REGEX = /^[a-z0-9_]+$/;

/** Client-side gate before PATCH — mirrors CharacterGate required fields. */
export function canCompleteAvatarOnboarding(args: {
  displayName: string;
  username: string;
  config: AvatarConfig | null | undefined;
}): boolean {
  const name = args.displayName.trim();
  const username = args.username.trim().toLowerCase();
  if (name.length < 1 || name.length > 40) return false;
  if (username.length < 3 || username.length > 25) return false;
  if (!USERNAME_REGEX.test(username)) return false;
  if (!args.config?.classType) return false;
  if (!args.config.seed || !args.config.style) return false;
  return true;
}

/** Idempotent profile PATCH body for finishing avatar onboarding. */
export function buildAvatarOnboardingSavePayload(args: {
  displayName: string;
  username: string;
  config: AvatarConfig;
  starterWeapon?: string | null;
}): Record<string, unknown> {
  return {
    displayName: args.displayName.trim(),
    username: args.username.trim().toLowerCase(),
    avatarCustomJson: serializeAvatarConfig(args.config),
    characterClassId: args.config.classType,
    starterWeapon: args.starterWeapon ?? null,
    scholarGuildId: "undecided",
    characterOnboardingComplete: true,
  };
}
