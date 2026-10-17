"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import type { Character } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, MAX_STAT } from "@/lib/types";
import { getCharacterStatBarFills, CHARACTER_STAT_BAR_MAX } from "@/lib/statBarDisplay";
import { StatIcon } from "@/components/stats/StatIcon";
import { CharacterStatBar } from "@/components/stats/CharacterStatBar";
import { ScaledProgressBar } from "@/components/ui/ScaledProgressBar";
import { xpProgressInLevel } from "@/lib/level";
import { prestigeStat } from "@/lib/store";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { getGuildById } from "@/lib/guildStore";
import { AvatarDisplay } from "./AvatarDisplay";
import { AvatarLabDialog } from "./profile/AvatarLabDialog";
import { AchievementShowcaseModal } from "./achievements/AchievementShowcaseModal";
import { EquipmentStrip } from "./EquipmentStrip";
import { getEquippedTitleLabel } from "@/lib/achievementEngine";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export function CharacterCard({
  character,
  onRefresh,
  readOnly = false,
  onOpenLeaderboard,
}: {
  character: Character;
  onRefresh?: () => void;
  readOnly?: boolean;
  onOpenLeaderboard?: () => void;
}) {
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [showAchievementShowcase, setShowAchievementShowcase] = useState(false);
  const equippedTitle = getEquippedTitleLabel(character);
  const { current, needed } = xpProgressInLevel(character.totalXP);
  const xpPct = Math.min(100, (current / needed) * 100);
  const statBarFills = getCharacterStatBarFills(character.stats);

  function openEditModal() {
    setEditingAvatar(true);
  }

  return (
    <div className="cq-character-sheet pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
      <header className="px-3 pb-4 pt-3 sm:px-4">
        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            <div
              className="character-avatar-frame cq-profile-avatar-shell cq-soft-breathe flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center rounded-full p-[3px]"
              aria-hidden
            >
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
              className="cq-profile-level-pip cq-soft-breathe absolute -bottom-0.5 -right-0.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-uri-navy bg-uri-keaney px-1 text-[11px] font-bold leading-none text-white"
              aria-hidden
            >
              {character.level}
            </span>
            {!readOnly ? (
              <button
                type="button"
                onClick={openEditModal}
                className="absolute -bottom-0.5 left-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-uri-navy bg-uri-keaney text-xs text-white shadow-md hover:bg-uri-keaney/90"
                aria-label="Open Avatar Lab"
                title="Avatar Lab"
              >
                ✏️
              </button>
            ) : null}
            <AvatarLabDialog
              character={character}
              open={editingAvatar}
              onClose={() => setEditingAvatar(false)}
              onSaved={onRefresh}
            />
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
                {character.name}
              </h1>
              <span className="rounded-md border border-uri-keaney/40 bg-uri-keaney/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-uri-keaney">
                LEVEL {character.level}
              </span>
            </div>
            {(character.guildIds ?? []).length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {(character.guildIds ?? []).map((gid) => {
                  const g = getGuildById(gid);
                  return g ? (
                    <span key={gid} className="inline-flex items-center gap-1 text-[11px] font-medium text-white/55">
                      {g.crest} {g.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            {character.classId && (getClassTitle(character.classId) || getClassRealm(character.classId)) && (
              <p className="mt-1.5 truncate text-sm font-medium text-uri-gold/95">
                {getClassTitle(character.classId)}
                {getClassRealm(character.classId) && (
                  <span className="font-normal text-white/55"> · {getClassRealm(character.classId)}</span>
                )}
              </p>
            )}
            <p className="mt-0.5 text-sm text-white/50">@{character.username}</p>
            {!readOnly ? (
              <button
                type="button"
                onClick={openEditModal}
                className="mt-2 inline-flex min-h-[40px] items-center rounded-xl border border-uri-keaney/40 bg-uri-keaney/15 px-3 py-1.5 text-xs font-semibold text-uri-keaney hover:bg-uri-keaney/25"
              >
                Avatar Lab
              </button>
            ) : null}
            {equippedTitle ? (
              <p className="mt-1.5 font-display text-xs font-semibold uppercase tracking-wide text-uri-gold/90">
                {equippedTitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between gap-2 text-[11px] font-medium tabular-nums text-white/55">
            <span>{character.totalXP.toLocaleString()} XP</span>
            <span>Next level: {(needed - current).toLocaleString()} XP</span>
          </div>
          <ScaledProgressBar
            percent={xpPct}
            trackClassName="cq-character-xp-track"
            fillClassName="cq-character-xp-fill"
            animationKey={`${character.id}:${character.totalXP}`}
            sparkle
            role="progressbar"
            aria-valuenow={current}
            aria-valuemin={0}
            aria-valuemax={needed}
            aria-label={`${current} of ${needed} XP this level`}
          />
          <p className="mt-1 text-[10px] tabular-nums text-white/45">
            {current.toLocaleString()} / {needed.toLocaleString()} XP this level
          </p>
        </div>
      </header>

      {!readOnly ? (
        <div className="border-b border-white/10 px-3 pb-4 sm:px-4">
          <div className={`grid gap-2 ${onOpenLeaderboard ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={() => setShowAchievementShowcase(true)}
              className="cq-achievement-cta cq-pulse-glow cq-tap-press w-full rounded-xl border border-uri-gold/35 bg-uri-gold/10 px-4 py-2.5 text-sm font-semibold text-uri-gold transition-colors hover:bg-uri-gold/15"
            >
              Achievement Showcase
            </button>
            {onOpenLeaderboard ? (
              <button
                type="button"
                onClick={onOpenLeaderboard}
                className="cq-tap-press w-full rounded-xl border border-uri-keaney/35 bg-uri-keaney/10 px-4 py-2.5 text-sm font-semibold text-uri-keaney transition-colors hover:bg-uri-keaney/15"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Trophy className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Leaderboard
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <AchievementShowcaseModal
        character={character}
        open={showAchievementShowcase}
        onClose={() => setShowAchievementShowcase(false)}
      />

      <section className="border-b border-white/10 px-3 py-4 sm:px-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-base" aria-hidden>⚔️</span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-uri-keaney/90">Stats</h2>
        </div>
        <div className="grid gap-2.5">
          {STAT_KEYS.map((key, index) => {
            const value = character.stats[key] ?? 0;
            const pct = value >= MAX_STAT ? 100 : statBarFills[key];
            const atMax = value >= MAX_STAT;
            const prestigeCount = character.statPrestige?.[key] ?? 0;
            return (
              <div
                key={key}
                className="stat-card-row flex items-center gap-3 rounded-xl border border-cq-border bg-cq-elevated/80 px-2.5 py-2.5 sm:px-3"
              >
                <StatIcon stat={key} size="sm" label={STAT_LABELS[key]} />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-white/70">
                      {STAT_LABELS[key]}
                      {prestigeCount > 0 && (
                        <span className="rounded-md border border-uri-gold/40 bg-uri-gold/25 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-uri-gold">
                          {prestigeCount}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`font-mono font-semibold tabular-nums ${atMax ? "text-uri-gold" : "text-white"}`}>
                        {value}
                        <span className="text-white/40"> / {CHARACTER_STAT_BAR_MAX}</span>
                        {atMax && " ★"}
                      </span>
                      {atMax && onRefresh && !readOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            if (prestigeStat(character.id, key)) onRefresh();
                          }}
                          className="rounded-lg border border-uri-gold/50 bg-uri-gold/20 px-2 py-1 text-[10px] font-semibold text-uri-gold transition-colors hover:bg-uri-gold/30"
                        >
                          Prestige
                        </button>
                      )}
                    </span>
                  </div>
                  <CharacterStatBar
                    stat={key}
                    fillPercent={pct}
                    index={index}
                    prestigeMax={atMax}
                    animationKey={`${character.id}:${value}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!readOnly && FEATURE_FLAGS.equipment ? (
        <section className="px-3 py-4 sm:px-4">
          <EquipmentStrip character={character} onRefresh={onRefresh} />
        </section>
      ) : null}
    </div>
  );
}
