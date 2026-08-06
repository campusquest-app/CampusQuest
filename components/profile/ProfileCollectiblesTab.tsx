"use client";

import type { Character } from "@/lib/types";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { AdventurersCodex } from "@/components/codex/AdventurersCodex";

export function ProfileCollectiblesTab({ character }: { character: Character }) {
  if (!FEATURE_FLAGS.codex) return null;
  return <AdventurersCodex character={character} />;
}
