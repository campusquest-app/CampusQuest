"use client";

import type { Character } from "@/lib/types";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { getEquippedTitleLabel } from "@/lib/achievementEngine";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { formatStreakBadge } from "@/lib/streakMessaging";
import { BadgeCheck, ChevronDown, Pencil } from "lucide-react";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export function ProfileSocialHeader({
  character,
  isOwner,
  guildLabel,
  onEditBio,
  onOpenMenu,
  onSwitchIdentity,
  onEditAvatar,
  identityVerified = false,
  identitySubtitle,
  schoolAffiliation,
  showLevel = true,
}: {
  character: Character;
  isOwner: boolean;
  /** Verified school name (owner only, from school verification). Never inferred. */
  schoolAffiliation?: string | null;
  guildLabel?: string | null;
  onEditBio?: () => void;
  onOpenMenu?: () => void;
  onSwitchIdentity?: () => void;
  /** Own profile only. Opens the shared Avatar Lab. */
  onEditAvatar?: () => void;
  identityVerified?: boolean;
  identitySubtitle?: string | null;
  showLevel?: boolean;
}) {
  const showProgression = FEATURE_FLAGS.progression && showLevel;
  const title = showProgression ? getEquippedTitleLabel(character) || getClassTitle(character.classId) : "";
  const realm = showProgression ? getClassRealm(character.classId) : "";

  const avatarInteractive = Boolean(onEditAvatar || onSwitchIdentity);
  const avatarLabel = onEditAvatar ? "Edit avatar" : onSwitchIdentity ? "Switch profile" : undefined;
  const avatarClass = `relative flex-shrink-0 ${!onEditAvatar && onSwitchIdentity ? "cq-profile-switch-hit" : ""}`;
  const avatarBody = (
    <>
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
      {onEditAvatar ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-uri-navy bg-uri-keaney text-white shadow-md"
          aria-hidden
        >
          <Pencil className="h-3 w-3" strokeWidth={2.4} />
        </span>
      ) : null}
      {showProgression ? (
        <span
          className="cq-profile-level-pip absolute -bottom-0.5 -left-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-uri-navy bg-uri-keaney px-1 text-[10px] font-bold leading-none text-white"
          aria-label={`Level ${character.level}`}
        >
          {character.level}
        </span>
      ) : null}
    </>
  );

  return (
    <header className="cq-profile-header cq-profile-fade-in">
      <div className="cq-profile-header-row">
        {avatarInteractive ? (
          <button
            type="button"
            className={avatarClass}
            onClick={onEditAvatar ?? onSwitchIdentity}
            aria-label={avatarLabel}
          >
            {avatarBody}
          </button>
        ) : (
          <div className={avatarClass}>{avatarBody}</div>
        )}

        <div className="cq-profile-identity min-w-0 flex-1">
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
              {schoolAffiliation && !identitySubtitle ? (
                <p className="cq-profile-affiliation">
                  <BadgeCheck className="cq-profile-affiliation-icon" aria-hidden />
                  <span className="truncate">{schoolAffiliation}</span>
                  <span className="sr-only">(verified)</span>
                </p>
              ) : null}
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

          {showProgression && (guildLabel || character.streakDays >= 3) ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {guildLabel ? <span className="cq-profile-meta-chip">{guildLabel}</span> : null}
              {character.streakDays >= 3 ? (
                <span className="cq-profile-meta-chip cq-profile-meta-chip--streak">
                  {formatStreakBadge(character.streakDays)}
                </span>
              ) : null}
            </div>
          ) : null}

          {character.bio ? (
            <p className="cq-profile-bio break-words">{character.bio}</p>
          ) : isOwner && onEditBio ? (
            <button
              type="button"
              onClick={onEditBio}
              className="cq-profile-press cq-profile-bio-add text-uri-keaney hover:text-uri-keaney/80"
            >
              + Add bio
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
