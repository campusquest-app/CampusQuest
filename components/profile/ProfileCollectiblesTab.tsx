"use client";

import type { Character } from "@/lib/types";
import { AdventurersCodex } from "@/components/codex/AdventurersCodex";

export function ProfileCollectiblesTab({ character }: { character: Character }) {
  return <AdventurersCodex character={character} />;
}
