"use client";

import { Flame, Sparkles } from "lucide-react";
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
      className="cq-drawer-profile-card group mx-2 mb-2 mt-2 w-[calc(100%-1rem)] rounded-xl border border-[rgba(100,180,255,0.2)] bg-cq-card/95 p-2.5 text-left touch-manipulation"
      aria-label={`Open profile for ${character.name}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="cq-drawer-profile-avatar-ring cq-profile-avatar-shell relative shrink-0">
          <div className="cq-profile-avatar-inner cq-profile-avatar-inner--drawer flex items-center justify-center border-2 border-cq-accent/45 ring-1 ring-cq-accent/20 ring-offset-1 ring-offset-cq-card">
            <AvatarDisplay
              avatar={character.avatar}
              size={48}
              className="rounded-full"
              classId={character.classId}
              starterWeapon={character.starterWeapon}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-sm font-bold tracking-tight text-white">{character.name}</h2>
          <p className="truncate text-[10px] text-white/48">@{character.username}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="cq-drawer-level-badge inline-flex items-center gap-0.5 rounded-md border border-amber-300/30 bg-gradient-to-br from-amber-400/18 via-cyan-400/10 to-cyan-500/6 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-100">
              <Sparkles className="h-2.5 w-2.5 text-amber-200/90" strokeWidth={2.4} aria-hidden />
              Lv.{character.level}
            </span>
            {guildLabel ? (
              <span className="max-w-[8.5rem] truncate rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/52">
                {guildLabel}
              </span>
            ) : null}
            {showStreak ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-200/82">
                <Flame className="h-3 w-3 text-orange-400" strokeWidth={2.2} aria-hidden />
                {character.streakDays}d
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-0.5 flex items-center justify-between gap-2 text-[9px] font-semibold tabular-nums">
          <span className="text-cyan-100/78">{character.totalXP.toLocaleString()} XP</span>
          <span className="text-white/42">
            {xp.progressCurrent.toLocaleString()}/{xp.progressNeeded.toLocaleString()} · {xp.xpToNext.toLocaleString()} to next
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="cq-drawer-profile-xp-fill h-full rounded-full bg-gradient-to-r from-[#4CC9FF]/90 via-[#6EDCFF]/85 to-[#8EE4FF]/90 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(4, xp.progressRatio * 100))}%` }}
          />
        </div>
      </div>
    </button>
  );
}
