"use client";

import type { Character } from "@/lib/types";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { getEquippedTitleLabel } from "@/lib/achievementEngine";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { formatStreakBadge } from "@/lib/streakMessaging";
import { ChevronDown } from "lucide-react";

export function ProfileSocialHeader({
  character,
  isOwner,
  guildLabel,
  onEditBio,
  onOpenMenu,
  onSwitchIdentity,
  identityVerified = false,
  identitySubtitle,
  showLevel = true,
}: {
  character: Character;
  isOwner: boolean;
  guildLabel?: string | null;
  onEditBio?: () => void;
  onOpenMenu?: () => void;
  onSwitchIdentity?: () => void;
  identityVerified?: boolean;
  identitySubtitle?: string | null;
  showLevel?: boolean;
}) {
  const title = getEquippedTitleLabel(character) || getClassTitle(character.classId);
  const realm = getClassRealm(character.classId);

  return (
    <header className="cq-profile-header cq-profile-fade-in">
      <div className="cq-profile-header-row">
        <button
          type="button"
          className={`relative flex-shrink-0 ${onSwitchIdentity ? "cq-profile-switch-hit" : ""}`}
          onClick={onSwitchIdentity}
          disabled={!onSwitchIdentity}
          aria-label={onSwitchIdentity ? "Switch profile" : undefined}
        >
          <div className="character-avatar-frame cq-profile-avatar-shell cq-profile-avatar-shell--header flex shrink-0 items-center justify-center rounded-full">
            <div className="cq-profile-avatar-inner cq-profile-avatar-inner--header">
              <AvatarDisplay
                avatar={character.avatar}
                fitParent
                size={66}
                className="rounded-full"
                classId={character.classId}
                starterWeapon={character.starterWeapon}
              />
            </div>
          </div>
          {showLevel ? (
            <span
              className="cq-profile-level-pip absolute -bottom-0.5 -left-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-uri-navy bg-uri-keaney px-1 text-[10px] font-bold leading-none text-white"
              aria-label={`Level ${character.level}`}
            >
              {character.level}
            </span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                className={`cq-profile-switch-name ${onSwitchIdentity ? "cq-profile-switch-name--btn" : ""}`}
                onClick={onSwitchIdentity}
                disabled={!onSwitchIdentity}
              >
                <h1 className="cq-profile-username truncate font-display">
                  {character.name}
                  {identityVerified ? <span className="cq-identity-badge" aria-label="Verified">✓</span> : null}
                </h1>
                {onSwitchIdentity ? <ChevronDown className="cq-profile-switch-chevron" aria-hidden /> : null}
              </button>
              <p className="cq-profile-handle truncate">@{character.username}</p>
              {identitySubtitle ? <p className="cq-profile-rank truncate">{identitySubtitle}</p> : title ? (
                <p className="cq-profile-rank truncate">
                  {title}
                  {realm && title !== getClassTitle(character.classId) ? (
                    <span className="cq-profile-rank-realm"> · {realm}</span>
                  ) : null}
                </p>
              ) : realm ? (
                <p className="cq-profile-rank truncate">{realm}</p>
              ) : null}
            </div>
            {isOwner && onOpenMenu ? (
              <button
                type="button"
                onClick={onOpenMenu}
                className="cq-profile-press flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
                aria-label="Profile options"
              >
                <span className="text-lg leading-none" aria-hidden>
                  ⋯
                </span>
              </button>
            ) : null}
          </div>

          {guildLabel || character.streakDays >= 3 ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {guildLabel ? <span className="cq-profile-meta-chip">{guildLabel}</span> : null}
              {character.streakDays >= 3 ? (
                <span className="cq-profile-meta-chip cq-profile-meta-chip--streak">
                  {formatStreakBadge(character.streakDays)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {character.bio ? (
        <p className="cq-profile-bio break-words">{character.bio}</p>
      ) : isOwner ? (
        <button
          type="button"
          onClick={onEditBio}
          className="cq-profile-press cq-profile-bio-add text-sm font-medium text-uri-keaney hover:text-uri-keaney/80"
        >
          + Add bio
        </button>
      ) : null}
    </header>
  );
}
