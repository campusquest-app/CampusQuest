"use client";

/**
 * Client-only DiceBear SVG generation. Keep `@dicebear/*` imports out of `dicebearAvatar.ts`
 * so metadata/parsing never pulls the full collection into the server RSC/runtime graph.
 */

import { createAvatar } from "@dicebear/core";
import * as collection from "@dicebear/collection";
import type { DiceBearAvatarV2 } from "./dicebearAvatar";
import { buildDiceBearCreateOptions, stripSvgClipPaths } from "./dicebearFrame";

export const DICEBEAR_STYLE_MODULES = {
  lorelei: collection.lorelei,
  loreleiNeutral: collection.loreleiNeutral,
  pixelArt: collection.pixelArt,
  pixelArtNeutral: collection.pixelArtNeutral,
  openPeeps: collection.openPeeps,
  adventurer: collection.adventurer,
  adventurerNeutral: collection.adventurerNeutral,
  micah: collection.micah,
} as const;

export function createDiceBearSvgString(data: DiceBearAvatarV2): string {
  const styleMod = DICEBEAR_STYLE_MODULES[data.style];
  if (!styleMod) return "";

  const avatar = createAvatar(styleMod as Parameters<typeof createAvatar>[0], buildDiceBearCreateOptions({
    seed: data.seed,
    options: data.options,
  }) as Parameters<typeof createAvatar>[1]);

  return ensureSvgCoverAspect(stripSvgClipPaths(avatar.toString()));
}

function ensureSvgCoverAspect(svg: string): string {
  if (/preserveAspectRatio=/i.test(svg)) {
    return svg.replace(/preserveAspectRatio="[^"]*"/i, 'preserveAspectRatio="xMidYMid slice"');
  }
  return svg.replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid slice"');
}
