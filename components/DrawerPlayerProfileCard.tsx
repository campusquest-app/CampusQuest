"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Character } from "@/lib/types";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { isServerBackedUserId } from "@/lib/client/gameStateSync";
import { getLevelThresholds } from "@/lib/xpOverlayMath";

type CampusRankResponse = {
  currentUserRank: number | null;
};

export function DrawerPlayerProfileCard({
  character,
  onOpenProfile,
  menuOpen = false,
}: {
  character: Character;
  onOpenProfile: () => void;
  menuOpen?: boolean;
}) {
  const xp = getLevelThresholds(character.totalXP);
  const progressPct = Math.min(100, Math.max(2, xp.progressRatio * 100));
  const [campusRank, setCampusRank] = useState<number | null>(null);

  useEffect(() => {
    if (!menuOpen || !isServerBackedUserId(character.id)) {
      return undefined;
    }

    let cancelled = false;
    void fetchAuthed<CampusRankResponse>("/api/leaderboards/campus?sort=totalXp")
      .then((data) => {
        if (!cancelled) setCampusRank(data.currentUserRank ?? null);
      })
      .catch(() => {
        if (!cancelled) setCampusRank(null);
      });

    return () => {
      cancelled = true;
    };
  }, [menuOpen, character.id]);

  return (
    <button
      type="button"
      onClick={onOpenProfile}
      className="cq-drawer-identity group w-full px-4 py-4 text-left touch-manipulation"
      aria-label={`Open profile for ${character.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="cq-drawer-identity-avatar-wrap relative shrink-0">
          <div className="cq-drawer-identity-avatar cq-profile-avatar-shell relative h-14 w-14">
            <div className="cq-profile-avatar-inner h-full w-full overflow-hidden rounded-full border border-sky-400/35">
              <AvatarDisplay
                avatar={character.avatar}
                fitParent
                size={56}
                className="rounded-full"
                classId={character.classId}
                starterWeapon={character.starterWeapon}
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate font-display text-[1.05rem] font-bold leading-tight tracking-tight text-white">
            {character.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/52">@{character.username}</p>
          <p className="mt-1.5 text-xs font-medium tabular-nums text-sky-100/88">
            Level {xp.level}
            <span className="mx-1.5 text-white/25" aria-hidden>
              •
            </span>
            {character.totalXP.toLocaleString()} XP
          </p>
          {campusRank != null ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-uri-gold/90">
              Rank #{campusRank.toLocaleString()}
            </p>
          ) : null}
        </div>

        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-white/28 transition group-hover:text-white/50"
          aria-hidden
        />
      </div>

      <div className="mt-3.5">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium tabular-nums text-white/42">
          <span>
            {xp.progressCurrent.toLocaleString()} / {xp.progressNeeded.toLocaleString()} XP
          </span>
          <span>{xp.xpToNext.toLocaleString()} to Level {xp.level + 1}</span>
        </div>
        <div className="cq-drawer-identity-progress h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="cq-drawer-identity-progress-fill h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </button>
  );
}
