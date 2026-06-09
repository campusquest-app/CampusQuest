"use client";

import type { Character } from "@/lib/types";
import { SkillTreePanel } from "./SkillTreePanel";
import { LoreArchiveCard } from "./LoreArchiveCard";

export function SkillsLoreScreen({
  character,
  onRefresh,
}: {
  character: Character;
  onRefresh?: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5 pb-8">
      <header className="space-y-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">Skills &amp; Lore</h1>
        <p className="text-sm text-white/55">Unlock skill nodes and browse CampusQuest lore.</p>
      </header>

      <SkillTreePanel character={character} onRefresh={onRefresh} />
      <LoreArchiveCard />
    </div>
  );
}
