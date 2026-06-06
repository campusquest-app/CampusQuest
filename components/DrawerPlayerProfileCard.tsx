"use client";

import { Flame } from "lucide-react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { getGuildById } from "@/lib/guildStore";
import { getLevelThresholds } from "@/lib/xpOverlayMath";

const SCHOLAR_GUILD_LABELS: Record<string, string> = {
  arts_sciences: "Arts & Sciences Guild",
  business: "Business Guild",
  education: "Education Guild",
  engineering: "Engineering Guild",
  health_sciences: "Health Sciences Guild",
  environment_life_sciences: "Environment & Life Guild",
  nursing: "Nursing Guild",
  pharmacy: "Pharmacy Guild",
};

function resolveGuildLabel(character: Character): string | null {
  const socialGuildId = character.guildIds?.[0] ?? character.guildId;
  if (socialGuildId) {
    const guild = getGuildById(socialGuildId);
    if (guild?.name) return guild.name;
  }
  const scholarId = character.scholarGuildId;
  if (scholarId && scholarId !== "undecided") {
    return SCHOLAR_GUILD_LABELS[scholarId] ?? "Scholars Guild";
  }
  return null;
}

export function DrawerPlayerProfileCard({
  character,
  onOpenProfile,
}: {
  character: Character;
  onOpenProfile: () => void;
}) {
  const xp = getLevelThresholds(character.totalXP);
  const guildLabel = resolveGuildLabel(character);
  const showStreak = character.streakDays >= 3;

  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="cq-drawer-profile-card group mx-3 mb-4 mt-4 w-[calc(100%-1.5rem)] rounded-2xl border border-[rgba(100,180,255,0.2)] bg-cq-card/90 p-4 text-left shadow-[0_0_28px_-10px_rgba(76,201,255,0.35)] backdrop-blur-md transition active:scale-[0.99] touch-manipulation"
      aria-label={`Open profile for ${character.name}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="cq-drawer-profile-avatar-ring relative shrink-0">
          <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center overflow-hidden rounded-full border-2 border-cq-accent/45 bg-cq-elevated shadow-[0_0_20px_-4px_rgba(76,201,255,0.45)] ring-2 ring-cq-accent/20 ring-offset-2 ring-offset-cq-card">
            <AvatarDisplay
              avatar={character.avatar}
              size={68}
              classId={character.classId}
              starterWeapon={character.starterWeapon}
            />
          </div>
          <span
            className="cq-profile-level-pip absolute -bottom-0.5 -right-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border-2 border-cq-card px-0.5 text-[9px] font-bold leading-none text-white"
            aria-hidden
          >
            {character.level}
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate font-display text-base font-bold tracking-tight text-white">
              {character.name}
            </h2>
            <span className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] text-cyan-200">
              LEVEL {character.level}
            </span>
          </div>
          {guildLabel ? (
            <p className="mt-1 truncate text-[11px] font-medium text-white/52">{guildLabel}</p>
          ) : null}
          <p className="mt-0.5 truncate text-[11px] text-white/32">@{character.username}</p>
        </div>
      </div>

      <div className="mt-3.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-medium tabular-nums text-white/42">
          <span>{character.totalXP.toLocaleString()} XP</span>
          <span>Next level: {xp.xpToNext.toLocaleString()} XP</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="cq-drawer-profile-xp-fill h-full rounded-full bg-gradient-to-r from-[#4CC9FF]/90 via-[#6EDCFF]/85 to-[#8EE4FF]/90 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(4, xp.progressRatio * 100))}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] tabular-nums text-white/35">
          {xp.progressCurrent.toLocaleString()} / {xp.progressNeeded.toLocaleString()} XP this level
        </p>
      </div>

      {showStreak ? (
        <div className="mt-2.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200/90">
            <Flame className="h-3.5 w-3.5 text-orange-400" strokeWidth={2.2} />
            {character.streakDays}-Day Streak
          </span>
        </div>
      ) : null}
    </button>
  );
}
