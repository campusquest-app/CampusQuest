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
    <div className="cq-tab-shell mx-auto w-full max-w-lg space-y-5 pb-8">
      <header className="cq-screen-header">
        <p className="cq-screen-header__eyebrow">Character Growth</p>
        <h1 className="cq-screen-header__title">Skills &amp; Lore</h1>
        <p className="cq-screen-header__subtitle">Unlock skill nodes and browse CampusQuest lore.</p>
      </header>

      <SkillTreePanel character={character} onRefresh={onRefresh} />
      <LoreArchiveCard />
    </div>
  );
}
