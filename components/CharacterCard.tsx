"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/types";
import { STAT_KEYS, STAT_LABELS, MAX_STAT } from "@/lib/types";
import { getCharacterStatBarFills, CHARACTER_STAT_BAR_MAX } from "@/lib/statBarDisplay";
import { StatIcon } from "@/components/stats/StatIcon";
import { CharacterStatBar } from "@/components/stats/CharacterStatBar";
import { ScaledProgressBar } from "@/components/ui/ScaledProgressBar";
import { xpProgressInLevel } from "@/lib/level";
import { updateCharacter, prestigeStat } from "@/lib/store";
import { registerLogoutPrepare } from "@/lib/client/logoutPrepare";
import { parseDiceBearAvatar, getDefaultDiceBearAvatar, serializeDiceBearAvatar } from "@/lib/dicebearAvatar";
import { getClassTitle, getClassRealm } from "@/lib/characterClasses";
import { getGuildById } from "@/lib/guildStore";
import { AvatarDisplay } from "./AvatarDisplay";
import { AvatarBuilder } from "./AvatarBuilder";
import { AchievementShowcaseModal } from "./achievements/AchievementShowcaseModal";
import { EquipmentStrip } from "./EquipmentStrip";
import { getEquippedTitleLabel } from "@/lib/achievementEngine";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export function CharacterCard({
  character,
  onRefresh,
  readOnly = false,
}: {
  character: Character;
  onRefresh?: () => void;
  readOnly?: boolean;
}) {
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editingAvatarValue, setEditingAvatarValue] = useState(character.avatar);
  const [showAchievementShowcase, setShowAchievementShowcase] = useState(false);
  const equippedTitle = getEquippedTitleLabel(character);
  const { current, needed } = xpProgressInLevel(character.totalXP);
  const xpPct = Math.min(100, (current / needed) * 100);
  const statBarFills = getCharacterStatBarFills(character.stats);

  useEffect(() => {
    return registerLogoutPrepare(() => {
      if (!editingAvatar) return;
      updateCharacter({ avatar: editingAvatarValue });
    });
  }, [editingAvatar, editingAvatarValue]);

  function openEditModal() {
    const existing = parseDiceBearAvatar(character.avatar);
    setEditingAvatarValue(
      existing
        ? character.avatar
        : serializeDiceBearAvatar({
            ...getDefaultDiceBearAvatar(),
            seed: character.username.trim() || "campusquest-hero",
          }),
    );
    setEditingAvatar(true);
  }

  function handleAvatarSave() {
    updateCharacter({ avatar: editingAvatarValue });
    setEditingAvatar(false);
    onRefresh?.();
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
            {editingAvatar && typeof document !== "undefined" && createPortal(
              <div
                className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
                onClick={(e) => e.target === e.currentTarget && setEditingAvatar(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Avatar Lab"
              >
                <div className="absolute inset-0 bg-black/85" aria-hidden onClick={() => setEditingAvatar(false)} />
                <div className="relative z-10 flex max-h-[min(92dvh,100%)] w-full max-w-xl flex-col rounded-t-3xl border border-uri-keaney/30 bg-uri-navy shadow-xl shadow-black/50 sm:max-h-[88vh] sm:rounded-2xl lg:max-w-3xl">
                  <div className="shrink-0 border-b border-white/10 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
                    <h2 className="font-display text-lg font-bold text-white sm:text-xl">Avatar Lab</h2>
                    <p className="mt-1 text-sm text-white/60">
                      Customize presets, colors, hair, face, and more — then save your look.
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                    <div className="sticky top-0 z-10 shrink-0 border-b border-white/10 bg-uri-navy px-4 py-4 sm:px-5 lg:static lg:w-56 lg:border-b-0 lg:border-r lg:py-5">
                      <div className="flex flex-col items-center text-center">
                        <div className="rounded-2xl border border-white/15 bg-white/5 p-3 shadow-inner">
                          <AvatarDisplay avatar={editingAvatarValue} size={120} />
                        </div>
                        <p className="mt-3 text-xs text-white/55">Preview your avatar before saving.</p>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
                      <AvatarBuilder
                        value={editingAvatarValue}
                        onChange={setEditingAvatarValue}
                        compact
                        hidePreview
                        showClassPresets
                        selectedClassId={
                          character.classId === "gym" ||
                          character.classId === "knight" ||
                          character.classId === "mage" ||
                          character.classId === "bard" ||
                          character.classId === "rogue"
                            ? character.classId
                            : null
                        }
                        selectedWeapon={character.starterWeapon ?? null}
                        onWeaponChange={(weaponId) => {
                          updateCharacter({ starterWeapon: weaponId ?? undefined });
                        }}
                        onClassChange={(classId) => {
                          if (classId) updateCharacter({ classId });
                        }}
                        preview={{
                          displayName: character.name,
                          username: character.username,
                          level: character.level,
                          totalXp: character.totalXP,
                          classLabel:
                            [getClassTitle(character.classId), getClassRealm(character.classId)]
                              .filter(Boolean)
                              .join(" · ") || "Adventurer",
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 border-t border-white/10 bg-uri-navy/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-5">
                    <button
                      type="button"
                      onClick={() => setEditingAvatar(false)}
                      className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAvatarSave}
                      className="flex-1 rounded-xl bg-uri-keaney py-3 text-sm font-semibold text-uri-navy hover:bg-uri-keaney/90"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
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
          <button
            type="button"
            onClick={() => setShowAchievementShowcase(true)}
            className="cq-achievement-cta cq-pulse-glow cq-tap-press w-full rounded-xl border border-uri-gold/35 bg-uri-gold/10 px-4 py-2.5 text-sm font-semibold text-uri-gold transition-colors hover:bg-uri-gold/15"
          >
            Achievement Showcase
          </button>
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
