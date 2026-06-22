"use client";

import type { Character } from "@/lib/types";
import { xpProgressInLevel } from "@/lib/level";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { getEquippedTitleLabel } from "@/lib/achievementEngine";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { formatStreakBadge } from "@/lib/streakMessaging";

export function ProfileSocialHeader({
  character,
  isOwner,
  guildLabel,
  onEditBio,
  onOpenMenu,
}: {
  character: Character;
  isOwner: boolean;
  guildLabel?: string | null;
  onEditBio?: () => void;
  onOpenMenu?: () => void;
}) {
  const { current, needed } = xpProgressInLevel(character.totalXP);
  const xpPct = needed > 0 ? Math.min(100, (current / needed) * 100) : 0;
  const title = getEquippedTitleLabel(character) || getClassTitle(character.classId);
  const realm = getClassRealm(character.classId);

  return (
    <header className="cq-profile-header px-3 pb-3 pt-3 sm:px-4">
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <div className="character-avatar-frame cq-profile-avatar-shell flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center rounded-full p-[3px]">
            <div className="cq-profile-avatar-inner cq-profile-avatar-inner--header">
              <AvatarDisplay
                avatar={character.avatar}
                fitParent
                size={82}
                className="rounded-full"
                classId={character.classId}
                starterWeapon={character.starterWeapon}
              />
            </div>
          </div>
          <span
            className="cq-profile-level-pip absolute -bottom-0.5 -left-0.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-uri-navy bg-uri-keaney px-1 text-[11px] font-bold leading-none text-white"
            aria-label={`Level ${character.level}`}
          >
            {character.level}
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold tracking-tight text-cq-foreground sm:text-2xl">
                {character.name}
              </h1>
              <p className="mt-0.5 truncate text-sm text-cq-muted">@{character.username}</p>
            </div>
            {isOwner && onOpenMenu ? (
              <button
                type="button"
                onClick={onOpenMenu}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Profile options"
              >
                <span className="text-lg leading-none" aria-hidden>
                  ⋯
                </span>
              </button>
            ) : null}
          </div>

          {title ? (
            <p className="mt-1.5 text-sm font-medium text-uri-gold/95">
              {title}
              {realm && title !== getClassTitle(character.classId) ? (
                <span className="font-normal text-cq-muted"> · {realm}</span>
              ) : null}
            </p>
          ) : realm ? (
            <p className="mt-1.5 text-sm text-cq-muted">{realm}</p>
          ) : null}
          {guildLabel ? (
            <p className="mt-1 text-xs font-medium text-cq-muted">{guildLabel}</p>
          ) : null}

          {character.streakDays >= 3 ? (
            <p className="mt-1 text-xs font-semibold text-uri-gold">{formatStreakBadge(character.streakDays)}</p>
          ) : null}
        </div>
      </div>

      {character.bio ? (
        <p className="mt-3 break-words text-sm leading-relaxed text-cq-foreground">{character.bio}</p>
      ) : isOwner ? (
        <button
          type="button"
          onClick={onEditBio}
          className="mt-3 text-sm font-medium text-uri-keaney hover:text-uri-keaney/80"
        >
          + Add bio
        </button>
      ) : null}

      <div className="mt-4">
        <div className="mb-1 flex justify-between gap-2 text-[11px] font-medium tabular-nums text-cq-muted">
          <span>Level {character.level}</span>
          <span>{character.totalXP.toLocaleString()} XP</span>
        </div>
        <div className="xp-bar-track h-2 overflow-hidden rounded-full">
          <div className="xp-bar-fill h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${xpPct}%` }} />
        </div>
        <p className="mt-1 text-[10px] tabular-nums text-cq-subtle">
          {current.toLocaleString()} / {needed.toLocaleString()} XP to level {character.level + 1}
        </p>
      </div>
    </header>
  );
}
