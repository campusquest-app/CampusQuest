/**
 * DiceBear avatar JSON: types + serialization. No `@dicebear/*` imports here (SSR-safe).
 * SVG generation lives in `dicebearSvg.ts` ("use client") and runs only after mount.
 */

export const DICEBEAR_STYLE_IDS = [
  "lorelei",
  "loreleiNeutral",
  "pixelArt",
  "pixelArtNeutral",
  "openPeeps",
  "adventurer",
  "adventurerNeutral",
  "micah",
] as const;

export type DiceBearStyleId = (typeof DICEBEAR_STYLE_IDS)[number];

export type DiceBearAvatarV2 = {
  v: 2;
  style: DiceBearStyleId;
  seed: string;
  /** Style-specific options (e.g. hair, skinColor) merged into createAvatar on the client */
  options: Record<string, unknown>;
};

function isDiceBearStyleId(value: string): value is DiceBearStyleId {
  return (DICEBEAR_STYLE_IDS as readonly string[]).includes(value);
}

/** Deterministic default — must match SSR + client hydration (no random seed here). */
const DEFAULT_STYLE: DiceBearStyleId = "lorelei";
const DEFAULT_SEED = "campusquest-default-avatar";

export function serializeDiceBearAvatar(data: DiceBearAvatarV2): string {
  return JSON.stringify(data);
}

export function isDiceBearAvatarJson(avatar: string): boolean {
  if (typeof avatar !== "string" || !avatar.startsWith("{")) return false;
  try {
    const data = JSON.parse(avatar) as { v?: number };
    return data.v === 2;
  } catch {
    return false;
  }
}

export function parseDiceBearAvatar(avatar: string): DiceBearAvatarV2 | null {
  if (typeof avatar !== "string" || !avatar.startsWith("{")) return null;
  try {
    const data = JSON.parse(avatar) as Partial<DiceBearAvatarV2>;
    if (data.v !== 2 || typeof data.style !== "string" || typeof data.seed !== "string") return null;
    if (!isDiceBearStyleId(data.style)) return null;
    return {
      v: 2,
      style: data.style,
      seed: data.seed,
      options:
        typeof data.options === "object" && data.options != null && !Array.isArray(data.options)
          ? { ...data.options }
          : {},
    };
  } catch {
    return null;
  }
}

export function randomDiceBearSeed(): string {
  const bytes = new Uint8Array(10);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable defaults for onboarding / SSR — identical on server and client. */
export function getDefaultDiceBearAvatar(): DiceBearAvatarV2 {
  return {
    v: 2,
    style: DEFAULT_STYLE,
    seed: DEFAULT_SEED,
    options: {
      backgroundColor: ["041e42"],
      backgroundType: ["gradientLinear"],
    },
  };
}
